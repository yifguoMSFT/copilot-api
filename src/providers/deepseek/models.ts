// Source: https://api-docs.deepseek.com/zh-cn/quick_start/agent_integrations/codex/
// Last checked: 2026-09-11. Kept in TypeScript so tsdown embeds it in dist.
// Required ModelInfo fields for Codex's model_catalog_json deserializer.
const catalogDefaults = {
  shell_type: "shell_command",
  visibility: "list",
  supported_in_api: true,
  priority: 1,
  base_instructions: "You are a coding assistant powered by DeepSeek.",
  supports_reasoning_summaries: false,
  support_verbosity: false,
  truncation_policy: { mode: "tokens", limit: 10_000 },
  experimental_supported_tools: [],
}

const deepSeekReasoningLevels = [
  { effort: "low", description: "Fast responses with lighter reasoning" },
  {
    effort: "high",
    description: "Extra high reasoning depth for complex problems",
  },
  {
    effort: "max",
    description: "Maximum reasoning depth for the hardest problems",
  },
]

export const deepSeekCodexModels: Array<Record<string, unknown>> = [
  {
    ...catalogDefaults,
    slug: "deepseek-flash",
    display_name: "DeepSeek Flash",
    description: "DeepSeek Responses model with text and image input",
    context_window: 128_000,
    input_modalities: ["text", "image"],
    default_reasoning_level: "high",
    supported_reasoning_levels: deepSeekReasoningLevels,
  },
  {
    ...catalogDefaults,
    slug: "deepseek-v4-pro",
    display_name: "DeepSeek V4 Pro",
    description: "DeepSeek Responses reasoning model",
    context_window: 128_000,
    input_modalities: ["text"],
    default_reasoning_level: "high",
    supported_reasoning_levels: deepSeekReasoningLevels,
  },
]

/**
 * Every id in `providers.deepseek.models` needs a catalog definition to appear
 * in Codex, so an id without a built-in definition falls back to the same
 * metadata shape. A codex-models-custom.json entry for the slug still wins.
 */
export function deepSeekCodexModel(slug: string): Record<string, unknown> {
  return (
    deepSeekCodexModels.find((model) => model.slug === slug) ?? {
      ...catalogDefaults,
      slug,
      display_name: slug,
      description: "DeepSeek Responses model",
      context_window: 128_000,
      input_modalities: ["text"],
      default_reasoning_level: "high",
      supported_reasoning_levels: deepSeekReasoningLevels,
    }
  )
}
