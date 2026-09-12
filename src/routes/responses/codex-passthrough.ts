import type { RuntimeConfig } from "~/lib/runtime-config"

import {
  CodexAuthRequiredError,
  CodexAuthUnavailableError,
} from "~/services/codex/auth-manager"

type CodexProviderConfig = RuntimeConfig["providers"]["codex"]

/**
 * Only Codex routes are protected by the gateway key; the existing
 * Copilot/DeepSeek callers keep their current reachability. The key never
 * travels upstream, it only guards the local endpoint.
 */
export function authorizeCodexRequest(
  headers: Headers,
  config: CodexProviderConfig,
): Response | undefined {
  const presented = readPresentedKey(headers)
  if (presented !== undefined && presented === config.gatewayApiKey) {
    return undefined
  }

  return codexErrorResponse(
    401,
    "gateway_unauthorized",
    "Missing or invalid gateway API key",
  )
}

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

function readPresentedKey(headers: Headers): string | undefined {
  const apiKey = headers.get("x-api-key")
  if (apiKey !== null && apiKey.trim().length > 0) return apiKey.trim()

  const authorization = headers.get("authorization")
  if (authorization === null) return undefined

  const match = /^Bearer\s+(\S+)$/i.exec(authorization.trim())
  return match?.[1]
}
