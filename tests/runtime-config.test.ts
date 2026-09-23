import { afterEach, expect, test } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"

import { loadRuntimeConfig } from "../src/lib/runtime-config"

const directories: Array<string> = []

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true })),
  )
})

async function fixture(value: unknown): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "copilot-config-"))
  directories.push(directory)
  const file = path.join(directory, "config.json")
  await fs.writeFile(file, JSON.stringify(value))
  return file
}

test("merges defaults, selected environment, and environment variables", async () => {
  const file = await fixture({
    version: 1,
    defaults: { providers: { deepseek: { enabled: true } } },
    environments: {
      dev: { catalog: { outputFile: "generated/models.json" } },
    },
  })
  const config = await loadRuntimeConfig({
    configPath: file,
    environment: "dev",
    env: { COPILOT_API_COPILOT_ENABLED: "false" },
  })
  expect(config.providers.copilot.enabled).toBe(false)
  expect(config.providers.deepseek.enabled).toBe(true)
  expect(config.catalog.outputFile).toBe(
    path.join(path.dirname(file), "generated", "models.json"),
  )
})

test("resolves file paths relative to the config rather than cwd", async () => {
  const file = await fixture({
    version: 1,
    defaults: { catalog: { customFiles: ["models/custom.json"] } },
  })
  const config = await loadRuntimeConfig({
    configPath: file,
    cwd: os.tmpdir(),
    env: {},
  })
  expect(config.catalog.customFiles).toEqual([
    path.join(path.dirname(file), "models", "custom.json"),
  ])
})

test("rejects unknown selected environments", async () => {
  const file = await fixture({ version: 1, environments: {} })
  expect(
    loadRuntimeConfig({ configPath: file, environment: "missing", env: {} }),
  ).rejects.toThrow("Unknown copilot-api environment")
})

test("rejects invalid boolean overrides", () => {
  expect(
    loadRuntimeConfig({ env: { COPILOT_API_COPILOT_ENABLED: "0" } }),
  ).rejects.toThrow("must be true or false")
})

test.each([false, true])(
  "writes above the CLI directory from another cwd (linked: %s)",
  async (linked) => {
    const directory = path.dirname(await fixture({ version: 1 }))
    const binaryDirectory = path.join(directory, "dist")
    await fs.mkdir(binaryDirectory)
    const entrypoint = path.join(binaryDirectory, "main.ts")
    const configModule = pathToFileURL(
      path.resolve(import.meta.dir, "../src/lib/runtime-config.ts"),
    ).href
    await fs.writeFile(
      entrypoint,
      `import { loadRuntimeConfig } from ${JSON.stringify(configModule)};
console.log(JSON.stringify((await loadRuntimeConfig({ env: {} })).catalog));`,
    )
    const linkDirectory = path.join(directory, "linked-bin")
    if (linked) await fs.symlink(binaryDirectory, linkDirectory, "junction")
    const child = Bun.spawn(
      [
        process.execPath,
        linked ? path.join(linkDirectory, "main.ts") : entrypoint,
      ],
      { cwd: os.tmpdir(), stdout: "pipe", stderr: "pipe" },
    )
    const output = await new Response(child.stdout).text()
    const errors = await new Response(child.stderr).text()
    expect(await child.exited, errors).toBe(0)
    expect(JSON.parse(output)).toEqual({
      enabled: true,
      customFiles: [],
      outputFile: path.join(await fs.realpath(directory), "codex-models.json"),
    })
  },
)

test("explicit catalog output overrides the package directory", async () => {
  const file = await fixture({
    version: 1,
    defaults: { catalog: { outputFile: "configured/models.json" } },
  })
  const outputFile = path.join(path.dirname(file), "override", "models.json")
  const config = await loadRuntimeConfig({
    configPath: file,
    env: { COPILOT_API_CATALOG_OUTPUT_FILE: outputFile },
  })
  expect(config.catalog.outputFile).toBe(outputFile)
})
