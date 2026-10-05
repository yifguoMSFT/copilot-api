import consola from "consola"
import fs from "node:fs/promises"
import path from "node:path"
import { z } from "zod"

import { deepSeekCodexModels } from "~/providers/deepseek/models"

import { HTTPError } from "./error"

const CATALOG_URL =
  "https://raw.githubusercontent.com/openai/codex/refs/heads/main/codex-rs/models-manager/models.json"

const catalogSchema = z.looseObject({
  models: z.array(z.looseObject({ slug: z.string().min(1) })),
})

export interface CodexCatalogOptions {
  outputFile: string
  customFiles: Array<string>
  upstreamCacheFile?: string
  deepSeekModels?: Array<string>
  disabledModels?: Array<string>
}

export async function refreshCodexModels(
  input: string | CodexCatalogOptions,
): Promise<void> {
  const legacy = typeof input === "string"
  const output =
    legacy ? path.join(input, "codex-models.json") : input.outputFile
  const directory = path.dirname(output)
  const customFiles =
    legacy ? [path.join(input, "codex-models-custom.json")] : input.customFiles
  const cacheFile =
    legacy ? undefined : (
      (input.upstreamCacheFile
      ?? path.join(directory, "codex-models-upstream.json"))
    )
  const temporary = `${output}.${process.pid}.tmp`

  try {
    const customModels: Array<Record<string, unknown>> = []
    for (const customPath of customFiles) {
      const customText = await fs
        .readFile(customPath)
        .catch((error: unknown) => {
          if ((error as NodeJS.ErrnoException).code === "ENOENT")
            return undefined
          throw error
        })
      if (customText !== undefined) {
        customModels.push(
          ...catalogSchema.parse(JSON.parse(customText.toString("utf8")))
            .models,
        )
      }
    }
    let upstream: z.infer<typeof catalogSchema>
    try {
      const response = await fetch(CATALOG_URL, {
        signal: AbortSignal.timeout(10_000),
      })
      if (!response.ok)
        throw new HTTPError("Failed to fetch the Codex model catalog", response)
      upstream = catalogSchema.parse(await response.json())
      if (cacheFile !== undefined) {
        await fs.mkdir(path.dirname(cacheFile), { recursive: true })
        await fs.writeFile(cacheFile, `${JSON.stringify(upstream, null, 2)}\n`)
      }
    } catch (error) {
      if (cacheFile === undefined) throw error
      upstream = await fs
        .readFile(cacheFile, "utf8")
        .then((text) => catalogSchema.parse(JSON.parse(text)))
        .catch(() => ({ models: [] }))
      consola.warn(
        "Could not refresh upstream Codex catalog; using local sources",
        error,
      )
    }
    const enabledDeepSeek =
      legacy ?
        []
      : deepSeekCodexModels.filter((model) =>
          input.deepSeekModels?.includes(String(model.slug)),
        )
    const models = new Map(
      [...upstream.models, ...enabledDeepSeek, ...customModels].map((model) => [
        model.slug,
        model,
      ]),
    )

    const exclusions = excludeModels(models, legacy ? [] : input.disabledModels)

    await fs.mkdir(directory, { recursive: true })
    await fs.writeFile(
      temporary,
      `${JSON.stringify({ ...upstream, models: [...models.values()] }, null, 2)}\n`,
    )
    await fs.rename(temporary, output)
    consola.info(
      `Updated Codex model catalog: ${output} (${models.size} models)`,
    )
    if (exclusions !== undefined) {
      consola.info("Codex catalog exclusions", exclusions)
    }
  } catch (error) {
    consola.warn(
      "Could not refresh Codex model catalog; existing catalog kept",
      error,
    )
    await fs.rm(temporary, { force: true }).catch((cleanupError: unknown) => {
      consola.warn(
        "Could not remove temporary Codex model catalog",
        cleanupError,
      )
    })
  }
}

function excludeModels(
  models: Map<unknown, unknown>,
  configured: Array<string> = [],
): { removed: Array<string>; unmatched: Array<string> } | undefined {
  if (configured.length === 0) return undefined
  const removed: Array<string> = []
  const unmatched: Array<string> = []
  for (const slug of new Set(configured)) {
    if (models.delete(slug)) removed.push(slug)
    else unmatched.push(slug)
  }
  return { removed, unmatched }
}
