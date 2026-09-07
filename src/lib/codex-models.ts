import consola from "consola"
import fs from "node:fs/promises"
import path from "node:path"
import { z } from "zod"

import { HTTPError } from "./error"

const CATALOG_URL =
  "https://raw.githubusercontent.com/openai/codex/refs/heads/main/codex-rs/models-manager/models.json"

const catalogSchema = z.looseObject({
  models: z.array(z.looseObject({ slug: z.string().min(1) })),
})

export async function refreshCodexModels(
  directory = "E:/workshop/copilot-api",
): Promise<void> {
  const output = path.join(directory, "codex-models.json")
  const temporary = `${output}.${process.pid}.tmp`

  try {
    const customText = await fs.readFile(
      path.join(directory, "codex-models-custom.json"),
    )
    const custom = catalogSchema.parse(JSON.parse(customText.toString("utf8")))
    const response = await fetch(CATALOG_URL, {
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) {
      throw new HTTPError("Failed to fetch the Codex model catalog", response)
    }
    const upstream = catalogSchema.parse(await response.json())
    const models = new Map(
      [...upstream.models, ...custom.models].map((model) => [
        model.slug,
        model,
      ]),
    )

    await fs.writeFile(
      temporary,
      `${JSON.stringify({ ...upstream, models: [...models.values()] }, null, 2)}\n`,
    )
    await fs.rename(temporary, output)
    consola.info(
      `Updated Codex model catalog: ${output} (${models.size} models)`,
    )
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
