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
    defaults: {
      providers: { deepseek: { enabled: true, apiKey: "test-key" } },
    },
    environments: { dev: {} },
  })
  const config = await loadRuntimeConfig({
    configPath: file,
    environment: "dev",
    env: { COPILOT_API_COPILOT_ENABLED: "false" },
  })
  expect(config.providers.copilot.enabled).toBe(false)
  expect(config.providers.deepseek.enabled).toBe(true)
  expect(config.providers.deepseek.apiKey).toBe("test-key")
})

test("loads config.json from the package root by default", async () => {
  const file = await fixture({
    version: 1,
    defaults: { providers: { deepseek: { apiKey: "default-key" } } },
  })
  const config = await loadRuntimeConfig({
    packageRoot: path.dirname(file),
    env: {},
  })
  expect(config.source).toBe(file)
  expect(config.providers.deepseek.apiKey).toBe("default-key")
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

test("uses built-in provider defaults without config.json", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "copilot-empty-"))
  directories.push(directory)
  const config = await loadRuntimeConfig({
    cwd: directory,
    packageRoot: directory,
    env: {},
  })
  expect(config.source).toBeUndefined()
  expect(config.providers.copilot.enabled).toBe(true)
})

test("enables GPT reasoning content stripping by default", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "copilot-empty-"))
  directories.push(directory)
  const withoutFile = await loadRuntimeConfig({
    cwd: directory,
    packageRoot: directory,
    env: {},
  })
  expect(withoutFile.providers.copilot.stripReasoningContentForGpt).toBe(true)

  const file = await fixture({
    version: 1,
    defaults: { providers: { copilot: { enabled: true } } },
  })
  const omitted = await loadRuntimeConfig({ configPath: file, env: {} })
  expect(omitted.providers.copilot.stripReasoningContentForGpt).toBe(true)
})

test("honors an explicit disable of GPT reasoning content stripping", async () => {
  const file = await fixture({
    version: 1,
    defaults: {
      providers: { copilot: { stripReasoningContentForGpt: false } },
    },
  })
  const config = await loadRuntimeConfig({ configPath: file, env: {} })
  expect(config.providers.copilot.stripReasoningContentForGpt).toBe(false)
  expect(config.providers.copilot.enabled).toBe(true)
})

test("keeps the Codex provider disabled for existing configurations", async () => {
  const file = await fixture({
    version: 1,
    defaults: { providers: { deepseek: { apiKey: "default-key" } } },
  })
  const config = await loadRuntimeConfig({ configPath: file, env: {} })

  expect(config.providers.codex).toEqual({
    authProfile: "default",
    baseUrl: "https://chatgpt.com/backend-api/codex",
    enabled: false,
    models: [],
    transport: "http",
  })
})

test("enables the Codex provider from configuration and environment", async () => {
  const file = await fixture({
    version: 1,
    defaults: {
      providers: {
        codex: {
          authProfile: "work",
          enabled: true,
          models: ["codex-test-model"],
        },
      },
    },
  })
  const config = await loadRuntimeConfig({
    configPath: file,
    env: {},
  })

  expect(config.providers.codex).toEqual({
    authProfile: "work",
    baseUrl: "https://chatgpt.com/backend-api/codex",
    enabled: true,
    models: ["codex-test-model"],
    transport: "http",
  })

  const overridden = await loadRuntimeConfig({
    configPath: file,
    env: {
      COPILOT_API_CODEX_AUTH_PROFILE: "personal",
      COPILOT_API_CODEX_ENABLED: "false",
    },
  })
  expect(overridden.providers.codex.enabled).toBe(false)
  expect(overridden.providers.codex.authProfile).toBe("personal")
})

test("allows a Codex-only configuration", async () => {
  const file = await fixture({
    version: 1,
    defaults: {
      providers: {
        codex: { enabled: true, models: ["codex-test-model"] },
        copilot: { enabled: false },
      },
    },
  })

  const config = await loadRuntimeConfig({
    configPath: file,
    env: {},
  })

  expect(config.providers.copilot.enabled).toBe(false)
  expect(config.providers.codex.enabled).toBe(true)
})

test("enables Codex without a gateway key", async () => {
  const file = await fixture({
    version: 1,
    defaults: {
      providers: { codex: { enabled: true, models: ["codex-test-model"] } },
    },
  })

  const config = await loadRuntimeConfig({ configPath: file, env: {} })
  expect(config.providers.codex.enabled).toBe(true)
})

test("accepts an enabled Codex provider without an explicit model list", async () => {
  const file = await fixture({
    version: 1,
    defaults: {
      providers: { codex: { enabled: true, models: undefined } },
    },
  })

  const config = await loadRuntimeConfig({
    configPath: file,
    env: {},
  })

  // An omitted list is the documented "every official catalog model" default.
  expect(config.providers.codex.models).toEqual([])
})

test("rejects an explicitly empty Codex model list", async () => {
  const file = await fixture({
    version: 1,
    defaults: { providers: { codex: { enabled: true, models: [] } } },
  })

  expect(
    loadRuntimeConfig({
      configPath: file,
      env: {},
    }),
  ).rejects.toThrow()
})

test("refuses to point the ChatGPT credential at another origin", async () => {
  const file = await fixture({
    version: 1,
    defaults: {
      providers: {
        codex: {
          baseUrl: "https://example.com/backend-api/codex",
          enabled: true,
          models: ["codex-test-model"],
        },
      },
    },
  })

  expect(
    loadRuntimeConfig({
      configPath: file,
      env: {},
    }),
  ).rejects.toThrow("must stay on https://chatgpt.com")
})

test("refuses an unsafe Codex credential profile", async () => {
  const file = await fixture({
    version: 1,
    defaults: {
      providers: {
        codex: {
          authProfile: "../escape",
          enabled: true,
          models: ["codex-test-model"],
        },
      },
    },
  })

  expect(
    loadRuntimeConfig({
      configPath: file,
      env: {},
    }),
  ).rejects.toThrow("Invalid Codex authProfile")
})

test("rejects a Codex transport that is not implemented", async () => {
  const file = await fixture({
    version: 1,
    defaults: {
      providers: {
        codex: {
          enabled: true,
          models: ["codex-test-model"],
          transport: "websocket",
        },
      },
    },
  })

  expect(
    loadRuntimeConfig({
      configPath: file,
      env: {},
    }),
  ).rejects.toThrow()
})

test("Antigravity OAuth secret inherits and supports environment overrides", async () => {
  const file = await fixture({
    version: 1,
    defaults: {
      providers: { antigravity: { oauthClientSecret: "default-secret" } },
    },
    environments: {
      custom: {
        providers: { antigravity: { oauthClientSecret: "override-secret" } },
      },
    },
  })
  expect(
    (await loadRuntimeConfig({ configPath: file, env: {} })).providers
      .antigravity.oauthClientSecret,
  ).toBe("default-secret")
  expect(
    (
      await loadRuntimeConfig({
        configPath: file,
        environment: "custom",
        env: {},
      })
    ).providers.antigravity.oauthClientSecret,
  ).toBe("override-secret")
})
