import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

const APP_DIR = path.join(os.homedir(), ".local", "share", "copilot-api")

const CODEX_AUTH_DIR = path.join(APP_DIR, "codex")

const GITHUB_TOKEN_PATH = path.join(APP_DIR, "github_token")

const REQUEST_LOG_PATH = path.join(APP_DIR, "requests.log")

export const PATHS = {
  APP_DIR,
  CODEX_AUTH_DIR,
  GITHUB_TOKEN_PATH,
  REQUEST_LOG_PATH,
}

export async function ensurePaths(): Promise<void> {
  await fs.mkdir(PATHS.APP_DIR, { recursive: true })
  await ensureFile(PATHS.GITHUB_TOKEN_PATH)
}

/**
 * Creates the Codex credential directory without touching the GitHub token file,
 * so a Codex-only setup never needs GitHub credentials.
 */
export async function ensureCodexAuthDir(): Promise<string> {
  await fs.mkdir(PATHS.CODEX_AUTH_DIR, { mode: 0o700, recursive: true })
  return PATHS.CODEX_AUTH_DIR
}

async function ensureFile(filePath: string): Promise<void> {
  try {
    await fs.access(filePath, fs.constants.W_OK)
  } catch {
    await fs.writeFile(filePath, "")
    await fs.chmod(filePath, 0o600)
  }
}
