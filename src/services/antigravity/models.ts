/** Antigravity encodes the thinking budget in its upstream model id. */
export const ANTIGRAVITY_CODEX_MODEL = "gemini-3.8-flash-tiered"

export const antigravityCodexModels: Array<Record<string, unknown>> = [
  {
    slug: ANTIGRAVITY_CODEX_MODEL,
    display_name: "Gemini 3.8 Flash",
    description: "Antigravity Gemini 3.8 Flash with selectable reasoning depth",
    prefer_websockets: false,
    support_verbosity: true,
    default_verbosity: "low",
    apply_patch_tool_type: "freeform",
    input_modalities: ["text"],
    truncation_policy: { mode: "tokens", limit: 10_000 },
    supports_parallel_tool_calls: true,
    tool_mode: null,
    multi_agent_version: "v2",
    use_responses_lite: false,
    include_skills_usage_instructions: false,
    auto_review_model_override: null,
    auto_compact_token_limit: null,
    reasoning_summary_format: "experimental",
    default_reasoning_summary: "none",
    default_reasoning_level: "medium",
    supported_reasoning_levels: [
      { effort: "low", description: "Fast responses with lighter reasoning" },
      { effort: "medium", description: "Balanced reasoning depth" },
      {
        effort: "high",
        description: "Extra high reasoning depth for complex problems",
      },
    ],
    shell_type: "shell_command",
    visibility: "list",
    minimal_client_version: "0.144.0",
    supported_in_api: true,
    availability_nux: null,
    upgrade: null,
    priority: 1,
    experimental_supported_tools: [],
    supports_reasoning_summaries: false,
    base_instructions: "You are Codex, an agent based on Gemini.",
  },
]
