import consola from "consola"
import fs from "node:fs/promises"
import path from "node:path"
import { z } from "zod"

import { deepSeekCodexModels } from "~/providers/deepseek/models"

import type { ModelSource, PublishedModels } from "./model-sources"

import { HTTPError } from "./error"
import { addModelSeparators, isModelSeparator } from "./model-separators"
import { formatSourceModel, parseSourceModel } from "./model-sources"

const CATALOG_URL =
  "https://raw.githubusercontent.com/openai/codex/refs/heads/main/codex-rs/models-manager/models.json"

const catalogSchema = z.looseObject({
  models: z.array(z.looseObject({ slug: z.string().min(1) })),
})

/**
 * Capability fields `/models` republishes for a Codex passthrough model. The
 * catalog carries far more (tool modes, plan availability, instructions), and
 * none of it changes routing: this whitelist only helps a client describe a
 * model it is already able to select.
 */
const codexCapabilitySchema = z.object({
  context_window: z.number().optional().catch(undefined),
  default_reasoning_level: z.string().optional().catch(undefined),
  description: z.string().optional().catch(undefined),
  display_name: z.string().optional().catch(undefined),
  input_modalities: z.array(z.string()).optional().catch(undefined),
  max_context_window: z.number().optional().catch(undefined),
  supported_reasoning_levels: z
    .array(z.looseObject({ effort: z.string() }))
    .optional()
    .catch(undefined),
  supports_parallel_tool_calls: z.boolean().optional().catch(undefined),
})

export interface CodexModelCapabilities {
  context_window?: number
  default_reasoning_level?: string
  description?: string
  display_name?: string
  input_modalities?: Array<string>
  max_context_window?: number
  supported_reasoning_levels?: Array<{ effort: string }>
  supports_parallel_tool_calls?: boolean
}

export type CodexCatalogEntry = Record<string, unknown>

export interface CodexCatalogOptions {
  outputFile: string
  customFiles: Array<string>
  upstreamCacheFile?: string
  deepSeekModels?: Array<string>
}

/**
 * Copies the capability fields an entry actually carries, so a partially
 * described or malformed catalog never injects invalid metadata into
 * `/models`. Each field is validated on its own; bad values become absent.
 */
export function codexModelCapabilities(
  entry: CodexCatalogEntry | undefined,
): CodexModelCapabilities {
  // Typed as unknown so this stays a runtime (not just type-level) check.
  const parsed: Record<string, unknown> = codexCapabilitySchema.parse(
    entry ?? {},
  )
  return Object.fromEntries(
    Object.entries(parsed).filter(([, value]) => value !== undefined),
  ) as CodexModelCapabilities
}

const readCatalogPayload = async (
  file: string,
): Promise<z.infer<typeof catalogSchema> | undefined> => {
  const text = await fs.readFile(file, "utf8").catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined
    throw error
  })
  if (text === undefined) return undefined

  return catalogSchema.parse(JSON.parse(text))
}

/**
 * Reads the generated Codex catalog for descriptive metadata. A missing or
 * malformed file yields no metadata instead of failing the request: the
 * catalog describes models, it never decides what the gateway routes.
 */
export async function loadCodexCatalog(
  file: string,
): Promise<Map<string, CodexCatalogEntry>> {
  try {
    const parsed = catalogSchema.parse(
      // eslint-disable-next-line unicorn/prefer-json-parse-buffer
      JSON.parse(await fs.readFile(file, "utf8")),
    )
    return new Map(parsed.models.map((model) => [model.slug, model]))
  } catch {
    return new Map()
  }
}

/**
 * Publishes the models this gateway can actually serve. Identity and routing
 * fields come from configuration, so a catalog entry can only ever add
 * descriptive metadata to the model it already describes.
 */
export function buildCodexModelEntries(
  models: Array<string>,
  catalog: Map<string, CodexCatalogEntry>,
): Array<Record<string, unknown>> {
  return models.map((id) => {
    const capabilities = codexModelCapabilities(catalog.get(id))
    return {
      ...capabilities,
      id,
      object: "model",
      type: "model",
      created: 0,
      created_at: new Date(0).toISOString(),
      owned_by: "codex",
      display_name: capabilities.display_name ?? id,
    }
  })
}

/**
 * Codex only offers models its `model_catalog_json` describes, so a passthrough
 * model without a catalog entry is routable but invisible in the App picker.
 * Reports those ids; the caller decides how loudly to say so.
 */
export async function findCodexCatalogGaps(
  models: Array<string>,
  catalogFile: string,
): Promise<Array<string>> {
  const catalog = await loadCodexCatalog(catalogFile)
  return models.filter((model) => !catalog.has(model))
}

/**
 * The model definitions the source suffixes are derived from, kept separate
 * from the generated catalog so suffixes are never applied twice.
 */
export interface BaseCatalog {
  /** Slugs that exist beyond the official catalog. */
  customModels: Array<string>
  entries: Map<string, CodexCatalogEntry>
  /** Catalog ids owned by another provider, such as DeepSeek entries. */
  extensionModels: Array<string>
  /** Top-level catalog fields other than `models`, preserved on write. */
  metadata: Record<string, unknown>
  /** Official catalog slugs, in catalog order. */
  officialModels: Array<string>
}

export interface LoadBaseCatalogOptions {
  customFiles: Array<string>
  /** Catalog entries served by another provider; never source-suffixed. */
  extensionModels?: Array<CodexCatalogEntry>
  upstreamCacheFile: string
}

/**
 * Loads the raw sources only. Custom definitions win over upstream ones, and
 * an entry for a slug the official catalog already describes stays official
 * so it keeps its suffix eligibility.
 */
export async function loadBaseCatalog(
  options: LoadBaseCatalogOptions,
): Promise<BaseCatalog> {
  const upstream = await readCatalogPayload(options.upstreamCacheFile)
  const entries = new Map<string, CodexCatalogEntry>()
  for (const model of upstream?.models ?? []) {
    entries.set(model.slug, model)
  }
  const officialModels = [...entries.keys()]

  const extensionModels = (options.extensionModels ?? []).map((model) => {
    const slug = String(model.slug)
    entries.set(slug, model)
    return slug
  })

  const customModels: Array<string> = []
  for (const file of options.customFiles) {
    const custom = await readCatalogPayload(file)
    if (custom === undefined) continue
    for (const model of custom.models) {
      if (!entries.has(model.slug)) customModels.push(model.slug)
      entries.set(model.slug, model)
    }
  }

  const metadata = Object.fromEntries(
    Object.entries(upstream ?? {}).filter(([key]) => key !== "models"),
  )

  return { customModels, entries, extensionModels, metadata, officialModels }
}

export interface RefreshUpstreamCatalogOptions {
  cacheFile: string
  url?: string
}

/**
 * Refreshes the raw official catalog and caches it. A failure keeps the cached
 * copy; an empty result means neither source was available, which the caller
 * has to treat as a missing base rather than an empty model list.
 */
export async function refreshUpstreamCatalog(
  options: RefreshUpstreamCatalogOptions,
): Promise<void> {
  try {
    const response = await fetch(options.url ?? CATALOG_URL, {
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok)
      throw new HTTPError("Failed to fetch the Codex model catalog", response)
    const payload = catalogSchema.parse(await response.json())
    await fs.mkdir(path.dirname(options.cacheFile), { recursive: true })
    await fs.writeFile(
      options.cacheFile,
      `${JSON.stringify(payload, null, 2)}\n`,
    )
  } catch (error) {
    consola.warn(
      "Could not refresh upstream Codex catalog; using local sources",
      error,
    )
  }
}

/**
 * Builds the catalog Codex reads. While source suffixes are published each
 * eligible base model appears once per provider that serves it, and entries
 * owned by another provider keep their own id.
 */
export function buildCatalogEntries(options: {
  base: BaseCatalog
  published: PublishedModels
}): Array<CodexCatalogEntry> {
  const { base, published } = options
  if (!published.suffixMode)
    return sortCatalogEntries([...base.entries.values()])

  const variantsByBase = new Map<string, Array<string>>()
  for (const entry of published.entries.values()) {
    const variants = variantsByBase.get(entry.baseModel) ?? []
    variants.push(entry.publicModel)
    variantsByBase.set(entry.baseModel, variants)
  }

  const extensions = new Set(base.extensionModels)
  const entries: Array<CodexCatalogEntry> = []
  for (const [slug, entry] of base.entries) {
    const variants = variantsByBase.get(slug)
    if (variants === undefined) {
      // A model no enabled provider serves is not advertised; extension
      // entries stay because another provider owns their id.
      if (extensions.has(slug)) entries.push(entry)
      continue
    }
    for (const variant of variants) {
      const source = parseSourceModel(variant)?.source
      const mapped: CodexCatalogEntry = {
        ...entry,
        slug: variant,
        display_name: published.entries.get(variant)?.displayName ?? variant,
      }
      remapSameSourceReferences(mapped, source, published)
      entries.push(mapped)
    }
  }
  return sortCatalogEntries(entries)
}

/** Keep the file order and Codex's priority-based picker order consistent. */
function sortCatalogEntries(
  entries: Array<CodexCatalogEntry>,
): Array<CodexCatalogEntry> {
  const rank = (entry: CodexCatalogEntry): number => {
    const slug = String(entry.slug)
    if (parseSourceModel(slug)?.source === "codex") return 0
    return slug.startsWith("deepseek-") ? 1 : 2
  }
  return entries
    .toSorted((a, b) => rank(a) - rank(b))
    .map((entry, index) => ({
      ...entry,
      ...(typeof entry.priority === "number" ? { priority: index + 1 } : {}),
    }))
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/**
 * Structured references such as `upgrade.model` must keep pointing at a model
 * the same source actually publishes. An unmappable reference is removed
 * rather than left dangling; free-form text is never rewritten.
 */
function remapSameSourceReferences(
  entry: CodexCatalogEntry,
  source: ModelSource | undefined,
  published: PublishedModels,
): void {
  if (source === undefined) return

  const remap = (value: unknown): string | undefined => {
    if (typeof value !== "string" || value.length === 0) return undefined
    const sameSource = formatSourceModel(value, source)
    if (published.entries.has(sameSource)) return sameSource
    return published.entries.has(value) ? value : undefined
  }

  if (typeof entry.auto_review_model_override === "string") {
    const remapped = remap(entry.auto_review_model_override)
    if (remapped === undefined) delete entry.auto_review_model_override
    else entry.auto_review_model_override = remapped
  }

  const upgrade = entry.upgrade
  if (!isRecord(upgrade) || typeof upgrade.model !== "string") return

  const remapped = remap(upgrade.model)
  if (remapped === undefined) delete entry.upgrade
  else entry.upgrade = { ...upgrade, model: remapped }
}

export interface WritePublishedCatalogOptions {
  base: BaseCatalog
  outputFile: string
  published: PublishedModels
}

/** Replaces the generated catalog atomically, after the sources were read. */
export async function writePublishedCatalog(
  options: WritePublishedCatalogOptions,
): Promise<void> {
  const models = buildCatalogEntries({
    base: options.base,
    published: options.published,
  })
  await writeCatalogFile(options.outputFile, {
    ...options.base.metadata,
    models: addModelSeparators(
      models.filter((entry) => !isModelSeparator(String(entry.slug))),
      (entry) =>
        parseSourceModel(String(entry.slug))?.source
        ?? (String(entry.slug).startsWith("deepseek-") ?
          "deepseek"
        : "copilot"),
      (entry, id) => ({
        ...entry,
        slug: id,
        display_name: id,
        description: "Section separator — select a model below",
        visibility: "list",
        upgrade: null,
        auto_review_model_override: null,
      }),
    ).map((entry, index) => ({ ...entry, priority: index + 1 })),
  })
  consola.info(
    `Updated Codex model catalog: ${options.outputFile} (${models.length} models)`,
  )
}

async function writeCatalogFile(
  outputFile: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const temporary = `${outputFile}.${process.pid}.tmp`
  await fs.mkdir(path.dirname(outputFile), { recursive: true })
  await fs.writeFile(temporary, `${JSON.stringify(payload, null, 2)}\n`)
  await fs.rename(temporary, outputFile)
}

export async function refreshCodexModels(
  input: string | CodexCatalogOptions,
): Promise<void> {
  const legacy = typeof input === "string"
  const output =
    legacy ? path.join(input, "codex-models.json") : input.outputFile
  const directory = path.dirname(output)
  const customFiles =
    legacy ? [path.join(input, "codex-models-custom.json")] : input.customFiles
  const cacheFile =
    legacy ? undefined : (
      (input.upstreamCacheFile
      ?? path.join(directory, "codex-models-upstream.json"))
    )
  const temporary = `${output}.${process.pid}.tmp`

  try {
    const customModels: Array<Record<string, unknown>> = []
    for (const customPath of customFiles) {
      const customText = await fs
        .readFile(customPath)
        .catch((error: unknown) => {
          if (legacy && (error as NodeJS.ErrnoException).code === "ENOENT")
            return undefined
          throw error
        })
      if (customText !== undefined) {
        customModels.push(
          ...catalogSchema.parse(JSON.parse(customText.toString("utf8")))
            .models,
        )
      }
    }
    let upstream: z.infer<typeof catalogSchema>
    try {
      const response = await fetch(CATALOG_URL, {
        signal: AbortSignal.timeout(10_000),
      })
      if (!response.ok)
        throw new HTTPError("Failed to fetch the Codex model catalog", response)
      upstream = catalogSchema.parse(await response.json())
      if (cacheFile !== undefined) {
        await fs.mkdir(path.dirname(cacheFile), { recursive: true })
        await fs.writeFile(cacheFile, `${JSON.stringify(upstream, null, 2)}\n`)
      }
    } catch (error) {
      if (cacheFile === undefined) throw error
      upstream = await fs
        .readFile(cacheFile, "utf8")
        .then((text) => catalogSchema.parse(JSON.parse(text)))
        .catch(() => ({ models: [] }))
      consola.warn(
        "Could not refresh upstream Codex catalog; using local sources",
        error,
      )
    }
    const enabledDeepSeek =
      legacy ?
        []
      : deepSeekCodexModels.filter((model) =>
          input.deepSeekModels?.includes(String(model.slug)),
        )
    const models = new Map(
      [...upstream.models, ...enabledDeepSeek, ...customModels].map((model) => [
        model.slug,
        model,
      ]),
    )

    await fs.mkdir(directory, { recursive: true })
    await fs.writeFile(
      temporary,
      `${JSON.stringify({ ...upstream, models: [...models.values()] }, null, 2)}\n`,
    )
    await fs.rename(temporary, output)
    consola.info(
      `Updated Codex model catalog: ${output} (${models.size} models)`,
    )
  } catch (error) {
    consola.warn(
      "Could not refresh Codex model catalog; existing catalog kept",
      error,
    )
    await fs.rm(temporary, { force: true }).catch((cleanupError: unknown) => {
      consola.warn(
        "Could not remove temporary Codex model catalog",
        cleanupError,
      )
    })
  }
}
