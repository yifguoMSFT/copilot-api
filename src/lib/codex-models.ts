import consola from "consola"
import fs from "node:fs/promises"
import path from "node:path"
import { z } from "zod"

import { deepSeekCodexModels } from "~/providers/deepseek/models"

import { HTTPError } from "./error"

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
