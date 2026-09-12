import { randomBytes } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"

export interface CodexProfileLockOptions {
  /** Delay between acquisition attempts while another holder keeps the lock. */
  retryDelayMs?: number
  /** Age after which a lock file is treated as abandoned by a crashed process. */
  staleMs?: number
  /** Total time to wait for a contended lock before failing. */
  timeoutMs?: number
}

export interface CodexProfileLockErrorDetails {
  holderPid?: number
  lockPath: string
  waitedMs: number
}

export class CodexProfileLockError extends Error {
  readonly holderPid?: number
  readonly lockPath: string
  readonly waitedMs: number

  constructor(message: string, details: CodexProfileLockErrorDetails) {
    super(message)
    this.name = "CodexProfileLockError"
    this.holderPid = details.holderPid
    this.lockPath = details.lockPath
    this.waitedMs = details.waitedMs
  }
}

const DEFAULT_RETRY_DELAY_MS = 25
const DEFAULT_STALE_MS = 30_000
const DEFAULT_TIMEOUT_MS = 5_000

interface LockHolder {
  mtimeMs: number
  pid?: number
}

/**
 * Serialises credential writes per profile across processes, because the CLI
 * (login/logout) and the running proxy (refresh) both own the same file.
 */
export async function withCodexProfileLock<T>(
  lockPath: string,
  options: CodexProfileLockOptions,
  fn: () => Promise<T>,
): Promise<T> {
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS
  const staleMs = options.staleMs ?? DEFAULT_STALE_MS
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

  await fs.mkdir(path.dirname(lockPath), { mode: 0o700, recursive: true })

  const token = randomBytes(8).toString("hex")
  const startedAt = Date.now()

  for (;;) {
    try {
      const handle = await fs.open(lockPath, "wx", 0o600)
      try {
        await handle.writeFile(
          JSON.stringify({ acquiredAt: Date.now(), pid: process.pid, token }),
        )
      } finally {
        await handle.close()
      }
      break
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
    }

    const holder = await readLockHolder(lockPath)
    if (holder !== undefined && Date.now() - holder.mtimeMs > staleMs) {
      // The previous owner crashed before releasing the lock, so reclaim it.
      await fs.rm(lockPath, { force: true }).catch(() => undefined)
      continue
    }

    const waitedMs = Date.now() - startedAt
    if (waitedMs >= timeoutMs) {
      throw new CodexProfileLockError(
        `Timed out after ${waitedMs}ms waiting for the Codex credential lock at ${lockPath}${holder?.pid === undefined ? "" : ` (held by pid ${holder.pid})`}`,
        {
          ...(holder?.pid === undefined ? {} : { holderPid: holder.pid }),
          lockPath,
          waitedMs,
        },
      )
    }

    await delay(Math.min(retryDelayMs, Math.max(timeoutMs - waitedMs, 1)))
  }

  try {
    return await fn()
  } finally {
    await releaseLock(lockPath, token)
  }
}

async function readLockHolder(
  lockPath: string,
): Promise<LockHolder | undefined> {
  try {
    const [text, stats] = await Promise.all([
      fs.readFile(lockPath, "utf8"),
      fs.stat(lockPath),
    ])

    let pid: number | undefined
    try {
      const parsed: unknown = JSON.parse(text)
      if (isRecord(parsed) && typeof parsed.pid === "number") pid = parsed.pid
    } catch {
      // A lock file that is still being written is not parseable yet.
    }

    return { ...(pid === undefined ? {} : { pid }), mtimeMs: stats.mtimeMs }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined
    throw error
  }
}

/**
 * Only the owner removes the lock file, so a stall that let another process
 * reclaim a stale lock cannot delete that process's lock.
 */
async function releaseLock(lockPath: string, token: string): Promise<void> {
  let text: string
  try {
    text = await fs.readFile(lockPath, "utf8")
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return
    throw error
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return
  }

  if (!isRecord(parsed) || parsed.token !== token) return
  await fs.rm(lockPath, { force: true })
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
