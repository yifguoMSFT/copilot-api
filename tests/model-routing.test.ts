import { expect, test } from "bun:test"

import type { RuntimeConfig } from "../src/lib/runtime-config"

import {
  assertModelRoutingConflicts,
  resolveModelRoute,
} from "../src/lib/model-routing"
import { defaultProviderConfig } from "../src/lib/runtime-config"

const config: RuntimeConfig = {
  environment: "test",
  providers: {
    ...defaultProviderConfig().providers,
    copilot: { enabled: true, stripReasoningContentForGpt: true },
    deepseek: {
      enabled: true,
      baseUrl: "https://api.deepseek.com",
      apiKey: "test-key",
      models: ["deepseek-flash"],
    },
  },
}

const codexConfig = (
  overrides: Partial<RuntimeConfig["providers"]["codex"]> = {},
) => ({
  ...defaultProviderConfig().providers.codex,
  enabled: true,
  gatewayApiKey: "gateway-key",
  models: ["codex-test-model"],
  ...overrides,
})

test("routes configured DeepSeek models exactly", () => {
  expect(resolveModelRoute("deepseek-flash", config)).toEqual({
    provider: "deepseek",
    requestedModel: "deepseek-flash",
    upstreamModel: "deepseek-flash",
  })
})

test("does not send an unknown DeepSeek model to Copilot", () => {
  expect(() => resolveModelRoute("deepseek-typo", config)).toThrow(
    "DeepSeek model is not configured",
  )
})

test("routes ordinary models to Copilot", () => {
  expect(resolveModelRoute("gpt-test", config).provider).toBe("copilot")
})

test("routes a configured Codex model exactly, without rewriting its name", () => {
  const withCodex: RuntimeConfig = {
    ...config,
    providers: { ...config.providers, codex: codexConfig() },
  }

  expect(resolveModelRoute("codex-test-model", withCodex)).toEqual({
    provider: "codex",
    requestedModel: "codex-test-model",
    upstreamModel: "codex-test-model",
  })
})

test("never falls back to Copilot for a disabled Codex model", () => {
  const withDisabledCodex: RuntimeConfig = {
    ...config,
    providers: {
      ...config.providers,
      codex: codexConfig({ enabled: false }),
    },
  }

  expect(() =>
    resolveModelRoute("codex-test-model", withDisabledCodex),
  ).toThrow("Codex provider is disabled")
})

test("matches Codex before the Copilot fallback path", () => {
  const withCodex: RuntimeConfig = {
    ...config,
    providers: {
      ...config.providers,
      codex: codexConfig({ models: ["gpt-test-alias"] }),
    },
  }

  expect(resolveModelRoute("gpt-test-alias", withCodex).provider).toBe("codex")
})

test("rejects Codex model collisions with the other providers", () => {
  const base = config.providers

  expect(() =>
    assertModelRoutingConflicts({
      environment: "test",
      providers: {
        ...base,
        codex: codexConfig({ models: ["deepseek-flash"] }),
      },
    }),
  ).toThrow("both the Codex and DeepSeek")

  expect(() =>
    assertModelRoutingConflicts({
      environment: "test",
      providers: {
        ...base,
        codex: codexConfig({ models: ["codex-auto-review"] }),
      },
    }),
  ).toThrow("Copilot model alias")

  expect(() =>
    assertModelRoutingConflicts(
      {
        environment: "test",
        providers: { ...base, codex: codexConfig() },
      },
      ["codex-test-model"],
    ),
  ).toThrow("both the Codex and Copilot")

  expect(() =>
    assertModelRoutingConflicts({
      environment: "test",
      providers: {
        ...base,
        codex: codexConfig({
          models: ["codex-test-model", "codex-test-model"],
        }),
      },
    }),
  ).toThrow("configured twice")
})

test("skips conflict checks while the Codex provider is disabled", () => {
  expect(() =>
    assertModelRoutingConflicts({
      environment: "test",
      providers: {
        ...config.providers,
        codex: codexConfig({ enabled: false, models: ["deepseek-flash"] }),
      },
    }),
  ).not.toThrow()
})
