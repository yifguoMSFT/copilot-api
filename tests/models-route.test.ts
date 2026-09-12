import { afterEach, beforeEach, describe, expect, test } from "bun:test"

import type { Model, ModelsResponse } from "../src/services/copilot/get-models"

import {
  buildPublishedModels,
  type PublishedModels,
} from "../src/lib/model-sources"
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

const publishedFor = (
  config: RuntimeConfig,
  officialModels: Array<string>,
  copilotModels: Array<string>,
): PublishedModels =>
  buildPublishedModels({ config, copilotModels, officialModels })

beforeEach(() => {
  state.models = modelsResponse
})

afterEach(() => {
  state.models = undefined
  state.runtimeConfig = undefined
  state.publishedModels = undefined
})

describe("model catalogue", () => {
  test("orders Codex, DeepSeek and Copilot including bare models and aliases", async () => {
    const config = withCodex(["gpt-5.6-luna"])
    config.providers.deepseek.enabled = true
    state.runtimeConfig = config
    state.models = {
      data: [copilotModel, { ...copilotModel, id: "gpt-5.6-luna" }],
      object: "list",
    }
    state.publishedModels = publishedFor(
      config,
      ["gpt-5.6-luna"],
      ["gpt-5.6-luna"],
    )
    const { data } = await listModels("/v1/models")
    expect(data.map((model) => model.id)).toEqual([
      "----codex----",
      "gpt-5.6-luna(codex)",
      "----deepseek----",
      "deepseek-flash",
      "deepseek-v4-pro",
      "----copilot----",
      "gpt-5.6-luna(copilot)",
      "gpt-copilot",
      "codex-auto-review",
    ])
  })
  test("publishes one suffixed entry per source and hides the bare id", async () => {
    const config = withCodex(["gpt-5.6-luna"])
    state.models = {
      data: [copilotModel, { ...copilotModel, id: "gpt-5.6-luna" }],
      object: "list",
    }
    state.runtimeConfig = config
    state.publishedModels = publishedFor(
      config,
      ["gpt-5.6-luna"],
      ["gpt-5.6-luna"],
    )

    const { data } = await listModels("/models")
    const ids = data.map((model) => model.id)

    expect(ids).toContain("gpt-5.6-luna(copilot)")
    expect(ids).toContain("gpt-5.6-luna(codex)")
    expect(ids).not.toContain("gpt-5.6-luna")
    // The unrelated Copilot model and the explicit alias stay reachable.
    expect(ids).toContain("gpt-copilot")
    expect(ids).toContain("codex-auto-review")
    expect(data.find((model) => model.id === "gpt-5.6-luna(codex)")) //
      .toMatchObject({
        owned_by: "codex",
        display_name: "gpt-5.6-luna(codex)",
      })
    expect(data.find((model) => model.id === "gpt-5.6-luna(copilot)")) //
      .toMatchObject({ owned_by: "copilot" })
  })

  test("serves the same catalogue with and without the /v1 prefix", async () => {
    state.runtimeConfig = withCodex(["gpt-5.6-luna"])

    const plain = await listModels("/models")
    const versioned = await listModels("/v1/models")

    expect(versioned).toEqual(plain)
  })

  test("does not publish Codex models while the provider is disabled", async () => {
    const config: RuntimeConfig = {
      environment: "test",
      providers: defaultProviderConfig().providers,
    }
    state.runtimeConfig = config
    // A disabled provider resolves no source suffix, even for a model that is
    // present in the Copilot catalogue.
    state.publishedModels = publishedFor(
      config,
      ["gpt-copilot"],
      ["gpt-copilot"],
    )

    const { data } = await listModels("/models")

    expect(data.map((model) => model.id)).toEqual([
      "----copilot----",
      "gpt-copilot",
    ])
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
      providers.deepseek.models.length + 1,
    )
  })
})
