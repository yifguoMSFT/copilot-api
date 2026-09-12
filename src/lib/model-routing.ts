import type { RuntimeConfig } from "./runtime-config"

import { HttpStatusError } from "./error"
import { resolveModelAlias } from "./model-aliases"
import {
  containsSourceSuffix,
  parseSourceModel,
  type ModelSource,
  type PublishedModels,
} from "./model-sources"

export type ModelProvider = "codex" | "copilot" | "deepseek"

export interface ModelRoute {
  provider: ModelProvider
  requestedModel: string
  upstreamModel: string
}

export function resolveModelRoute(
  model: string,
  config: RuntimeConfig,
  published?: PublishedModels,
): ModelRoute {
  // A published source-suffixed id decides both the upstream and the model the
  // upstream receives; anything else falls through to the legacy paths below.
  const publishedEntry = published?.entries.get(model)
  if (publishedEntry !== undefined) {
    return {
      provider: publishedEntry.provider,
      requestedModel: model,
      upstreamModel: publishedEntry.upstreamModel,
    }
  }

  const parsed = parseSourceModel(model)
  if (parsed === undefined) {
    if (containsSourceSuffix(model)) {
      throw new HttpStatusError(
        400,
        `Model id carries an invalid source suffix: ${model}`,
        "invalid_model",
      )
    }
  } else {
    assertSourceIsRoutable(parsed.source, model, { config, published })
  }

  if (config.providers.deepseek.models.includes(model)) {
    if (!config.providers.deepseek.enabled) {
      throw new HttpStatusError(
        400,
        `DeepSeek provider is disabled for model: ${model}`,
        "model_provider_disabled",
      )
    }
    return { provider: "deepseek", requestedModel: model, upstreamModel: model }
  }
  if (model.startsWith("deepseek-")) {
    throw new HttpStatusError(
      400,
      `DeepSeek model is not configured: ${model}`,
      "model_not_available",
    )
  }
  if (!config.providers.copilot.enabled) {
    throw new HttpStatusError(
      400,
      `Model is not available: ${model}`,
      "model_not_available",
    )
  }
  return {
    provider: "copilot",
    requestedModel: model,
    upstreamModel: resolveModelAlias(model),
  }
}

/**
 * A source suffix that is not in the published set still has to explain itself:
 * a disabled provider and a model the enabled provider cannot serve are
 * different failures for the client, and neither may silently fall back.
 */
function assertSourceIsRoutable(
  source: ModelSource,
  model: string,
  context: { config: RuntimeConfig; published?: PublishedModels },
): void {
  const { config, published } = context

  if (source === "codex" && !config.providers.codex.enabled) {
    throw new HttpStatusError(
      400,
      `Codex provider is disabled for model: ${model}`,
      "model_provider_disabled",
    )
  }
  // The Copilot suffix only exists to disambiguate a model that Codex can also
  // serve, so without the Codex provider the source is not published at all.
  if (source === "copilot" && published?.suffixMode !== true) {
    throw new HttpStatusError(
      400,
      `Copilot source suffix is only published while the Codex provider is enabled; select the unsuffixed model instead: ${model}`,
      "model_suffix_disabled",
    )
  }
  if (!config.providers[source].enabled) {
    throw new HttpStatusError(
      400,
      `${source} provider is disabled for model: ${model}`,
      "model_provider_disabled",
    )
  }
  throw new HttpStatusError(
    400,
    `Model is not available: ${model}`,
    "model_not_available",
  )
}

/**
 * A model id must select exactly one upstream, otherwise a request could reach
 * a provider that never received the credentials it authenticates with. Source
 * suffixes already separate the two providers that can offer the same base
 * model, so only genuinely ambiguous ids are rejected here.
 */
export function assertModelRoutingConflicts(config: RuntimeConfig): void {
  const providers = [
    ["Codex", config.providers.codex.models],
    ["DeepSeek", config.providers.deepseek.models],
  ] as const

  for (const [label, models] of providers) {
    const seen = new Set<string>()
    for (const model of models) {
      if (seen.has(model)) {
        throw new Error(`${label} model is configured twice: ${model}`)
      }
      seen.add(model)
      if (containsSourceSuffix(model)) {
        throw new Error(
          `${label} model must not carry a source suffix: ${model}`,
        )
      }
    }
  }
}
