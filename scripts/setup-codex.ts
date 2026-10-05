import type { TomlTable, TomlValue } from "smol-toml"

import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { parse, stringify } from "smol-toml"

import { refreshCodexModels } from "~/lib/codex-models"
import { loadRuntimeConfig } from "~/lib/runtime-config"

function table(value: TomlValue | undefined, name: string): TomlTable {
  if (value === undefined) return {}
  if (
    typeof value !== "object"
    || Array.isArray(value)
    || value instanceof Date
  ) {
    throw new TypeError(`${name} must be a TOML table`)
  }
  return value
}

export function updateCodexConfig(
  content: string,
  catalogPath: string,
): string {
  const config = parse(content, { integersAsBigInt: "asNeeded" })
  const providers = table(config.model_providers, "model_providers")
  const provider = table(
    providers["copilot-api"],
    "model_providers.copilot-api",
  )
  config.model_provider = "copilot-api"
  config.model_catalog_json = catalogPath.replaceAll("\\", "/")
  config.model_providers = {
    ...providers,
    "copilot-api": {
      ...provider,
      name: "GitHub Copilot API",
      base_url: "http://localhost:4141/v1",
      wire_api: "responses",
      requires_openai_auth: false,
    },
  }
  return stringify(config)
}

export async function configureCodex(
  configPath: string,
  catalogPath: string,
): Promise<string | undefined> {
  const original = await fs
    .readFile(configPath, "utf8")
    .catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined
      throw error
    })
  const updated = updateCodexConfig(original ?? "", catalogPath)
  if (updated === original) return undefined
  await fs.mkdir(path.dirname(configPath), { recursive: true })
  const backup =
    original === undefined ? undefined : `${configPath}.${Date.now()}.bak`
  if (backup !== undefined)
    await fs.copyFile(configPath, backup, fs.constants.COPYFILE_EXCL)
  const temporary = `${configPath}.${process.pid}.tmp`
  try {
    await fs.writeFile(temporary, updated, { flag: "wx", mode: 0o600 })
    await fs.rename(temporary, configPath)
  } finally {
    await fs.rm(temporary, { force: true })
  }
  return backup
}

export async function setupCodex(
  root: string,
  codexHome: string,
): Promise<void> {
  const catalogPath = path.join(root, "codex-models.json")
  const configPath = path.join(codexHome, "config.toml")
  const runtime = await loadRuntimeConfig({ cwd: root, packageRoot: root })
  const temporary = `${catalogPath}.${process.pid}.install`
  try {
    await refreshCodexModels({
      outputFile: temporary,
      upstreamCacheFile: path.join(root, "codex-models-upstream.json"),
      customFiles: runtime.catalog.customFiles,
      disabledModels: runtime.catalog.disabledModels,
      deepSeekModels:
        runtime.providers.deepseek.enabled ?
          runtime.providers.deepseek.models
        : [],
    })
    const catalog = JSON.parse(
      // eslint-disable-next-line unicorn/prefer-json-parse-buffer
      await fs.readFile(temporary, "utf8"),
    ) as {
      models?: Array<{ slug: string }>
    }
    if (!catalog.models?.length)
      throw new Error(
        "Catalog is empty; check model exclusions and network access, then run the installer again",
      )
    await fs.rename(temporary, catalogPath)
  } finally {
    await fs.rm(temporary, { force: true })
  }
  const backup = await configureCodex(configPath, catalogPath)
  if (backup !== undefined)
    console.log(`Previous Codex config saved to ${backup}`)
  console.log(`Codex configured: ${configPath}\nModel catalog: ${catalogPath}`)
}

if (import.meta.main) {
  await setupCodex(
    path.resolve(import.meta.dir, ".."),
    process.env.CODEX_HOME || path.join(os.homedir(), ".codex"),
  ).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
