import { createHash } from "node:crypto"

import {
  assertCodexProfileName,
  createCodexCredentialStore,
  type CodexCredential,
  type CodexCredentialStore,
} from "~/lib/codex-credentials"
import { ensureCodexAuthDir } from "~/lib/paths"
import { state } from "~/lib/state"
import {
  CodexOAuthError,
  readCodexIdentity,
  refreshAccessToken,
  type CodexOAuthOptions,
  type CodexTokenResponse,
} from "~/services/codex/oauth"

/** Refresh this long before the access token actually expires. */
export const CODEX_REFRESH_WINDOW_MS = 60_000

const ASSUMED_TOKEN_LIFETIME_SECONDS = 3_600

/** The stored credential is gone or was rejected; a human has to sign in again. */
export class CodexAuthRequiredError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = "CodexAuthRequiredError"
  }
}

/** The refresh attempt failed for a reason that may pass on its own. */
export class CodexAuthUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = "CodexAuthUnavailableError"
  }
}

export interface CodexAuthSnapshot {
  accessToken: string
  accountId?: string
  email?: string
  expiresAt: number
  revision: number
}

export interface CodexAuthManager {
  /** Returns a usable token, refreshing first when it is inside the refresh window. */
  getSnapshot: (profile: string) => Promise<CodexAuthSnapshot>
  /** Refreshes regardless of the remaining lifetime, e.g. after an upstream 401. */
  refreshNow: (profile: string) => Promise<CodexAuthSnapshot>
}

export type CodexRefreshGrant = (
  refreshToken: string,
  options: CodexOAuthOptions,
) => Promise<CodexTokenResponse>

export interface CreateCodexAuthManagerOptions {
  now?: () => number
  oauth?: CodexOAuthOptions
  refresh?: CodexRefreshGrant
  refreshWindowMs?: number
  store: CodexCredentialStore
}

type InFlightRefreshes = Map<string, Promise<CodexCredential>>

interface CodexAuthContext {
  inFlight: InFlightRefreshes
  isUsable: (credential: CodexCredential, atMs: number) => boolean
  now: () => number
  oauth: CodexOAuthOptions
  refresh: CodexRefreshGrant
  /** Credentials the token endpoint already rejected, so requests fail fast. */
  rejected: Map<string, string>
  store: CodexCredentialStore
}

export function createCodexAuthManager(
  options: CreateCodexAuthManagerOptions,
): CodexAuthManager {
  const refreshWindowMs = options.refreshWindowMs ?? CODEX_REFRESH_WINDOW_MS
  const context: CodexAuthContext = {
    inFlight: new Map(),
    isUsable: (credential, atMs) =>
      credential.expiresAt - atMs > refreshWindowMs,
    now: options.now ?? Date.now,
    oauth: options.oauth ?? {},
    refresh: options.refresh ?? refreshAccessToken,
    rejected: new Map<string, string>(),
    store: options.store,
  }

  return {
    async getSnapshot(profile) {
      const credential = await requireCredential(context, profile)
      if (context.isUsable(credential, context.now())) {
        return toSnapshot(credential)
      }
      return toSnapshot(await refreshOnce(context, profile, false))
    },

    async refreshNow(profile) {
      // An explicit refresh is the one path allowed to ignore the fast-fail
      // marker, because the caller is deliberately retrying.
      const credential = await readCredential(context, profile)
      if (credential === undefined) throw missingCredentialError(profile)
      return toSnapshot(await refreshOnce(context, profile, true))
    },
  }
}

let sharedManager: Promise<CodexAuthManager> | undefined

/**
 * Process-wide manager, so concurrent requests share one refresh and one
 * in-flight bookkeeping. Callers that need isolation (tests, tooling) should
 * build their own manager with `createCodexAuthManager`.
 */
export async function getCodexAuthManager(): Promise<CodexAuthManager> {
  const override = state.codexAuthManager
  if (override !== undefined) return override

  sharedManager ??= createSharedManager()
  return await sharedManager
}

async function createSharedManager(): Promise<CodexAuthManager> {
  const store = createCodexCredentialStore({
    directory: await ensureCodexAuthDir(),
  })
  return createCodexAuthManager({ store })
}

async function readCredential(
  context: CodexAuthContext,
  profile: string,
): Promise<CodexCredential | undefined> {
  const credential = await context.store.read(profile)
  if (credential === undefined) context.rejected.delete(profile)
  return credential
}

async function requireCredential(
  context: CodexAuthContext,
  profile: string,
): Promise<CodexCredential> {
  assertCodexProfileName(profile)

  const credential = await readCredential(context, profile)
  if (credential === undefined) throw missingCredentialError(profile)

  if (context.rejected.get(profile) === fingerprint(credential)) {
    throw new CodexAuthRequiredError(
      `The stored Codex credentials for profile "${profile}" were rejected by the token endpoint; sign in again`,
    )
  }

  return credential
}

/** Concurrent callers share one refresh instead of spending the grant N times. */
async function refreshOnce(
  context: CodexAuthContext,
  profile: string,
  force: boolean,
): Promise<CodexCredential> {
  const { inFlight } = context
  const existing = inFlight.get(profile)
  if (existing !== undefined) return await existing

  const promise = refreshCredential(context, profile, force)
  inFlight.set(profile, promise)
  try {
    return await promise
  } finally {
    if (inFlight.get(profile) === promise) inFlight.delete(profile)
  }
}

async function refreshCredential(
  context: CodexAuthContext,
  profile: string,
  force: boolean,
): Promise<CodexCredential> {
  const base = await readCredential(context, profile)
  if (base === undefined) {
    throw new CodexAuthRequiredError(
      `Codex credentials for profile "${profile}" were removed; sign in again`,
    )
  }

  if (!force && context.isUsable(base, context.now())) return base

  let tokens: CodexTokenResponse
  try {
    tokens = await context.refresh(base.refreshToken, context.oauth)
  } catch (error) {
    // Another process may have rotated the grant while this request was in
    // flight; its credential supersedes anything we could still write.
    const raced = await context.store.read(profile)
    if (raced !== undefined && fingerprint(raced) !== fingerprint(base)) {
      return raced
    }

    const failure = classifyRefreshFailure(error, profile)
    if (failure instanceof CodexAuthRequiredError) {
      context.rejected.set(profile, fingerprint(base))
    }
    throw failure
  }

  const refreshed = await context.store.withLock(profile, async () => {
    const current = await context.store.read(profile)
    if (current === undefined) {
      throw new CodexAuthRequiredError(
        `Codex credentials for profile "${profile}" were removed while refreshing; sign in again`,
      )
    }

    // A login or another refresh landed first; never overwrite it, and never
    // resurrect a credential that was replaced while this request was out.
    if (fingerprint(current) !== fingerprint(base)) return current

    const next = applyTokenResponse(current, tokens, context.now())
    await context.store.write(profile, next)
    return next
  })

  context.rejected.delete(profile)
  return refreshed
}

/**
 * Expands a refresh response into a complete credential, keeping the previous
 * values for anything the token endpoint omitted. Access token and account ID
 * always travel together in one revision.
 */
export function applyTokenResponse(
  current: CodexCredential,
  tokens: CodexTokenResponse,
  atMs: number,
): CodexCredential {
  const identity = readCodexIdentity(tokens.idToken)
  const accountId = identity.accountId ?? current.accountId
  const email = identity.email ?? current.email
  const idToken = tokens.idToken ?? current.idToken
  const lifetimeSeconds =
    tokens.expiresInSeconds ?? ASSUMED_TOKEN_LIFETIME_SECONDS
  const refreshToken =
    tokens.refreshToken === undefined || tokens.refreshToken.length === 0 ?
      current.refreshToken
    : tokens.refreshToken

  return {
    accessToken: tokens.accessToken,
    ...(accountId === undefined ? {} : { accountId }),
    ...(email === undefined ? {} : { email }),
    expiresAt: atMs + lifetimeSeconds * 1000,
    ...(idToken === undefined ? {} : { idToken }),
    refreshToken,
    revision: current.revision + 1,
    updatedAt: atMs,
    version: 1,
  }
}

function toSnapshot(credential: CodexCredential): CodexAuthSnapshot {
  return {
    accessToken: credential.accessToken,
    ...(credential.accountId === undefined ?
      {}
    : { accountId: credential.accountId }),
    ...(credential.email === undefined ? {} : { email: credential.email }),
    expiresAt: credential.expiresAt,
    revision: credential.revision,
  }
}

function missingCredentialError(profile: string): CodexAuthRequiredError {
  return new CodexAuthRequiredError(
    `No Codex credentials are stored for profile "${profile}"; run the codex-auth login command first`,
  )
}

/**
 * Identifies one stored credential. The monotonic revision alone is not enough
 * because a re-login restarts it at 1.
 */
function fingerprint(credential: CodexCredential): string {
  return createHash("sha256")
    .update(
      `${credential.revision}\u0000${credential.accessToken}\u0000${credential.refreshToken}`,
    )
    .digest("hex")
}

function classifyRefreshFailure(
  error: unknown,
  profile: string,
): CodexAuthRequiredError | CodexAuthUnavailableError {
  if (error instanceof CodexOAuthError) {
    const detail = `status=${error.status ?? "none"} code=${error.code ?? "none"}`
    if (isRetryable(error)) {
      return new CodexAuthUnavailableError(
        `Refreshing the Codex credentials for profile "${profile}" failed temporarily (${detail}); the stored credentials were kept`,
        { cause: error },
      )
    }
    return new CodexAuthRequiredError(
      `Refreshing the Codex credentials for profile "${profile}" was rejected (${detail}); sign in again`,
      { cause: error },
    )
  }

  return new CodexAuthUnavailableError(
    `Refreshing the Codex credentials for profile "${profile}" failed because the token endpoint could not be reached; the stored credentials were kept`,
    { cause: error },
  )
}

function isRetryable(error: CodexOAuthError): boolean {
  if (
    error.code === "server_error"
    || error.code === "temporarily_unavailable"
  ) {
    return true
  }
  if (error.status === undefined) return true
  return error.status === 429 || error.status >= 500
}
