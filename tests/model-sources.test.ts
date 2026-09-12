import { expect, test } from "bun:test"

import type { RuntimeConfig } from "../src/lib/runtime-config"

import {
  buildPublishedModels,
  containsSourceSuffix,
  findReservedSuffixConflicts,
  findUnconfiguredCodexModels,
  formatSourceModel,
  parseSourceModel,
} from "../src/lib/model-sources"
import { defaultProviderConfig } from "../src/lib/runtime-config"

const configWith = (
  overrides: {
    codex?: Partial<RuntimeConfig["providers"]["codex"]>
    copilot?: Partial<RuntimeConfig["providers"]["copilot"]>
    deepseek?: Partial<RuntimeConfig["providers"]["deepseek"]>
  } = {},
): RuntimeConfig => {
  const defaults = defaultProviderConfig().providers
  return {
    environment: "test",
    providers: {
      ...defaults,
      codex: { ...defaults.codex, ...overrides.codex },
      copilot: { ...defaults.copilot, ...overrides.copilot },
      deepseek: { ...defaults.deepseek, ...overrides.deepseek },
    },
  }
}

const enabledCodex = (models: Array<string> = []) => ({
  enabled: true,
  models,
})

test("formats and parses source suffixes", () => {
  expect(formatSourceModel("gpt-5.6-luna", "codex")).toBe("gpt-5.6-luna(codex)")
  expect(parseSourceModel("gpt-5.6-luna(copilot)")).toEqual({
    baseId: "gpt-5.6-luna",
    source: "copilot",
  })
})

test("rejects malformed suffix ids", () => {
  expect(parseSourceModel("gpt-5.6-luna(Codex)")).toBeUndefined()
  expect(parseSourceModel("gpt-5.6-luna(copilot)(codex)")).toBeUndefined()
  expect(parseSourceModel("(codex)")).toBeUndefined()
  expect(parseSourceModel("gpt-5.6-luna ")).toBeUndefined()
  expect(parseSourceModel("gpt-5.6-luna")).toBeUndefined()

  expect(containsSourceSuffix("gpt-5.6-luna(Copilot)")).toBe(true)
  expect(containsSourceSuffix("gpt-5.6-luna")).toBe(false)
  expect(findReservedSuffixConflicts(["a", "b(codex)"])).toEqual(["b(codex)"])
})

test("publishes nothing extra while the Codex provider is disabled", () => {
  const published = buildPublishedModels({
    config: configWith(),
    officialModels: ["gpt-5.6-luna"],
    copilotModels: ["gpt-5.6-luna"],
  })

  expect(published.suffixMode).toBe(false)
  expect(published.entries.size).toBe(0)
})

test("publishes one suffixed entry per provider that serves the model", () => {
  const published = buildPublishedModels({
    config: configWith({ codex: enabledCodex() }),
    catalog: new Map([
      ["gpt-5.6-luna", { display_name: "GPT-5.6 Luna", slug: "gpt-5.6-luna" }],
    ]),
    officialModels: ["gpt-5.6-luna"],
    copilotModels: ["gpt-5.6-luna"],
  })

  expect([...published.entries.keys()].toSorted()).toEqual([
    "gpt-5.6-luna(codex)",
    "gpt-5.6-luna(copilot)",
  ])
  expect(published.entries.get("gpt-5.6-luna(codex)")).toMatchObject({
    baseModel: "gpt-5.6-luna",
    displayName: "GPT-5.6 Luna(codex)",
    provider: "codex",
    upstreamModel: "gpt-5.6-luna",
  })
  expect(published.entries.get("gpt-5.6-luna(copilot)")).toMatchObject({
    displayName: "GPT-5.6 Luna(copilot)",
    provider: "copilot",
    upstreamModel: "gpt-5.6-luna",
  })
})

test("omits the Copilot entry when Copilot is disabled or lacks the model", () => {
  const copilotOff = buildPublishedModels({
    config: configWith({
      codex: enabledCodex(),
      copilot: { enabled: false },
    }),
    officialModels: ["gpt-5.6-luna"],
    copilotModels: ["gpt-5.6-luna"],
  })
  expect([...copilotOff.entries.keys()]).toEqual(["gpt-5.6-luna(codex)"])

  const copilotMissing = buildPublishedModels({
    config: configWith({ codex: enabledCodex() }),
    officialModels: ["gpt-5.6-luna"],
    copilotModels: [],
  })
  expect([...copilotMissing.entries.keys()]).toEqual(["gpt-5.6-luna(codex)"])
})

test("treats an empty whitelist as every official model", () => {
  const published = buildPublishedModels({
    config: configWith({ codex: enabledCodex() }),
    officialModels: ["gpt-5.6-luna", "gpt-5.5"],
    copilotModels: [],
  })

  expect([...published.entries.keys()]).toEqual([
    "gpt-5.6-luna(codex)",
    "gpt-5.5(codex)",
  ])
})

test("restricts Codex to the configured whitelist", () => {
  const published = buildPublishedModels({
    config: configWith({ codex: enabledCodex(["gpt-5.5"]) }),
    officialModels: ["gpt-5.6-luna", "gpt-5.5"],
    copilotModels: ["gpt-5.6-luna"],
  })

  expect([...published.entries.keys()].toSorted()).toEqual([
    "gpt-5.5(codex)",
    "gpt-5.6-luna(copilot)",
  ])
})

test("suffixes a whitelisted custom model without renaming its bare id", () => {
  const published = buildPublishedModels({
    config: configWith({ codex: enabledCodex(["local-passthrough"]) }),
    officialModels: [],
    customModels: ["local-passthrough"],
    copilotModels: [],
  })

  expect([...published.entries.keys()]).toEqual(["local-passthrough(codex)"])
})

test("never suffixes a configured DeepSeek model or a reserved id", () => {
  const published = buildPublishedModels({
    config: configWith({
      codex: enabledCodex(["deepseek-flash"]),
      deepseek: { enabled: true, models: ["deepseek-flash"] },
    }),
    officialModels: ["deepseek-flash", "gpt-5.5(codex)"],
    copilotModels: ["deepseek-flash"],
  })

  expect(published.entries.size).toBe(0)
})

test("reports configured Codex models without a catalog definition", () => {
  const config = configWith({ codex: enabledCodex(["gpt-5.5", "missing"]) })

  expect(findUnconfiguredCodexModels(config, ["gpt-5.5"])).toEqual(["missing"])
  expect(findUnconfiguredCodexModels(configWith(), ["anything"])).toEqual([])
})
