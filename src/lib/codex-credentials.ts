import { randomBytes } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { z } from "zod"

import {
  type CodexProfileLockOptions,
  withCodexProfileLock,
} from "~/lib/codex-profile-lock"

export interface CodexCredential {
  accessToken: string
  accountId?: string
  email?: string
  /** Epoch milliseconds at which the access token stops being usable. */
  expiresAt: number
  idToken?: string
  refreshToken: string
  /** Monotonic counter used to detect stale in-memory copies. */
  revision: number
  updatedAt: number
  version: 1
}

export interface CodexCredentialStore {
  directory: string
  pathFor: (profile: string) => string
  read: (profile: string) => Promise<CodexCredential | undefined>
  remove: (profile: string) => Promise<boolean>
  /**
   * Runs `fn` while holding the cross-process lock for this profile. Any
   * read-then-write sequence (refresh, login, logout) must run inside it so the
   * CLI and a running proxy cannot lose each other's updates.
   */
  withLock: <T>(
    profile: string,
    fn: () => Promise<T>,
    options?: CodexProfileLockOptions,
  ) => Promise<T>
  write: (profile: string, credential: CodexCredential) => Promise<void>
}

export interface CreateCodexCredentialStoreOptions {
  directory: string
}

export const DEFAULT_CODEX_PROFILE = "default"

const profilePattern = /^[A-Z0-9][\w.-]{0,63}$/i

const credentialSchema = z.strictObject({
  access_token: z.string().min(1),
  account_id: z.string().min(1).optional(),
  email: z.string().min(1).optional(),
  expires_at: z.number(),
  id_token: z.string().min(1).optional(),
  refresh_token: z.string().min(1),
  revision: z.number().int().min(0),
  updated_at: z.number(),
  version: z.literal(1),
})

export class CodexCredentialError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CodexCredentialError"
  }
}

/**
 * Rejects anything that could escape the credential directory or collide with a
 * platform-specific file name.
 */
export function assertCodexProfileName(profile: string): string {
  if (
    !profilePattern.test(profile)
    || profile.endsWith(".")
    || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(profile)
  ) {
    throw new CodexCredentialError(
      `Invalid Codex profile name: ${JSON.stringify(profile)}. Use letters, digits, dot, dash or underscore, starting with a letter or digit.`,
    )
  }
  return profile
}

export function createCodexCredentialStore(
  options: CreateCodexCredentialStoreOptions,
): CodexCredentialStore {
  const directory = path.resolve(options.directory)

  const pathFor = (profile: string): string =>
    path.join(directory, `${assertCodexProfileName(profile)}.json`)

  return {
    directory,
    pathFor,

    async withLock(profile, fn, options) {
      return await withCodexProfileLock(
        `${pathFor(profile)}.lock`,
        options ?? {},
        fn,
      )
    },

    async read(profile) {
      const filePath = pathFor(profile)
      let text: string
      try {
        text = await fs.readFile(filePath, "utf8")
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined
        throw error
      }

      let parsed: unknown
      try {
        parsed = JSON.parse(text)
      } catch {
        throw new CodexCredentialError(
          `Codex credential file is not valid JSON: ${filePath}`,
        )
      }

      const result = credentialSchema.safeParse(parsed)
      if (!result.success) {
        throw new CodexCredentialError(
          `Codex credential file has an unsupported shape: ${filePath}`,
        )
      }

      const record = result.data
      return {
        accessToken: record.access_token,
        ...(record.account_id === undefined ?
          {}
        : { accountId: record.account_id }),
        ...(record.email === undefined ? {} : { email: record.email }),
        expiresAt: record.expires_at,
        ...(record.id_token === undefined ? {} : { idToken: record.id_token }),
        refreshToken: record.refresh_token,
        revision: record.revision,
        updatedAt: record.updated_at,
        version: 1,
      }
    },

    async write(profile, credential) {
      const filePath = pathFor(profile)
      await fs.mkdir(directory, { mode: 0o700, recursive: true })

      const payload = JSON.stringify(
        {
          access_token: credential.accessToken,
          ...(credential.accountId === undefined ?
            {}
          : { account_id: credential.accountId }),
          ...(credential.email === undefined ?
            {}
          : { email: credential.email }),
          expires_at: credential.expiresAt,
          ...(credential.idToken === undefined ?
            {}
          : { id_token: credential.idToken }),
          refresh_token: credential.refreshToken,
          revision: credential.revision,
          updated_at: credential.updatedAt,
          version: credential.version,
        },
        null,
        2,
      )

      // Write next to the target so the rename stays on one filesystem and the
      // previous credential file survives any failure before the rename.
      const temporary = `${filePath}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`
      try {
        await fs.writeFile(temporary, `${payload}\n`, { mode: 0o600 })
        await fs.rename(temporary, filePath)
      } catch (error) {
        await fs.rm(temporary, { force: true }).catch(() => undefined)
        throw error
      }
    },

    async remove(profile) {
      try {
        await fs.rm(pathFor(profile))
        return true
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return false
        throw error
      }
    },
  }
}
