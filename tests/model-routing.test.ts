import { expect, test } from "bun:test"

import type { RuntimeConfig } from "../src/lib/runtime-config"

import { resolveModelRoute } from "../src/lib/model-routing"

const config: RuntimeConfig = {
  environment: "test",
  providers: {
    copilot: { enabled: true, stripReasoningContentForGpt: true },
    deepseek: {
      enabled: true,
      baseUrl: "https://api.deepseek.com",
      apiKeyEnv: "DEEPSEEK_API_KEY",
      models: ["deepseek-flash"],
    },
  },
  catalog: { enabled: false, customFiles: [], outputFile: "models.json" },
}

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
