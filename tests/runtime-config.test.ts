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

test("loads config.json from cwd by default", async () => {
  const file = await fixture({
    version: 1,
    defaults: { providers: { deepseek: { apiKey: "default-key" } } },
  })
  const config = await loadRuntimeConfig({ cwd: path.dirname(file), env: {} })
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

test("uses built-in provider defaults without config.json", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "copilot-empty-"))
  directories.push(directory)
  const config = await loadRuntimeConfig({ cwd: directory, env: {} })
  expect(config.source).toBeUndefined()
  expect(config.providers.copilot.enabled).toBe(true)
})

test("enables GPT reasoning content stripping by default", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "copilot-empty-"))
  directories.push(directory)
  const withoutFile = await loadRuntimeConfig({ cwd: directory, env: {} })
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
    gatewayApiKey: "",
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
    env: { COPILOT_API_GATEWAY_API_KEY: "gateway-secret" },
  })

  expect(config.providers.codex).toEqual({
    authProfile: "work",
    baseUrl: "https://chatgpt.com/backend-api/codex",
    enabled: true,
    gatewayApiKey: "gateway-secret",
    models: ["codex-test-model"],
    transport: "http",
  })

  const overridden = await loadRuntimeConfig({
    configPath: file,
    env: {
      COPILOT_API_CODEX_AUTH_PROFILE: "personal",
      COPILOT_API_CODEX_ENABLED: "false",
      COPILOT_API_GATEWAY_API_KEY: "gateway-secret",
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
    env: { COPILOT_API_GATEWAY_API_KEY: "gateway-secret" },
  })

  expect(config.providers.copilot.enabled).toBe(false)
  expect(config.providers.codex.enabled).toBe(true)
})

test("fails when Codex is enabled without a gateway key", async () => {
  const file = await fixture({
    version: 1,
    defaults: {
      providers: { codex: { enabled: true, models: ["codex-test-model"] } },
    },
  })

  expect(loadRuntimeConfig({ configPath: file, env: {} })).rejects.toThrow(
    "gateway API key",
  )
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
    env: { COPILOT_API_GATEWAY_API_KEY: "gateway-secret" },
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
      env: { COPILOT_API_GATEWAY_API_KEY: "gateway-secret" },
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
      env: { COPILOT_API_GATEWAY_API_KEY: "gateway-secret" },
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
      env: { COPILOT_API_GATEWAY_API_KEY: "gateway-secret" },
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
      env: { COPILOT_API_GATEWAY_API_KEY: "gateway-secret" },
    }),
  ).rejects.toThrow()
})
