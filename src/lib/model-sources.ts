import type { CodexCatalogEntry } from "./codex-models"
import type { ModelProvider } from "./model-routing"
import type { RuntimeConfig } from "./runtime-config"

import { HttpStatusError } from "./error"
import { isModelAlias } from "./model-aliases"

/**
 * Source suffixes identify which upstream serves a model that more than one
 * provider can offer. They are part of the public model id, so the suffix only
 * appears while the Codex provider is enabled and never reaches an upstream.
 */
export const MODEL_SOURCE_SUFFIX = {
  codex: "(codex)",
  copilot: "(copilot)",
} as const

export type ModelSource = keyof typeof MODEL_SOURCE_SUFFIX

/** Publication order for a model both providers serve. */
export const MODEL_SOURCES: ReadonlyArray<ModelSource> = ["copilot", "codex"]

const sourceModelPattern = /^(?<base>.+)\((?<source>copilot|codex)\)$/
const sourceSuffixPattern = /\((?:copilot|codex)\)/i

export const formatSourceModel = (
  baseId: string,
  source: ModelSource,
): string => `${baseId}${MODEL_SOURCE_SUFFIX[source]}`

/** True for any id that carries, or claims to carry, a reserved suffix. */
export const containsSourceSuffix = (model: string): boolean =>
  sourceSuffixPattern.test(model)

export interface ParsedSourceModel {
  baseId: string
  source: ModelSource
}

/**
 * Splits a well-formed suffix id. Variants with the wrong case, a repeated
 * suffix, or an empty base are rejected here so callers can report an invalid
 * model instead of falling through to the default provider.
 */
export function parseSourceModel(model: string): ParsedSourceModel | undefined {
  const match = sourceModelPattern.exec(model)
  const baseId = match?.groups?.base
  const source = match?.groups?.source
  if (baseId === undefined || source === undefined) return undefined
  if (baseId.length === 0 || baseId.trim() !== baseId) return undefined
  if (containsSourceSuffix(baseId)) return undefined

  return { baseId, source: source as ModelSource }
}

/** Ids that would collide with a generated suffix id. */
export const findReservedSuffixConflicts = (
  ids: Iterable<string>,
): Array<string> => [...ids].filter((id) => containsSourceSuffix(id))

export interface PublishedModelRoute {
  provider: ModelProvider
  publicModel: string
  upstreamModel: string
}

export interface PublishedModelEntry extends PublishedModelRoute {
  /** Catalog id the suffix was derived from. */
  baseModel: string
  capabilities?: CodexCatalogEntry
  displayName?: string
}

export interface PublishedModels {
  entries: Map<string, PublishedModelEntry>
  /** True while `providers.codex.enabled` publishes source suffixes. */
  suffixMode: boolean
}

export interface BuildPublishedModelsInput {
  config: RuntimeConfig
  /** Catalog entries keyed by base id, used for descriptive metadata. */
  catalog?: Map<string, CodexCatalogEntry>
  /** Model ids the Copilot provider currently serves. */
  copilotModels?: Iterable<string>
  /** Catalog ids added beyond the official model set. */
  customModels?: Iterable<string>
  /** Official Codex catalog ids, in catalog order. */
  officialModels: Iterable<string>
}

const toUniqueList = (values: Iterable<string>): Array<string> => [
  ...new Set(values),
]

/**
 * Builds the public ids that exist while the Codex provider is enabled. Every
 * id a model could be requested by maps to exactly one upstream, so a request
 * never reaches a provider that was not configured for it.
 */
export function buildPublishedModels(
  input: BuildPublishedModelsInput,
): PublishedModels {
  const { config } = input
  const entries = new Map<string, PublishedModelEntry>()
  const suffixMode = config.providers.codex.enabled
  if (!suffixMode) return { entries, suffixMode }

  const official = toUniqueList(input.officialModels)
  const officialIds = new Set(official)
  const custom = toUniqueList(input.customModels ?? [])
  const deepSeekModels = new Set(config.providers.deepseek.models)
  const copilotModels = new Set(input.copilotModels ?? [])
  const whitelist = config.providers.codex.models

  const add = (entry: PublishedModelEntry): void => {
    if (entries.has(entry.publicModel)) {
      throw new HttpStatusError(
        500,
        `Model is published by more than one provider: ${entry.publicModel}`,
        "model_id_conflict",
      )
    }
    entries.set(entry.publicModel, entry)
  }

  const codexServes = (baseId: string): boolean => {
    if (deepSeekModels.has(baseId)) return false
    if (whitelist.length === 0) return officialIds.has(baseId)
    return whitelist.includes(baseId)
  }

  // An alias is a local shorthand for one upstream model, never a second
  // source, so publishing a suffixed copy of it would offer a duplicate.
  const isPublishableBase = (baseId: string): boolean =>
    !deepSeekModels.has(baseId)
    && !containsSourceSuffix(baseId)
    && !isModelAlias(baseId)

  for (const baseId of [...official, ...custom]) {
    if (!isPublishableBase(baseId)) continue

    const capabilities = input.catalog?.get(baseId)
    const displayName =
      typeof capabilities?.display_name === "string" ?
        capabilities.display_name
      : baseId

    for (const source of MODEL_SOURCES) {
      if (source === "copilot") {
        if (!config.providers.copilot.enabled) continue
        if (!copilotModels.has(baseId)) continue
      } else if (!codexServes(baseId)) {
        continue
      }

      add({
        baseModel: baseId,
        publicModel: formatSourceModel(baseId, source),
        provider: source,
        upstreamModel: baseId,
        displayName: `${displayName}${MODEL_SOURCE_SUFFIX[source]}`,
        ...(capabilities === undefined ? {} : { capabilities }),
      })
    }
  }

  return { entries, suffixMode }
}

/**
 * A configured Codex model must have a catalog definition, otherwise the
 * generated catalog would advertise a model with no metadata at all.
 */
export function findUnconfiguredCodexModels(
  config: RuntimeConfig,
  catalogIds: Iterable<string>,
): Array<string> {
  if (!config.providers.codex.enabled) return []

  const available = new Set(catalogIds)
  return config.providers.codex.models.filter(
    (model) =>
      !available.has(model) || config.providers.deepseek.models.includes(model),
  )
}
