#!/usr/bin/env node

import { defineCommand } from "citty"
import consola from "consola"
import { spawn } from "node:child_process"

import {
  assertCodexProfileName,
  createCodexCredentialStore,
  DEFAULT_CODEX_PROFILE,
  type CodexCredential,
  type CodexCredentialStore,
} from "~/lib/codex-credentials"
import { ensureCodexAuthDir } from "~/lib/paths"
import { waitForAuthorizationCode } from "~/services/codex/callback-server"
import {
  buildAuthorizationUrl,
  CodexOAuthError,
  createOAuthState,
  createPkceCodes,
  exchangeAuthorizationCode,
  type CodexOAuthOptions,
  type CodexTokenResponse,
  readCodexIdentity,
} from "~/services/codex/oauth"

const ASSUMED_TOKEN_LIFETIME_SECONDS = 3600

export interface CodexLoginDependencies {
  now?: () => number
  oauth?: CodexOAuthOptions
  openBrowser?: (url: string) => Promise<void> | void
  store?: CodexCredentialStore
  waitForCode?: (options: WaitForCodeOptions) => Promise<string>
}

export interface CodexLoginResult {
  authorizationUrl: string
  credential: CodexCredential
  profile: string
}

export interface CodexStatus {
  accountId?: string
  email?: string
  expired: boolean
  expiresAt: number
  loggedIn: true
}

export interface WaitForCodeOptions {
  expectedState: string
  onListening: (redirectUri: string) => Promise<void> | void
}

export async function runCodexLogin(
  profile: string = DEFAULT_CODEX_PROFILE,
  dependencies: CodexLoginDependencies = {},
): Promise<CodexLoginResult> {
  assertCodexProfileName(profile)

  const now = dependencies.now ?? Date.now
  const oauthOptions = dependencies.oauth ?? {}
  const store = dependencies.store ?? (await defaultStore())
  const waitForCode = dependencies.waitForCode ?? waitForAuthorizationCode
  const openBrowser = dependencies.openBrowser ?? openInBrowser

  const state = createOAuthState()
  const pkce = createPkceCodes()
  const authorizationUrl = buildAuthorizationUrl({
    challenge: pkce.challenge,
    ...(oauthOptions.clientId === undefined ?
      {}
    : { clientId: oauthOptions.clientId }),
    ...(oauthOptions.redirectUri === undefined ?
      {}
    : { redirectUri: oauthOptions.redirectUri }),
    state,
  })

  const code = await waitForCode({
    expectedState: state,
    async onListening(redirectUri) {
      consola.info(`Codex login callback listening on ${redirectUri}`)
      consola.info(`Open this URL to continue:\n${authorizationUrl}`)
      try {
        await openBrowser(authorizationUrl)
      } catch {
        consola.warn(
          "Could not open a browser automatically; open the URL above manually.",
        )
      }
    },
  })

  const tokens = await exchangeAuthorizationCode(
    code,
    pkce.verifier,
    oauthOptions,
  )
  const credential = toCodexCredential(tokens, now())
  // Serialise with a proxy that may be refreshing the same profile right now.
  await store.withLock(profile, async () => {
    await store.write(profile, credential)
  })

  return { authorizationUrl, credential, profile }
}

export async function runCodexStatus(
  profile: string = DEFAULT_CODEX_PROFILE,
  dependencies: Pick<CodexLoginDependencies, "now" | "store"> = {},
): Promise<CodexStatus | undefined> {
  const credential = await readStoredCredential(profile, dependencies)
  if (credential === undefined) return undefined

  const now = (dependencies.now ?? Date.now)()
  return {
    ...(credential.accountId === undefined ?
      {}
    : { accountId: credential.accountId }),
    ...(credential.email === undefined ? {} : { email: credential.email }),
    expired: credential.expiresAt <= now,
    expiresAt: credential.expiresAt,
    loggedIn: true,
  }
}

export async function runCodexLogout(
  profile: string = DEFAULT_CODEX_PROFILE,
  dependencies: Pick<CodexLoginDependencies, "store"> = {},
): Promise<boolean> {
  const store = dependencies.store ?? (await defaultStore())
  return await store.withLock(profile, async () => await store.remove(profile))
}

export function toCodexCredential(
  tokens: CodexTokenResponse,
  now: number,
  previousRevision = 0,
): CodexCredential {
  if (tokens.refreshToken === undefined || tokens.refreshToken.length === 0) {
    throw new CodexOAuthError(
      "Codex token response did not include a refresh token; offline access is required",
    )
  }

  const identity = readCodexIdentity(tokens.idToken)
  const lifetime =
    tokens.expiresInSeconds === undefined ?
      ASSUMED_TOKEN_LIFETIME_SECONDS
    : tokens.expiresInSeconds

  return {
    accessToken: tokens.accessToken,
    ...(identity.accountId === undefined ?
      {}
    : { accountId: identity.accountId }),
    ...(identity.email === undefined ? {} : { email: identity.email }),
    expiresAt: now + lifetime * 1000,
    ...(tokens.idToken === undefined ? {} : { idToken: tokens.idToken }),
    refreshToken: tokens.refreshToken,
    revision: previousRevision + 1,
    updatedAt: now,
    version: 1,
  }
}

/**
 * Shows only enough of an identifier for a human to recognise the account.
 */
export function maskIdentifier(value: string): string {
  if (value.length <= 2) return "*".repeat(value.length)
  return `${value.slice(0, 2)}${"*".repeat(Math.min(value.length - 2, 6))}`
}

async function readStoredCredential(
  profile: string,
  dependencies: Pick<CodexLoginDependencies, "store">,
): Promise<CodexCredential | undefined> {
  const store = dependencies.store ?? (await defaultStore())
  return await store.read(profile)
}

async function defaultStore(): Promise<CodexCredentialStore> {
  return createCodexCredentialStore({ directory: await ensureCodexAuthDir() })
}

async function openInBrowser(url: string): Promise<void> {
  const [command, args] = browserCommand(url)

  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    })
    child.once("error", reject)
    child.once("spawn", () => {
      child.unref()
      resolve()
    })
  })
}

/**
 * `openInBrowser` only ever needs the platform's default-URL handler, so it
 * avoids shell interpretation of the authorization URL.
 */
function browserCommand(url: string): [string, Array<string>] {
  if (process.platform === "darwin") return ["open", [url]]
  if (process.platform === "win32") {
    return ["rundll32.exe", ["url.dll,FileProtocolHandler", url]]
  }
  return ["xdg-open", [url]]
}

const profileArg = {
  description: `Credential profile name (default: ${DEFAULT_CODEX_PROFILE})`,
  type: "string" as const,
}

const login = defineCommand({
  meta: {
    description: "Sign in to ChatGPT and store Codex credentials locally",
    name: "login",
  },
  args: { profile: profileArg },
  async run({ args }) {
    const profile = args.profile || DEFAULT_CODEX_PROFILE
    const result = await runCodexLogin(profile)
    consola.success(
      `Codex credentials stored for profile "${result.profile}" (expires ${new Date(result.credential.expiresAt).toISOString()})`,
    )
    if (result.credential.email !== undefined) {
      consola.info(`Account: ${maskIdentifier(result.credential.email)}`)
    }
  },
})

const status = defineCommand({
  meta: {
    description: "Show whether Codex credentials are stored locally",
    name: "status",
  },
  args: { profile: profileArg },
  async run({ args }) {
    const profile = args.profile || DEFAULT_CODEX_PROFILE
    const result = await runCodexStatus(profile)
    if (result === undefined) {
      consola.info(`Profile "${profile}": not logged in`)
      return
    }
    consola.info(
      `Profile "${profile}": ${result.expired ? "stored credential has expired" : "logged in"}`,
    )
    consola.info(`Expires: ${new Date(result.expiresAt).toISOString()}`)
    if (result.email !== undefined) {
      consola.info(`Email: ${maskIdentifier(result.email)}`)
    }
    if (result.accountId !== undefined) {
      consola.info(`Account: ${maskIdentifier(result.accountId)}`)
    }
  },
})

const logout = defineCommand({
  meta: {
    description: "Delete the locally stored Codex credentials",
    name: "logout",
  },
  args: { profile: profileArg },
  async run({ args }) {
    const profile = args.profile || DEFAULT_CODEX_PROFILE
    const removed = await runCodexLogout(profile)
    if (removed) {
      consola.success(
        `Removed local Codex credentials for profile "${profile}". This does not revoke access on the server.`,
      )
      return
    }
    consola.info(`Profile "${profile}" had no stored credentials`)
  },
})

export const codexAuth = defineCommand({
  meta: {
    description: "Manage the ChatGPT/Codex login used by the Codex provider",
    name: "codex-auth",
  },
  subCommands: { login, logout, status },
})
