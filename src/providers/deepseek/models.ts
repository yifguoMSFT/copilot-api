// Source: https://api-docs.deepseek.com/zh-cn/quick_start/agent_integrations/codex/
// Last checked: 2026-09-11. Kept in TypeScript so tsdown embeds it in dist.
export const deepSeekCodexModels: Array<Record<string, unknown>> = [
  {
    slug: "deepseek-flash",
    display_name: "DeepSeek Flash",
    description: "DeepSeek Responses model with text and image input",
    context_window: 128_000,
    input_modalities: ["text", "image"],
    supported_reasoning_levels: ["low", "medium", "high"],
  },
  {
    slug: "deepseek-v4-pro",
    display_name: "DeepSeek V4 Pro",
    description: "DeepSeek Responses reasoning model",
    context_window: 128_000,
    input_modalities: ["text"],
    supported_reasoning_levels: ["low", "medium", "high"],
  },
]
