import {
  CodexAuthRequiredError,
  CodexAuthUnavailableError,
} from "~/services/codex/auth-manager"

export function toCodexAuthErrorResponse(
  error: unknown,
  profile: string,
): Response | undefined {
  if (error instanceof CodexAuthRequiredError) {
    return codexErrorResponse(
      503,
      "codex_login_required",
      `No usable Codex credentials for profile "${profile}"; run the codex-auth login command`,
    )
  }

  if (error instanceof CodexAuthUnavailableError) {
    return codexErrorResponse(
      503,
      "codex_auth_unavailable",
      `Codex credentials for profile "${profile}" are temporarily unavailable`,
    )
  }

  return undefined
}

/**
 * Mirrors the local error envelope used by `forwardError`, plus a stable code
 * the client can branch on.
 */
function codexErrorResponse(
  status: number,
  code: string,
  message: string,
): Response {
  return new Response(
    JSON.stringify({ error: { code, message, type: "error" } }),
    {
      headers: { "content-type": "application/json" },
      status,
    },
  )
}
