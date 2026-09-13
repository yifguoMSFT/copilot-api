import { expect, test } from "bun:test"

import type { HttpStatusError } from "../src/lib/error"
import type { PublishedModels } from "../src/lib/model-sources"
import type { RuntimeConfig } from "../src/lib/runtime-config"

import {
  assertModelRoutingConflicts,
  resolveModelRoute,
} from "../src/lib/model-routing"
import { buildPublishedModels } from "../src/lib/model-sources"
import { defaultProviderConfig } from "../src/lib/runtime-config"

const baseConfig = (): RuntimeConfig => ({
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
})

test.each(["----codex----", "----deepseek----", "----copilot----"])(
  "rejects the display-only separator %s before routing",
  (id) => {
    expect(() => resolveModelRoute(id, baseConfig())).toThrow(
      "Select a model below the separator",
    )
  },
)

test.each([true, false])(
  "keeps approval reviews on the Copilot Luna alias while Codex enabled=%s",
  (enabled) => {
    const config = baseConfig()
    config.providers.codex.enabled = enabled
    expect(resolveModelRoute("codex-auto-review", config)).toEqual({
      provider: "copilot",
      requestedModel: "codex-auto-review",
      upstreamModel: "gpt-5.6-luna",
    })
  },
)

const codexConfig = (
  overrides: Partial<RuntimeConfig["providers"]["codex"]> = {},
) => ({
  ...defaultProviderConfig().providers.codex,
  enabled: true,
  models: [],
  ...overrides,
})

const publishedMode = (
  overrides: Partial<RuntimeConfig["providers"]["codex"]> = {},
): { config: RuntimeConfig; published: PublishedModels } => {
  const defaults = baseConfig()
  const config: RuntimeConfig = {
    ...defaults,
    providers: { ...defaults.providers, codex: codexConfig(overrides) },
  }
  const published = buildPublishedModels({
    config,
    officialModels: ["gpt-5.6-luna", "gpt-5.5"],
    copilotModels: ["gpt-5.6-luna"],
  })
  return { config, published }
}

const routeError = (run: () => unknown): HttpStatusError => {
  try {
    run()
  } catch (error) {
    return error as HttpStatusError
  }
  throw new Error("expected the model to be rejected")
}

test("routes configured DeepSeek models exactly", () => {
  expect(resolveModelRoute("deepseek-flash", baseConfig())).toEqual({
    provider: "deepseek",
    requestedModel: "deepseek-flash",
    upstreamModel: "deepseek-flash",
  })
})

test("does not send an unknown DeepSeek model to Copilot", () => {
  expect(() => resolveModelRoute("deepseek-typo", baseConfig())).toThrow(
    "DeepSeek model is not configured",
  )
})

test("routes ordinary models to Copilot", () => {
  expect(resolveModelRoute("gpt-test", baseConfig()).provider).toBe("copilot")
})

test("routes a published Copilot suffix to Copilot without its suffix", () => {
  const { config, published } = publishedMode()

  expect(resolveModelRoute("gpt-5.6-luna(copilot)", config, published)).toEqual(
    {
      provider: "copilot",
      requestedModel: "gpt-5.6-luna(copilot)",
      upstreamModel: "gpt-5.6-luna",
    },
  )
})

test("routes a published Codex suffix to Codex without its suffix", () => {
  const { config, published } = publishedMode()

  expect(resolveModelRoute("gpt-5.6-luna(codex)", config, published)).toEqual({
    provider: "codex",
    requestedModel: "gpt-5.6-luna(codex)",
    upstreamModel: "gpt-5.6-luna",
  })
})

test("keeps the unsuffixed model on the Copilot path while Codex is enabled", () => {
  const { config, published } = publishedMode({ models: ["gpt-5.6-luna"] })

  expect(resolveModelRoute("gpt-5.6-luna", config, published)).toEqual({
    provider: "copilot",
    requestedModel: "gpt-5.6-luna",
    upstreamModel: "gpt-5.6-luna",
  })
})

test("rejects a Codex suffix while the Codex provider is disabled", () => {
  const config = baseConfig()
  const published = buildPublishedModels({
    config,
    officialModels: ["gpt-5.6-luna"],
    copilotModels: ["gpt-5.6-luna"],
  })
  expect(published.suffixMode).toBe(false)

  const error = routeError(() =>
    resolveModelRoute("gpt-5.6-luna(codex)", config, published),
  )
  expect(error.status).toBe(400)
  expect(error.code).toBe("model_provider_disabled")
})

test("rejects a Copilot suffix while source suffixes are not published", () => {
  const config = baseConfig()
  const published = buildPublishedModels({
    config,
    officialModels: ["gpt-5.6-luna"],
    copilotModels: ["gpt-5.6-luna"],
  })

  const error = routeError(() =>
    resolveModelRoute("gpt-5.6-luna(copilot)", config, published),
  )
  expect(error.status).toBe(400)
  expect(error.code).toBe("model_suffix_disabled")
})

test("never falls back for an unpublished suffix of an enabled provider", () => {
  // Copilot does not serve gpt-5.5 in this catalogue.
  const { config, published } = publishedMode()

  const copilotError = routeError(() =>
    resolveModelRoute("gpt-5.5(copilot)", config, published),
  )
  expect(copilotError.code).toBe("model_not_available")

  // Codex only serves the models its whitelist allows.
  const restricted = publishedMode({ models: ["gpt-5.6-luna"] })

  const codexError = routeError(() =>
    resolveModelRoute(
      "gpt-5.5(codex)",
      restricted.config,
      restricted.published,
    ),
  )
  expect(codexError.code).toBe("model_not_available")
})

test("treats a malformed or repeated suffix as an invalid model", () => {
  const { config, published } = publishedMode()

  expect(
    routeError(() =>
      resolveModelRoute("gpt-5.6-luna(Codex)", config, published),
    ).code,
  ).toBe("invalid_model")
  expect(
    routeError(() =>
      resolveModelRoute("gpt-5.6-luna(copilot)(codex)", config, published),
    ).code,
  ).toBe("invalid_model")
  expect(
    routeError(() => resolveModelRoute("(codex)", config, published)).code,
  ).toBe("invalid_model")
})

test("does not send an unavailable model to Copilot when Copilot is disabled", () => {
  const defaults = baseConfig()
  const config: RuntimeConfig = {
    ...defaults,
    providers: {
      ...defaults.providers,
      copilot: { enabled: false, stripReasoningContentForGpt: true },
    },
  }

  expect(() => resolveModelRoute("gpt-test", config)).toThrow(
    "Model is not available",
  )
})

test("rejects a duplicate or suffixed configured model id", () => {
  const base = baseConfig().providers

  expect(() =>
    assertModelRoutingConflicts({
      environment: "test",
      providers: {
        ...base,
        codex: codexConfig({ models: ["gpt-5.5", "gpt-5.5"] }),
      },
    }),
  ).toThrow("configured twice")

  expect(() =>
    assertModelRoutingConflicts({
      environment: "test",
      providers: {
        ...base,
        codex: codexConfig({ models: ["gpt-5.5(codex)"] }),
      },
    }),
  ).toThrow("must not carry a source suffix")
})

test("allows a base model both providers can serve", () => {
  const base = baseConfig().providers

  expect(() =>
    assertModelRoutingConflicts({
      environment: "test",
      providers: {
        ...base,
        codex: codexConfig({ models: ["gpt-5.6-luna"] }),
      },
    }),
  ).not.toThrow()

  expect(() =>
    assertModelRoutingConflicts({
      environment: "test",
      providers: {
        ...base,
        codex: codexConfig({ enabled: false, models: ["deepseek-flash"] }),
      },
    }),
  ).not.toThrow()
})

test("routes gemini-3.8-flash-tiered to antigravity provider", () => {
  const config = baseConfig()
  config.providers.antigravity = { enabled: true }
  expect(resolveModelRoute("gemini-3.8-flash-tiered", config)).toEqual({
    provider: "antigravity",
    requestedModel: "gemini-3.8-flash-tiered",
    upstreamModel: "gemini-3.8-flash-tiered",
  })
})

test("rejects gemini-3.8-flash-tiered when antigravity provider is disabled", () => {
  const config = baseConfig()
  config.providers.antigravity = { enabled: false }
  expect(() => resolveModelRoute("gemini-3.8-flash-tiered", config)).toThrow(
    "Antigravity provider is disabled for model: gemini-3.8-flash-tiered"
  )
})

test("resolveAntigravityUpstreamModel maps low, medium, high to exact upstream model with medium default", async () => {
  const { resolveAntigravityUpstreamModel } = await import("../src/services/antigravity/models")
  expect(resolveAntigravityUpstreamModel("low")).toBe("gemini-3.8-flash-low")
  expect(resolveAntigravityUpstreamModel("medium")).toBe("gemini-3.8-flash-medium")
  expect(resolveAntigravityUpstreamModel("high")).toBe("gemini-3.8-flash-high")
  expect(resolveAntigravityUpstreamModel()).toBe("gemini-3.8-flash-medium")
  expect(resolveAntigravityUpstreamModel("unrecognized")).toBe("gemini-3.8-flash-medium")
})
