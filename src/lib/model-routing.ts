import type { RuntimeConfig } from "./runtime-config"

import { modelAliases, resolveModelAlias } from "./model-aliases"

export type ModelProvider = "codex" | "copilot" | "deepseek"

export interface ModelRoute {
  provider: ModelProvider
  requestedModel: string
  upstreamModel: string
}

export function resolveModelRoute(
  model: string,
  config: RuntimeConfig,
): ModelRoute {
  if (config.providers.codex.models.includes(model)) {
    if (!config.providers.codex.enabled) {
      throw new Error(`Codex provider is disabled for model: ${model}`)
    }
    // Strict passthrough: the upstream receives the requested model verbatim.
    return { provider: "codex", requestedModel: model, upstreamModel: model }
  }
  if (config.providers.deepseek.models.includes(model)) {
    if (!config.providers.deepseek.enabled) {
      throw new Error(`DeepSeek provider is disabled for model: ${model}`)
    }
    return { provider: "deepseek", requestedModel: model, upstreamModel: model }
  }
  if (model.startsWith("deepseek-")) {
    throw new Error(`DeepSeek model is not configured: ${model}`)
  }
  if (!config.providers.copilot.enabled) {
    throw new Error(`Model is not available: ${model}`)
  }
  return {
    provider: "copilot",
    requestedModel: model,
    upstreamModel: resolveModelAlias(model),
  }
}

/**
 * A model id must select exactly one upstream, otherwise a request could reach
 * a provider that never received the credentials it authenticates with. The
 * Copilot catalogue is only known after startup, so callers can pass it in.
 */
export function assertModelRoutingConflicts(
  config: RuntimeConfig,
  copilotModelIds: Iterable<string> = [],
): void {
  const codexModels = config.providers.codex.models
  if (!config.providers.codex.enabled) return

  const seen = new Set<string>()
  for (const model of codexModels) {
    if (seen.has(model)) {
      throw new Error(`Codex model is configured twice: ${model}`)
    }
    seen.add(model)
  }

  const deepseekModels = new Set(config.providers.deepseek.models)
  const copilotModels = new Set(copilotModelIds)
  for (const model of codexModels) {
    if (deepseekModels.has(model)) {
      throw new Error(
        `Model is configured for both the Codex and DeepSeek providers: ${model}`,
      )
    }
    if (Object.hasOwn(modelAliases, model)) {
      throw new Error(
        `Codex model collides with a Copilot model alias: ${model}`,
      )
    }
    if (copilotModels.has(model)) {
      throw new Error(
        `Model is served by both the Codex and Copilot providers: ${model}`,
      )
    }
  }
}
