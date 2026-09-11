import type { RuntimeConfig } from "./runtime-config"

import { resolveModelAlias } from "./model-aliases"

export interface ModelRoute {
  provider: "copilot" | "deepseek"
  requestedModel: string
  upstreamModel: string
}

export function resolveModelRoute(
  model: string,
  config: RuntimeConfig,
): ModelRoute {
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
