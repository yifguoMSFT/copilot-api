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

export const deepSeekCodexModels: Array<Record<string, unknown>> = [
  {
    ...catalogDefaults,
    slug: "deepseek-flash",
    display_name: "DeepSeek Flash",
    description: "DeepSeek Responses model with text and image input",
    context_window: 128_000,
    input_modalities: ["text", "image"],
    default_reasoning_level: "high",
    supported_reasoning_levels: [
      { effort: "low", description: "Fast responses with lighter reasoning" },
      {
        effort: "high",
        description: "Extra high reasoning depth for complex problems",
      },
      {
        effort: "max",
        description: "Maximum reasoning depth for the hardest problems",
      },
    ],
  },
  {
    ...catalogDefaults,
    slug: "deepseek-v4-pro",
    display_name: "DeepSeek V4 Pro",
    description: "DeepSeek Responses reasoning model",
    context_window: 128_000,
    input_modalities: ["text"],
    default_reasoning_level: "high",
    supported_reasoning_levels: [
      { effort: "low", description: "Fast responses with lighter reasoning" },
      {
        effort: "high",
        description: "Extra high reasoning depth for complex problems",
      },
      {
        effort: "max",
        description: "Maximum reasoning depth for the hardest problems",
      },
    ],
  },
]
