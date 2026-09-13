import type { ServerResponse } from "node:http"

import { randomBytes } from "node:crypto"
import { readFile, rename, writeFile } from "node:fs/promises"
import { createServer } from "node:http"
import { setTimeout as delay } from "node:timers/promises"
import { z } from "zod"

/**
 * Antigravity's OAuth parameters, mirroring the desktop client as captured in
 * the CLIProxyAPI reference snapshot (`internal/auth/antigravity/constants.go`).
 * The client secret is the public installed-app secret already present in that
 * snapshot; it is not a user credential. Re-verify these against a real login
 * before trusting them.
 */
export const ANTIGRAVITY_OAUTH = {
  authEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
  callbackPath: "/oauth-callback",
  clientId:
    "1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com",
  clientSecret: "",
  defaultCallbackPort: 51121,
  scopes: [
    "https://www.googleapis.com/auth/cloud-platform",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/cclog",
    "https://www.googleapis.com/auth/experimentsandconfigs",
  ],
  tokenEndpoint: "https://oauth2.googleapis.com/token",
  userInfoEndpoint: "https://www.googleapis.com/oauth2/v2/userinfo?alt=json",
} as const

export const ANTIGRAVITY_ENDPOINTS = {
  daily: "https://daily-cloudcode-pa.googleapis.com",
  prod: "https://cloudcode-pa.googleapis.com",
  version: "v1internal",
} as const

/** Refresh a token that expires inside this window. */
export const TOKEN_SAFETY_WINDOW_MS = 5 * 60 * 1000

const REQUEST_TIMEOUT_MS = 30_000
/**
 * The Antigravity Hub fingerprint every upstream request carries. Matches the
 * CLIProxyAPI reference snapshot, whose executor
 * (`internal/runtime/executor/antigravity_executor_request.go`) wipes all
 * incoming headers and then sets exactly `Content-Type`, `Authorization`, and
 * `misc.AntigravityUserAgent()`; `internal/misc/antigravity_version.go` builds
 * that value as `antigravity/hub/<version> darwin/arm64`.
 */
export const ANTIGRAVITY_USER_AGENT = "antigravity/hub/2.9.1 darwin/arm64"
const ONBOARD_USER_AGENT = `${ANTIGRAVITY_USER_AGENT} google-api-nodejs-client/10.3.0`
const GOOG_API_CLIENT = "gl-node/22.21.1"
const ONBOARD_ATTEMPTS = 5
const ONBOARD_POLL_INTERVAL_MS = 2000

export type AntigravityFetch = (
  input: string,
  init: RequestInit,
) => Promise<Response>

export class AntigravityAuthError extends Error {
  readonly code: string
  readonly status: number | undefined

  constructor(code: string, message: string, status?: number) {
    super(message)
    this.name = "AntigravityAuthError"
    this.code = code
    this.status = status
  }
}

/**
 * A credential file, compatible with the one CLIProxyAPI writes at
 * `~/.cli-proxy-api/antigravity-<email>.json`. Unknown fields are preserved so
 * a refresh does not strip metadata another tool relies on.
 */
export type AntigravityCredential = Record<string, unknown> & {
  access_token: string
  email?: string
  expired?: string
  project_id?: string
  refresh_token?: string
}

const credentialSchema = z.looseObject({
  access_token: z.string(),
  email: z.string().optional(),
  expired: z.string().optional(),
  project_id: z.string().optional(),
  refresh_token: z.string().optional(),
})

const tokenResponseSchema = z.looseObject({
  access_token: z.string().min(1),
  expires_in: z.number().positive(),
  refresh_token: z.string().optional(),
})

export interface AntigravityTransportOptions {
  fetchImpl?: AntigravityFetch
  now?: () => number
}

/**
 * True when the credential should be refreshed before use: its `expired`
 * timestamp is inside the safety window, or unparsable. A credential without
 * an `expired` field is treated as usable and left to the upstream to reject.
 */
export function isCredentialStale(
  credential: AntigravityCredential,
  nowMs: number,
): boolean {
  if (credential.expired === undefined) return false
  const expiresAt = Date.parse(credential.expired)
  if (Number.isNaN(expiresAt)) return true
  return expiresAt - nowMs <= TOKEN_SAFETY_WINDOW_MS
}

export async function readCredentialFile(
  path: string,
  options: AntigravityTransportOptions = {},
): Promise<AntigravityCredential> {
  const raw = await readFile(path, "utf8").catch(() => {
    throw new AntigravityAuthError(
      "credential_unreadable",
      `Cannot read the Antigravity credential file at ${path}`,
    )
  })

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new AntigravityAuthError(
      "credential_unparsable",
      "Antigravity credential file is not valid JSON",
    )
  }
  if (!isRecord(parsed)) {
    throw new AntigravityAuthError(
      "credential_unparsable",
      "Antigravity credential file must contain a JSON object",
    )
  }

  const result = credentialSchema.safeParse(parsed)
  if (!result.success) {
    throw new AntigravityAuthError(
      "credential_unparsable",
      "Antigravity credential file needs string access_token, refresh_token, expired, and project_id fields",
    )
  }

  const accessToken = result.data.access_token.trim()
  if (accessToken === "") {
    throw new AntigravityAuthError(
      "credential_missing_access_token",
      "Antigravity credential file has an empty access_token",
    )
  }

  const credential: AntigravityCredential = {
    ...parsed,
    access_token: accessToken,
  }
  const nowMs = options.now?.() ?? Date.now()

  if (credential.expired !== undefined) {
    if (Number.isNaN(Date.parse(credential.expired))) {
      throw new AntigravityAuthError(
        "credential_unparsable_expiry",
        "Antigravity credential expired value is not an RFC3339 timestamp",
      )
    }
    if (
      isCredentialStale(credential, nowMs)
      && (credential.refresh_token?.trim() ?? "") === ""
    ) {
      throw new AntigravityAuthError(
        "credential_expired",
        "Antigravity access token is expired and no refresh_token is available; log in again",
      )
    }
  }

  return credential
}

/**
 * Writes the credential through a temporary sibling plus a rename, so a
 * concurrent reader never observes a half-written file.
 */
export async function writeCredentialFile(
  path: string,
  credential: AntigravityCredential,
): Promise<void> {
  const temporaryPath = `${path}.tmp`
  await writeFile(
    temporaryPath,
    `${JSON.stringify(credential, null, 2)}\n`,
    "utf8",
  )
  await rename(temporaryPath, path)
}

export async function refreshCredential(
  credential: AntigravityCredential,
  options: AntigravityTransportOptions = {},
): Promise<AntigravityCredential> {
  const refreshToken = credential.refresh_token?.trim() ?? ""
  if (refreshToken === "") {
    throw new AntigravityAuthError(
      "credential_no_refresh_token",
      "Antigravity credential has no refresh_token to exchange",
    )
  }

  const payload = await postForm(
    options.fetchImpl ?? fetch,
    ANTIGRAVITY_OAUTH.tokenEndpoint,
    {
      client_id: ANTIGRAVITY_OAUTH.clientId,
      client_secret: ANTIGRAVITY_OAUTH.clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    },
  )
  const tokens = tokenResponseSchema.safeParse(payload)
  if (!tokens.success) {
    throw new AntigravityAuthError(
      "token_response_invalid",
      "Antigravity refresh response was missing access_token or expires_in",
    )
  }

  const nowMs = options.now?.() ?? Date.now()
  return {
    ...credential,
    access_token: tokens.data.access_token,
    expires_in: tokens.data.expires_in,
    // A refresh response may omit the refresh token; keep the previous one.
    refresh_token: tokens.data.refresh_token ?? credential.refresh_token,
    timestamp: nowMs,
    type: "antigravity",
    expired: new Date(nowMs + tokens.data.expires_in * 1000).toISOString(),
  }
}

/**
 * Reads the credential file and refreshes it when stale. Concurrent callers
 * share one in-flight refresh so a burst of requests cannot stampede Google.
 */
export class AntigravityCredentialStore {
  readonly path: string
  private readonly fetchImpl: AntigravityFetch
  private readonly now: () => number
  private inFlight: Promise<AntigravityCredential> | undefined

  constructor(path: string, options: AntigravityTransportOptions = {}) {
    this.path = path
    this.fetchImpl = options.fetchImpl ?? fetch
    this.now = options.now ?? Date.now
  }

  async current(): Promise<AntigravityCredential> {
    const credential = await readCredentialFile(this.path, {
      now: this.now,
    })
    if (!isCredentialStale(credential, this.now())) return credential
    return await this.refresh()
  }

  async refresh(): Promise<AntigravityCredential> {
    this.inFlight ??= this.refreshOnce().finally(() => {
      this.inFlight = undefined
    })
    return await this.inFlight
  }

  private async refreshOnce(): Promise<AntigravityCredential> {
    const credential = await readCredentialFile(this.path, {
      now: this.now,
    })
    const refreshed = await refreshCredential(credential, {
      fetchImpl: this.fetchImpl,
      now: this.now,
    })
    await writeCredentialFile(this.path, refreshed)
    return refreshed
  }
}

export function buildAuthorizationUrl(
  state: string,
  redirectUri: string,
): string {
  const url = new URL(ANTIGRAVITY_OAUTH.authEndpoint)
  const params = url.searchParams
  params.set("access_type", "offline")
  params.set("client_id", ANTIGRAVITY_OAUTH.clientId)
  params.set("prompt", "consent")
  params.set("redirect_uri", redirectUri)
  params.set("response_type", "code")
  params.set("scope", ANTIGRAVITY_OAUTH.scopes.join(" "))
  params.set("state", state)
  return url.toString()
}

export async function exchangeAuthorizationCode(
  fetchImpl: AntigravityFetch,
  options: { code: string; redirectUri: string },
): Promise<{
  access_token: string
  expires_in: number
  refresh_token?: string
}> {
  const payload = await postForm(fetchImpl, ANTIGRAVITY_OAUTH.tokenEndpoint, {
    client_id: ANTIGRAVITY_OAUTH.clientId,
    client_secret: ANTIGRAVITY_OAUTH.clientSecret,
    code: options.code,
    grant_type: "authorization_code",
    redirect_uri: options.redirectUri,
  })
  const tokens = tokenResponseSchema.safeParse(payload)
  if (!tokens.success) {
    throw new AntigravityAuthError(
      "token_response_invalid",
      "Antigravity token exchange response was missing access_token or expires_in",
    )
  }
  return {
    access_token: tokens.data.access_token,
    expires_in: tokens.data.expires_in,
    ...(tokens.data.refresh_token === undefined ?
      {}
    : { refresh_token: tokens.data.refresh_token }),
  }
}

export interface AntigravityLoginOptions extends AntigravityTransportOptions {
  credentialPath: string
  onAuthorizationUrl?: (url: string) => Promise<void> | void
  port?: number
  timeoutMs?: number
}

/**
 * Runs the authorization-code flow once and writes the credential file.
 *
 * `project_id` is discovered here because the credential format records it;
 * this module never places it in a business request body.
 */
export async function runAntigravityLogin(
  options: AntigravityLoginOptions,
): Promise<AntigravityCredential> {
  const fetchImpl = options.fetchImpl ?? fetch
  const nowMs = options.now ?? Date.now
  const port = options.port ?? ANTIGRAVITY_OAUTH.defaultCallbackPort
  const redirectUri = `http://localhost:${port}${ANTIGRAVITY_OAUTH.callbackPath}`
  const state = randomBytes(16).toString("base64url")
  const authorizationUrl = buildAuthorizationUrl(state, redirectUri)

  const code = await waitForAuthorizationCode({
    expectedState: state,
    onListening: () => options.onAuthorizationUrl?.(authorizationUrl),
    path: ANTIGRAVITY_OAUTH.callbackPath,
    port,
    ...(options.timeoutMs === undefined ?
      {}
    : { timeoutMs: options.timeoutMs }),
  })

  const tokens = await exchangeAuthorizationCode(fetchImpl, {
    code,
    redirectUri,
  })
  const email = await fetchUserInfo(fetchImpl, tokens.access_token)
  const projectId = await discoverProjectId(fetchImpl, tokens.access_token)
  const issuedAt = nowMs()

  const credential: AntigravityCredential = {
    access_token: tokens.access_token,
    email,
    project_id: projectId,
    type: "antigravity",
    expires_in: tokens.expires_in,
    timestamp: issuedAt,
    expired: new Date(issuedAt + tokens.expires_in * 1000).toISOString(),
    ...(tokens.refresh_token === undefined ?
      {}
    : { refresh_token: tokens.refresh_token }),
  }
  await writeCredentialFile(options.credentialPath, credential)
  return credential
}

interface CallbackOptions {
  expectedState: string
  onListening?: () => Promise<void> | void
  path: string
  port: number
  timeoutMs?: number
}

/**
 * Waits for exactly one valid OAuth callback on the loopback interface. A
 * request with the wrong state cannot cancel a legitimate in-flight login.
 */
async function waitForAuthorizationCode(
  options: CallbackOptions,
): Promise<string> {
  const timeoutMs = options.timeoutMs ?? 300_000
  const host = "127.0.0.1"

  return await new Promise<string>((resolve, reject) => {
    let settled = false

    const server = createServer((request, response) => {
      const url = new URL(request.url ?? "/", `http://${host}:${options.port}`)

      if (request.method !== "GET" || url.pathname !== options.path) {
        respond(response, 404, "Not found")
        return
      }

      if (
        url.searchParams.getAll("state").length !== 1
        || url.searchParams.get("state") !== options.expectedState
      ) {
        respond(response, 400, "State mismatch")
        return
      }

      const authorizationError = url.searchParams.get("error")
      if (authorizationError !== null) {
        respond(response, 400, "Authorization was rejected")
        finish(
          new AntigravityAuthError(
            "callback_rejected",
            "Antigravity authorization was rejected",
          ),
        )
        return
      }

      const code = url.searchParams.get("code")
      if (
        code === null
        || code.length === 0
        || url.searchParams.getAll("code").length !== 1
      ) {
        respond(response, 400, "Missing authorization code")
        return
      }

      respond(
        response,
        200,
        "Antigravity login complete. You can close this window.",
      )
      finish(undefined, code)
    })

    const finish = (error?: Error, code?: string): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      server.close()
      if (error === undefined && code !== undefined) resolve(code)
      else
        reject(
          error
            ?? new AntigravityAuthError(
              "callback_failed",
              "Antigravity login ended unexpectedly",
            ),
        )
    }

    const timer = setTimeout(() => {
      finish(
        new AntigravityAuthError(
          "callback_timeout",
          `Timed out after ${timeoutMs} ms waiting for the Antigravity login callback`,
        ),
      )
    }, timeoutMs)
    timer.unref()

    server.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE") {
        finish(
          new AntigravityAuthError(
            "callback_port_in_use",
            `Cannot start the Antigravity login callback on port ${options.port}: the port is already in use`,
          ),
        )
        return
      }
      finish(error)
    })

    server.listen({ host, port: options.port }, () => {
      Promise.resolve()
        .then(() => options.onListening?.())
        .catch((error: unknown) => {
          finish(
            error instanceof Error ? error : (
              new AntigravityAuthError("callback_listen_failed", String(error))
            ),
          )
        })
    })
  })
}

function respond(response: ServerResponse, status: number, body: string): void {
  response.writeHead(status, { "content-type": "text/plain; charset=utf-8" })
  response.end(`${body}\n`)
}

async function fetchUserInfo(
  fetchImpl: AntigravityFetch,
  accessToken: string,
): Promise<string | undefined> {
  const response = await sendJson(
    fetchImpl,
    ANTIGRAVITY_OAUTH.userInfoEndpoint,
    {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${accessToken}`,
        "user-agent": ANTIGRAVITY_USER_AGENT,
      },
      method: "GET",
    },
  )
  if (!response.ok) {
    throw new AntigravityAuthError(
      "userinfo_failed",
      `Antigravity userinfo request failed with status ${response.status}`,
      response.status,
    )
  }
  if (!isRecord(response.body)) return undefined
  const email = response.body.email
  return typeof email === "string" && email.trim() !== "" ?
      email.trim()
    : undefined
}

/**
 * `loadCodeAssist` normally reports the project; `onboardUser` is the
 * reference implementation's fallback and is only attempted when it does not.
 */
async function discoverProjectId(
  fetchImpl: AntigravityFetch,
  accessToken: string,
): Promise<string | undefined> {
  const response = await sendJson(
    fetchImpl,
    `${ANTIGRAVITY_ENDPOINTS.prod}/${ANTIGRAVITY_ENDPOINTS.version}:loadCodeAssist`,
    {
      body: JSON.stringify({ metadata: { ideType: "ANTIGRAVITY" } }),
      headers: {
        accept: "*/*",
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
        "user-agent": ANTIGRAVITY_USER_AGENT,
      },
      method: "POST",
    },
  )
  if (!response.ok) {
    throw new AntigravityAuthError(
      "project_discovery_failed",
      `Antigravity loadCodeAssist failed with status ${response.status}`,
      response.status,
    )
  }

  const project = extractProject(response.body)
  if (project !== undefined) return project
  return await onboardUser(fetchImpl, accessToken, defaultTierId(response.body))
}

async function onboardUser(
  fetchImpl: AntigravityFetch,
  accessToken: string,
  tierId: string,
): Promise<string | undefined> {
  const body = JSON.stringify({
    metadata: {
      ide_name: "antigravity",
      ide_type: "ANTIGRAVITY",
      ide_version: "2.9.1",
    },
    tier_id: tierId,
  })

  for (let attempt = 0; attempt < ONBOARD_ATTEMPTS; attempt += 1) {
    const response = await sendJson(
      fetchImpl,
      `${ANTIGRAVITY_ENDPOINTS.daily}/${ANTIGRAVITY_ENDPOINTS.version}:onboardUser`,
      {
        body,
        headers: {
          accept: "*/*",
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
          "user-agent": ONBOARD_USER_AGENT,
          "x-goog-api-client": GOOG_API_CLIENT,
        },
        method: "POST",
      },
    )
    if (!response.ok) {
      throw new AntigravityAuthError(
        "onboarding_failed",
        `Antigravity onboardUser failed with status ${response.status}`,
        response.status,
      )
    }

    if (isRecord(response.body) && response.body.done === true) {
      return extractProject(response.body.response ?? response.body)
    }

    if (attempt < ONBOARD_ATTEMPTS - 1) await delay(ONBOARD_POLL_INTERVAL_MS)
  }

  return undefined
}

function extractProject(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined
  for (const key of ["cloudaicompanionProject", "projectId", "project"]) {
    const candidate = value[key]
    if (typeof candidate === "string" && candidate.trim() !== "")
      return candidate.trim()
    if (
      isRecord(candidate)
      && typeof candidate.id === "string"
      && candidate.id.trim() !== ""
    )
      return candidate.id.trim()
  }
  return undefined
}

function defaultTierId(value: unknown): string {
  if (isRecord(value)) {
    if (Array.isArray(value.allowedTiers)) {
      for (const entry of value.allowedTiers) {
        if (!isRecord(entry) || entry.isDefault !== true) continue
        if (typeof entry.id === "string" && entry.id.trim() !== "")
          return entry.id.trim()
      }
    }
    if (
      isRecord(value.currentTier)
      && typeof value.currentTier.id === "string"
      && value.currentTier.id.trim() !== ""
    )
      return value.currentTier.id.trim()
  }
  return "free-tier"
}

async function postForm(
  fetchImpl: AntigravityFetch,
  url: string,
  form: Record<string, string>,
): Promise<unknown> {
  const response = await fetchImpl(url, {
    body: new URLSearchParams(form),
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded",
    },
    method: "POST",
    redirect: "manual",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })

  const text = await response.text()
  if (!response.ok) {
    throw new AntigravityAuthError(
      "token_request_failed",
      `Antigravity token request failed with status ${response.status}`,
      response.status,
    )
  }

  try {
    return JSON.parse(text)
  } catch {
    throw new AntigravityAuthError(
      "token_response_invalid",
      "Antigravity token response was not valid JSON",
    )
  }
}

async function sendJson(
  fetchImpl: AntigravityFetch,
  url: string,
  init: RequestInit,
): Promise<{ body: unknown; ok: boolean; status: number }> {
  const response = await fetchImpl(url, {
    ...init,
    redirect: "manual",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  const text = await response.text()

  let body: unknown
  try {
    body = text === "" ? undefined : JSON.parse(text)
  } catch {
    body = undefined
  }

  return {
    body,
    ok: response.ok,
    status: response.status,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
