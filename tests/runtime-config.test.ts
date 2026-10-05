import { afterEach, expect, test } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"

import { loadRuntimeConfig } from "../src/lib/runtime-config"

const directories: Array<string> = []

test("compaction routing is opt-in for absent and old configs", async () => {
  const absentFile = await fixture({ version: 1 })
  await fs.unlink(absentFile)
  expect(
    (
      await loadRuntimeConfig({
        packageRoot: path.dirname(absentFile),
        env: {},
      })
    ).compaction,
  ).toEqual({
    enabled: false,
  })
  for (const defaults of [{}, { compaction: { model: "gpt-6-luna" } }]) {
    const file = await fixture({ version: 1, defaults })
    expect(
      (await loadRuntimeConfig({ configPath: file, env: {} })).compaction
        .enabled,
    ).toBe(false)
  }
})

test("compaction environments inherit, replace and disable defaults", async () => {
  const file = await fixture({
    version: 1,
    defaults: { compaction: { enabled: false, model: " gpt-6-luna " } },
    environments: {
      enabled: { compaction: { enabled: true } },
      replaced: { compaction: { enabled: true, model: "gpt-6-sol" } },
    },
  })
  expect(
    (
      await loadRuntimeConfig({
        configPath: file,
        environment: "enabled",
        env: {},
      })
    ).compaction,
  ).toEqual({ enabled: true, model: "gpt-6-luna" })
  expect(
    (
      await loadRuntimeConfig({
        configPath: file,
        environment: "replaced",
        env: {},
      })
    ).compaction.model,
  ).toBe("gpt-6-sol")
  const disabledFile = await fixture({
    version: 1,
    defaults: { compaction: { enabled: true } },
    environments: { disabled: { compaction: { enabled: false } } },
  })
  expect(
    (
      await loadRuntimeConfig({
        configPath: disabledFile,
        environment: "disabled",
        env: {},
      })
    ).compaction,
  ).toEqual({ enabled: false })
})

test.each([
  { enabled: "true" },
  { model: 123 },
  { model: "" },
  { model: "   " },
  { unknown: true },
  { enabled: true },
])("rejects invalid compaction configuration %j", async (compaction) => {
  const file = await fixture({ version: 1, defaults: { compaction } })
  expect(loadRuntimeConfig({ configPath: file, env: {} })).rejects.toThrow()
})

test("validates compaction provider after provider environment overrides", async () => {
  const file = await fixture({
    version: 1,
    defaults: {
      compaction: { enabled: true, model: "gpt-6-luna" },
      providers: { deepseek: { enabled: true } },
    },
  })
  expect(
    loadRuntimeConfig({
      configPath: file,
      env: { COPILOT_API_COPILOT_ENABLED: "false" },
    }),
  ).rejects.toThrow("Model is not available")
  for (const model of ["deepseek-flash", "deepseek-unknown"]) {
    const deepSeekFile = await fixture({
      version: 1,
      defaults: { compaction: { enabled: true, model } },
    })
    expect(
      loadRuntimeConfig({ configPath: deepSeekFile, env: {} }),
    ).rejects.toThrow(
      model === "deepseek-flash" ? "provider is disabled" : "not configured",
    )
  }
  const deepSeekFile = await fixture({
    version: 1,
    defaults: { compaction: { enabled: true, model: "deepseek-flash" } },
  })
  expect(
    (
      await loadRuntimeConfig({
        configPath: deepSeekFile,
        env: { COPILOT_API_DEEPSEEK_ENABLED: "true" },
      })
    ).compaction.enabled,
  ).toBe(true)
})

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

test("catalog exclusions default to empty and environment lists replace defaults", async () => {
  const oldFile = await fixture({ version: 1 })
  expect(
    (await loadRuntimeConfig({ configPath: oldFile, env: {} })).catalog
      .disabledModels,
  ).toEqual([])
  const file = await fixture({
    version: 1,
    defaults: { catalog: { disabledModels: [" gpt-5.6-luna "] } },
    environments: {
      replaced: { catalog: { disabledModels: ["gpt-5.5"] } },
      cleared: { catalog: { disabledModels: [] } },
    },
  })
  for (const [environment, expected] of [
    [undefined, ["gpt-5.6-luna"]],
    ["replaced", ["gpt-5.5"]],
    ["cleared", []],
  ] as const) {
    expect(
      (await loadRuntimeConfig({ configPath: file, environment, env: {} }))
        .catalog.disabledModels,
    ).toEqual([...expected])
  }
})

test.each(["gpt-5.5", [123], [""], ["   "]])(
  "rejects invalid catalog exclusions %j",
  async (disabledModels) => {
    const file = await fixture({
      version: 1,
      defaults: { catalog: { disabledModels } },
    })
    expect(loadRuntimeConfig({ configPath: file, env: {} })).rejects.toThrow()
  },
)

test("automatically loads package config.json including the selected environment", async () => {
  const file = await fixture({
    version: 1,
    defaults: {
      compaction: { enabled: true, model: "gpt-6-luna" },
      catalog: { outputFile: "generated/models.json" },
    },
    environments: { disabled: { compaction: { enabled: false } } },
  })
  const cwd = path.dirname(file)
  const config = await loadRuntimeConfig({
    packageRoot: cwd,
    cwd: os.tmpdir(),
    env: {},
  })
  expect(config.source).toBe(file)
  expect(config.compaction).toEqual({ enabled: true, model: "gpt-6-luna" })
  expect(config.catalog.outputFile).toBe(
    path.join(cwd, "generated/models.json"),
  )
  expect(
    (
      await loadRuntimeConfig({
        packageRoot: cwd,
        cwd: os.tmpdir(),
        environment: "disabled",
        env: {},
      })
    ).compaction.enabled,
  ).toBe(false)
})

test("explicit config paths take precedence over env paths and package config", async () => {
  const autoFile = await fixture({
    version: 1,
    defaults: { compaction: { enabled: true, model: "gpt-6-luna" } },
  })
  const cwd = path.dirname(autoFile)
  const envFile = await fixture({
    version: 1,
    defaults: { compaction: { enabled: true, model: "gpt-6-sol" } },
  })
  const explicitFile = await fixture({ version: 1 })
  const env = { COPILOT_API_CONFIG: envFile }
  expect((await loadRuntimeConfig({ cwd, packageRoot: cwd, env })).source).toBe(
    envFile,
  )
  const config = await loadRuntimeConfig({
    cwd,
    packageRoot: cwd,
    configPath: explicitFile,
    env,
  })
  expect(config.source).toBe(explicitFile)
  expect(config.compaction.enabled).toBe(false)
})

test("missing explicit config fails instead of falling back", async () => {
  const file = await fixture({ version: 1 })
  const cwd = path.dirname(file)
  expect(
    loadRuntimeConfig({ cwd, configPath: "missing.json", env: {} }),
  ).rejects.toThrow("ENOENT")
  expect(
    loadRuntimeConfig({ cwd, env: { COPILOT_API_CONFIG: "missing.json" } }),
  ).rejects.toThrow("ENOENT")
})

test("invalid default config is not silently skipped", async () => {
  const file = await fixture({ version: 1 })
  const cwd = path.dirname(file)
  await fs.writeFile(file, "invalid-json")
  expect(loadRuntimeConfig({ packageRoot: cwd, env: {} })).rejects.toThrow()
  await fs.writeFile(file, '{"version":1,"unexpected":true}')
  expect(loadRuntimeConfig({ packageRoot: cwd, env: {} })).rejects.toThrow()
  await fs.unlink(file)
  await fs.mkdir(file)
  expect(loadRuntimeConfig({ packageRoot: cwd, env: {} })).rejects.toThrow()
})

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

test.each([
  { entryDirectory: "dist", linked: false },
  { entryDirectory: "dist", linked: true },
  { entryDirectory: "src", linked: false },
])(
  "loads package config and catalog from another cwd: %j",
  async ({ entryDirectory, linked }) => {
    const directory = path.dirname(
      await fixture({
        version: 1,
        defaults: { catalog: { disabledModels: ["gpt-5.6-luna"] } },
      }),
    )
    const unrelatedFile = await fixture({ unexpected: "must not be loaded" })
    const binaryDirectory = path.join(directory, entryDirectory)
    await fs.mkdir(binaryDirectory)
    const entrypoint = path.join(binaryDirectory, "main.ts")
    const configModule = pathToFileURL(
      path.resolve(import.meta.dir, "../src/lib/runtime-config.ts"),
    ).href
    await fs.writeFile(
      entrypoint,
      `import { loadRuntimeConfig } from ${JSON.stringify(configModule)};
const config = await loadRuntimeConfig({ env: {} });
console.log(JSON.stringify({ source: config.source, catalog: config.catalog }));`,
    )
    const linkDirectory = path.join(directory, "linked-bin")
    if (linked) await fs.symlink(binaryDirectory, linkDirectory, "junction")
    const child = Bun.spawn(
      [
        process.execPath,
        linked ? path.join(linkDirectory, "main.ts") : entrypoint,
      ],
      { cwd: path.dirname(unrelatedFile), stdout: "pipe", stderr: "pipe" },
    )
    const output = await new Response(child.stdout).text()
    const errors = await new Response(child.stderr).text()
    expect(await child.exited, errors).toBe(0)
    expect(JSON.parse(output)).toEqual({
      source: path.join(await fs.realpath(directory), "config.json"),
      catalog: {
        enabled: true,
        customFiles: [],
        disabledModels: ["gpt-5.6-luna"],
        outputFile: path.join(
          await fs.realpath(directory),
          "codex-models.json",
        ),
      },
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
