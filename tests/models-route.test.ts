import { afterEach, beforeEach, describe, expect, test } from "bun:test"

import type { Model, ModelsResponse } from "../src/services/copilot/get-models"

import {
  defaultProviderConfig,
  type RuntimeConfig,
} from "../src/lib/runtime-config"
import { state } from "../src/lib/state"
import { server } from "../src/server"

const copilotModel: Model = {
  capabilities: {
    family: "gpt",
    limits: {},
    object: "model_capabilities",
    supports: {},
    tokenizer: "o200k_base",
    type: "chat",
  },
  id: "gpt-copilot",
  model_picker_enabled: true,
  name: "GPT Copilot",
  object: "model",
  preview: false,
  vendor: "copilot",
  version: "1",
}

const modelsResponse: ModelsResponse = { data: [copilotModel], object: "list" }

const withCodex = (models: Array<string>): RuntimeConfig => {
  const providers = defaultProviderConfig().providers
  return {
    environment: "test",
    providers: {
      ...providers,
      codex: {
        ...providers.codex,
        enabled: true,
        gatewayApiKey: "gateway-key",
        models,
      },
    },
  }
}

const listModels = async (path: string) => {
  const response = await server.request(new Request(`http://localhost${path}`))
  expect(response.status).toBe(200)
  return (await response.json()) as {
    data: Array<Record<string, unknown>>
    object: string
  }
}

beforeEach(() => {
  state.models = modelsResponse
})

afterEach(() => {
  state.models = undefined
  state.runtimeConfig = undefined
})

describe("model catalogue", () => {
  test("publishes an enabled Codex model as a routable entry", async () => {
    state.runtimeConfig = withCodex(["codex-test-model"])

    const { data } = await listModels("/models")
    const codex = data.find((model) => model.id === "codex-test-model")

    expect(codex).toEqual({
      id: "codex-test-model",
      object: "model",
      type: "model",
      created: 0,
      created_at: new Date(0).toISOString(),
      owned_by: "codex",
      display_name: "codex-test-model",
    })
    expect(data.some((model) => model.id === "gpt-copilot")).toBe(true)
  })

  test("serves the same catalogue with and without the /v1 prefix", async () => {
    state.runtimeConfig = withCodex(["codex-test-model"])

    const plain = await listModels("/models")
    const versioned = await listModels("/v1/models")

    expect(versioned).toEqual(plain)
  })

  test("does not publish Codex models while the provider is disabled", async () => {
    state.runtimeConfig = {
      environment: "test",
      providers: defaultProviderConfig().providers,
    }

    const { data } = await listModels("/models")

    expect(data.map((model) => model.id)).toEqual(["gpt-copilot"])
  })

  test("publishes configured DeepSeek models only while that provider is enabled", async () => {
    const providers = defaultProviderConfig().providers
    state.runtimeConfig = {
      environment: "test",
      providers: {
        ...providers,
        deepseek: { ...providers.deepseek, enabled: true },
      },
    }

    const { data } = await listModels("/models")

    expect(data.filter((model) => model.owned_by === "deepseek")).toHaveLength(
      providers.deepseek.models.length,
    )
  })
})
