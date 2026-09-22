/** Antigravity encodes the thinking budget in its upstream model id. */
export type AntigravityThinkingTier = "low" | "medium" | "high"
export const DEFAULT_ANTIGRAVITY_TIER: AntigravityThinkingTier = "medium"

export function resolveAntigravityUpstreamModel(effort?: string): string {
  if (effort === "low" || effort === "medium" || effort === "high") {
    return `gemini-3.8-flash-${effort}`
  }
  return `gemini-3.8-flash-${DEFAULT_ANTIGRAVITY_TIER}`
}

export const ANTIGRAVITY_DEFAULT_CREDENTIAL_PATH =
  "~/.cli-proxy-api/antigravity.json"

export const ANTIGRAVITY_CODEX_MODEL = "gemini-3.8-flash-tiered"
