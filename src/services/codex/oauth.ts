import { createHash, randomBytes } from "node:crypto"
import { z } from "zod"

/**
 * OAuth parameters for the ChatGPT/Codex authorization-code flow.
 *
 * These values mirror the Codex CLI flow as captured in the CLIProxyAPI
 * reference snapshot. They are not an OpenAI-supported compatibility contract,
 * so any change here must be re-verified with a real login.
 */
export const CODEX_OAUTH = {
  authorizeUrl: "https://auth.openai.com/oauth/authorize",
  callbackPath: "/auth/callback",
  clientId: "app_EMoamEEZ73f0CkXaXp7hrann",
  defaultCallbackPort: 1455,
  redirectUri: "http://localhost:1455/auth/callback",
  scope: "openid email profile offline_access",
  tokenUrl: "https://auth.openai.com/oauth/token",
} as const

export interface PkceCodes {
  challenge: string
  verifier: string
}

export interface CodexIdentity {
  accountId?: string
  email?: string
}

export interface CodexOAuthOptions {
  clientId?: string
  fetchImpl?: typeof fetch
  redirectUri?: string
  tokenUrl?: string
}

export interface CodexTokenResponse {
  accessToken: string
  expiresInSeconds?: number
  idToken?: string
  refreshToken?: string
}

export class CodexOAuthError extends Error {
  readonly status?: number
  readonly code?: string

  constructor(message: string, status?: number, code?: string) {
    super(message)
    this.name = "CodexOAuthError"
    this.status = status
    this.code = code
  }
}

const tokenResponseSchema = z.looseObject({
  access_token: z.string().min(1),
  expires_in: z.number().positive().optional(),
  id_token: z.string().optional(),
  refresh_token: z.string().optional(),
})

const errorResponseSchema = z.looseObject({
  error: z.string().optional(),
})

export function createPkceCodes(): PkceCodes {
  const verifier = randomBytes(32).toString("base64url")
  const challenge = createHash("sha256").update(verifier).digest("base64url")
  return { challenge, verifier }
}

export function createOAuthState(): string {
  return randomBytes(16).toString("base64url")
}

export function buildAuthorizationUrl(options: {
  challenge: string
  clientId?: string
  redirectUri?: string
  state: string
}): string {
  const url = new URL(CODEX_OAUTH.authorizeUrl)
  const params = url.searchParams
  params.set("client_id", options.clientId ?? CODEX_OAUTH.clientId)
  params.set("response_type", "code")
  params.set("redirect_uri", options.redirectUri ?? CODEX_OAUTH.redirectUri)
  params.set("scope", CODEX_OAUTH.scope)
  params.set("state", options.state)
  params.set("code_challenge", options.challenge)
  params.set("code_challenge_method", "S256")
  params.set("prompt", "login")
  params.set("id_token_add_organizations", "true")
  params.set("codex_cli_simplified_flow", "true")
  return url.toString()
}

export async function exchangeAuthorizationCode(
  code: string,
  verifier: string,
  options: CodexOAuthOptions = {},
): Promise<CodexTokenResponse> {
  return await postTokenRequest(
    {
      client_id: options.clientId ?? CODEX_OAUTH.clientId,
      code,
      code_verifier: verifier,
      grant_type: "authorization_code",
      redirect_uri: options.redirectUri ?? CODEX_OAUTH.redirectUri,
    },
    options,
  )
}

export async function refreshAccessToken(
  refreshToken: string,
  options: CodexOAuthOptions = {},
): Promise<CodexTokenResponse> {
  return await postTokenRequest(
    {
      client_id: options.clientId ?? CODEX_OAUTH.clientId,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      scope: CODEX_OAUTH.scope,
    },
    options,
  )
}

/**
 * Reads metadata from a token obtained directly from the trusted TLS token
 * endpoint. This is decoding, not JWT signature verification; never use claims
 * from a downstream client as an authentication decision.
 */
export function readCodexIdentity(idToken?: string): CodexIdentity {
  if (idToken === undefined) return {}
  const payload = decodeJwtPayload(idToken)
  if (payload === undefined) return {}

  const auth = payload["https://api.openai.com/auth"]
  const accountId =
    isRecord(auth) && typeof auth.chatgpt_account_id === "string" ?
      auth.chatgpt_account_id
    : undefined
  const email = typeof payload.email === "string" ? payload.email : undefined

  return {
    ...(accountId === undefined ? {} : { accountId }),
    ...(email === undefined ? {} : { email }),
  }
}

async function postTokenRequest(
  form: Record<string, string>,
  options: CodexOAuthOptions,
): Promise<CodexTokenResponse> {
  const fetchImpl = options.fetchImpl ?? fetch
  const response = await fetchImpl(options.tokenUrl ?? CODEX_OAUTH.tokenUrl, {
    body: new URLSearchParams(form),
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded",
    },
    method: "POST",
    redirect: "manual",
    signal: AbortSignal.timeout(30_000),
  })

  const text = await response.text()
  if (!response.ok) {
    const code = oauthFailureCode(text)
    throw new CodexOAuthError(
      `Codex token request failed with status ${response.status}${code === undefined ? "" : `: ${code}`}`,
      response.status,
      code,
    )
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new CodexOAuthError("Codex token response was not valid JSON")
  }

  const result = tokenResponseSchema.safeParse(parsed)
  if (!result.success) {
    throw new CodexOAuthError(
      "Codex token response was missing required fields",
    )
  }

  return {
    accessToken: result.data.access_token,
    ...(result.data.expires_in === undefined ?
      {}
    : { expiresInSeconds: result.data.expires_in }),
    ...(result.data.id_token === undefined ?
      {}
    : { idToken: result.data.id_token }),
    ...(result.data.refresh_token === undefined ?
      {}
    : { refreshToken: result.data.refresh_token }),
  }
}

/**
 * Only known error codes can appear in diagnostics; descriptions may echo secrets.
 */
function oauthFailureCode(text: string): string | undefined {
  try {
    const parsed = errorResponseSchema.safeParse(JSON.parse(text))
    const code = parsed.success ? parsed.data.error : undefined
    return (
        code !== undefined
          && [
            "access_denied",
            "invalid_client",
            "invalid_grant",
            "server_error",
            "temporarily_unavailable",
          ].includes(code)
      ) ?
        code
      : undefined
  } catch {
    return undefined
  }
}

function decodeJwtPayload(token: string): Record<string, unknown> | undefined {
  const parts = token.split(".")
  if (parts.length !== 3) return undefined
  try {
    const decoded = Buffer.from(parts[1], "base64url").toString("utf8")
    const parsed: unknown = JSON.parse(decoded)
    return isRecord(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
