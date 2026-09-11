import { afterEach, expect, test } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

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

test("uses a portable application data path by default", async () => {
  const config = await loadRuntimeConfig({ env: {} })
  expect(path.isAbsolute(config.catalog.outputFile)).toBe(true)
  expect(config.catalog.outputFile).not.toContain("E:/workshop/copilot-api")
})
