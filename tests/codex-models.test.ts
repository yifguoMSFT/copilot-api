import { afterEach, beforeEach, expect, spyOn, test } from "bun:test"
import consola from "consola"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import {
  buildCatalogEntries,
  buildCodexModelEntries,
  codexModelCapabilities,
  findCodexCatalogGaps,
  loadBaseCatalog,
  loadCodexCatalog,
  refreshUpstreamCatalog,
  refreshCodexModels,
  writePublishedCatalog,
} from "../src/lib/codex-models"
import { buildPublishedModels } from "../src/lib/model-sources"
import {
  defaultProviderConfig,
  type RuntimeConfig,
} from "../src/lib/runtime-config"
import { deepSeekCodexModels } from "../src/providers/deepseek/models"

let directory: string
let fetchMock: ReturnType<typeof spyOn<typeof globalThis, "fetch">>
let warnMock: ReturnType<typeof spyOn<typeof consola, "warn">>
let infoMock: ReturnType<typeof spyOn<typeof consola, "info">>
const previous = '{"models":[{"slug":"previous"}]}\n'

beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "copilot-codex-models-"))
  await fs.writeFile(path.join(directory, "codex-models.json"), previous)
  await fs.writeFile(
    path.join(directory, "codex-models-custom.json"),
    JSON.stringify({
      models: [
        {
          slug: "sol-fast",
          model_messages: { instructions_template: "custom" },
        },
      ],
    }),
  )
  fetchMock = spyOn(globalThis, "fetch")
  warnMock = spyOn(consola, "warn").mockReturnValue(undefined)
  infoMock = spyOn(consola, "info").mockReturnValue(undefined)
})

afterEach(async () => {
  fetchMock.mockRestore()
  warnMock.mockRestore()
  infoMock.mockRestore()
  await fs.rm(directory, { recursive: true, force: true })
})

test("preserves upstream models and metadata, with custom slugs taking precedence", async () => {
  const astra = {
    slug: "astra",
    model_messages: { instructions_template: "upstream" },
  }
  fetchMock.mockResolvedValue(
    Response.json({
      version: 2,
      models: [astra, { slug: "sol-fast", description: "upstream duplicate" }],
    }),
  )

  await refreshCodexModels(directory)

  const output = await fs.readFile(path.join(directory, "codex-models.json"))
  expect(JSON.parse(output.toString("utf8"))).toEqual({
    version: 2,
    models: [
      astra,
      { slug: "sol-fast", model_messages: { instructions_template: "custom" } },
    ],
  })
  expect(fetchMock).toHaveBeenCalledWith(
    "https://raw.githubusercontent.com/openai/codex/refs/heads/main/codex-rs/models-manager/models.json",
    { signal: expect.any(AbortSignal) as AbortSignal },
  )
  expect(warnMock).not.toHaveBeenCalled()
})

test.each([
  "network error",
  "timeout",
  "HTTP error",
  "invalid JSON",
  "invalid schema",
])("keeps the previous catalog and continues after %s", async (failure) => {
  switch (failure) {
    case "network error": {
      fetchMock.mockRejectedValue(new TypeError("fetch failed"))
      break
    }
    case "timeout": {
      fetchMock.mockRejectedValue(
        Object.assign(new Error("Timed out"), { name: "TimeoutError" }),
      )
      break
    }
    case "HTTP error": {
      fetchMock.mockResolvedValue(new Response("Unavailable", { status: 503 }))
      break
    }
    case "invalid JSON": {
      fetchMock.mockResolvedValue(new Response("not json"))
      break
    }
    case "invalid schema": {
      fetchMock.mockResolvedValue(
        Response.json({ models: [{ description: "missing slug" }] }),
      )
      break
    }
    default: {
      throw new Error(`Unknown test case: ${failure}`)
    }
  }

  await refreshCodexModels(directory)
  expect(
    await fs.readFile(path.join(directory, "codex-models.json"), "utf8"),
  ).toBe(previous)
  expect(warnMock).toHaveBeenCalledTimes(1)
  expect(
    (await fs.readdir(directory)).some((name) => name.endsWith(".tmp")),
  ).toBe(false)
})

test("warns and continues if the local custom catalog is invalid", async () => {
  await fs.writeFile(
    path.join(directory, "codex-models-custom.json"),
    "invalid",
  )
  await refreshCodexModels(directory)
  expect(fetchMock).not.toHaveBeenCalled()
  expect(warnMock).toHaveBeenCalledTimes(1)
  expect(
    await fs.readFile(path.join(directory, "codex-models.json"), "utf8"),
  ).toBe(previous)
})

test("continues when offline on first startup without an existing catalog", async () => {
  await fs.unlink(path.join(directory, "codex-models.json"))
  fetchMock.mockRejectedValue(new TypeError("offline"))
  await refreshCodexModels(directory)
  expect(warnMock).toHaveBeenCalledTimes(1)
  expect(await fs.readdir(directory)).toEqual(["codex-models-custom.json"])
})

test("explicit portable configuration can generate local DeepSeek metadata offline", async () => {
  await fs.unlink(path.join(directory, "codex-models.json"))
  fetchMock.mockRejectedValue(new TypeError("offline"))

  await refreshCodexModels({
    outputFile: path.join(directory, "generated", "models.json"),
    customFiles: [path.join(directory, "codex-models-custom.json")],
    upstreamCacheFile: path.join(directory, "upstream.json"),
    deepSeekModels: ["deepseek-flash"],
  })

  const generated = JSON.parse(
    // eslint-disable-next-line unicorn/prefer-json-parse-buffer
    await fs.readFile(path.join(directory, "generated", "models.json"), "utf8"),
  ) as { models: Array<{ slug: string }> }
  expect(generated.models.map((model) => model.slug)).toEqual([
    "deepseek-flash",
    "sol-fast",
  ])
})

test("publishes catalog capabilities without leaking instruction or routing fields", () => {
  const catalog = new Map([
    [
      "gpt-5.5",
      {
        slug: "gpt-5.5",
        context_window: 128_000,
        max_context_window: 256_000,
        default_reasoning_level: "medium",
        description: "Upstream wording",
        display_name: "GPT-5.5",
        input_modalities: ["text", "image"],
        model_messages: { instructions_template: "secret template" },
        prefer_websockets: true,
        supported_reasoning_levels: [
          { description: "Fast", effort: "low" },
          { effort: "medium" },
        ],
        supports_parallel_tool_calls: true,
      },
    ],
  ])

  expect(buildCodexModelEntries(["gpt-5.5"], catalog)).toEqual([
    {
      id: "gpt-5.5",
      object: "model",
      type: "model",
      created: 0,
      created_at: new Date(0).toISOString(),
      owned_by: "codex",
      display_name: "GPT-5.5",
      context_window: 128_000,
      max_context_window: 256_000,
      default_reasoning_level: "medium",
      description: "Upstream wording",
      input_modalities: ["text", "image"],
      supported_reasoning_levels: [
        { description: "Fast", effort: "low" },
        { effort: "medium" },
      ],
      supports_parallel_tool_calls: true,
    },
  ])
})

test("lists a configured model the catalog does not describe", () => {
  expect(buildCodexModelEntries(["local-passthrough"], new Map())).toEqual([
    {
      id: "local-passthrough",
      object: "model",
      type: "model",
      created: 0,
      created_at: new Date(0).toISOString(),
      owned_by: "codex",
      display_name: "local-passthrough",
    },
  ])
})

test("drops malformed capability values instead of failing the catalogue", () => {
  expect(
    codexModelCapabilities({
      context_window: "128000",
      display_name: 5,
      input_modalities: "text",
      supported_reasoning_levels: [{ effort: 3 }],
      supports_parallel_tool_calls: null,
    }),
  ).toEqual({})
  expect(codexModelCapabilities(undefined)).toEqual({})
})

test("treats a missing or malformed local catalogue as no metadata", async () => {
  expect([
    ...(
      await loadCodexCatalog(path.join(directory, "codex-models.json"))
    ).keys(),
  ]).toEqual(["previous"])
  expect(
    await loadCodexCatalog(path.join(directory, "missing.json")),
  ).toHaveProperty("size", 0)

  await fs.writeFile(path.join(directory, "broken.json"), "not json")
  expect(
    await loadCodexCatalog(path.join(directory, "broken.json")),
  ).toHaveProperty("size", 0)
})

test("reports the configured models the App catalogue does not describe", async () => {
  const catalogFile = path.join(directory, "codex-models.json")

  expect(
    await findCodexCatalogGaps(["previous", "gpt-unlisted"], catalogFile),
  ).toEqual(["gpt-unlisted"])
  expect(await findCodexCatalogGaps(["previous"], catalogFile)).toEqual([])
  expect(warnMock).not.toHaveBeenCalled()
})

const codexEnabledConfig = (models: Array<string> = []): RuntimeConfig => ({
  environment: "test",
  providers: {
    ...defaultProviderConfig().providers,
    codex: {
      ...defaultProviderConfig().providers.codex,
      enabled: true,
      models,
    },
  },
})

const baseCatalogFixture = async (): Promise<{
  base: Awaited<ReturnType<typeof loadBaseCatalog>>
  cacheFile: string
}> => {
  const cacheFile = path.join(directory, "codex-models-upstream.json")
  await fs.writeFile(
    cacheFile,
    JSON.stringify({
      version: 2,
      models: [
        { slug: "gpt-5.6-luna", display_name: "Luna", prefer_websockets: true },
        { slug: "gpt-5.5", display_name: "GPT-5.5" },
        { slug: "sol-fast", display_name: "upstream duplicate" },
      ],
    }),
  )
  const base = await loadBaseCatalog({
    customFiles: [path.join(directory, "codex-models-custom.json")],
    extensionModels: [{ slug: "deepseek-flash", display_name: "DeepSeek" }],
    upstreamCacheFile: cacheFile,
  })
  return { base, cacheFile }
}

test("separates official, custom and extension catalog sources", async () => {
  const { base } = await baseCatalogFixture()

  expect(base.officialModels).toEqual(["gpt-5.6-luna", "gpt-5.5", "sol-fast"])
  expect(base.customModels).toEqual([])
  expect(base.extensionModels).toEqual(["deepseek-flash"])
  // A custom definition for an official slug overrides it without losing
  // suffix eligibility.
  expect(base.entries.get("sol-fast")).toMatchObject({
    model_messages: { instructions_template: "custom" },
  })
  expect(base.metadata).toEqual({ version: 2 })
})

test("custom definitions override built-in extensions without losing fields", async () => {
  const customFile = path.join(directory, "deepseek-custom.json")
  const custom = {
    ...deepSeekCodexModels[0],
    shell_type: "unified_exec",
    base_instructions: "Custom instructions",
    custom_metadata: "preserved",
  }
  await fs.writeFile(customFile, JSON.stringify({ models: [custom] }))
  const base = await loadBaseCatalog({
    customFiles: [customFile],
    extensionModels: deepSeekCodexModels,
    upstreamCacheFile: path.join(directory, "missing-upstream.json"),
  })

  expect(base.entries.get("deepseek-flash")).toEqual(custom)
  expect(base.extensionModels).toContain("deepseek-flash")
  expect(base.customModels).not.toContain("deepseek-flash")
  for (const suffixMode of [false, true]) {
    const models = buildCatalogEntries({
      base,
      published: { entries: new Map(), suffixMode },
    })
    expect(models.find((model) => model.slug === "deepseek-flash")).toEqual(
      custom,
    )
  }
})

test("built-in extensions include required Codex startup metadata", async () => {
  const base = await loadBaseCatalog({
    customFiles: [],
    extensionModels: deepSeekCodexModels,
    upstreamCacheFile: path.join(directory, "missing-upstream.json"),
  })
  const models = buildCatalogEntries({
    base,
    published: { entries: new Map(), suffixMode: false },
  })
  expect(models).toHaveLength(2)
  for (const model of models) {
    expect(typeof model.shell_type).toBe("string")
    expect(model.visibility).toBe("list")
    expect(model.supported_in_api).toBe(true)
    expect(typeof model.priority).toBe("number")
    expect(typeof model.base_instructions).toBe("string")
    expect(typeof model.supports_reasoning_summaries).toBe("boolean")
    expect(typeof model.support_verbosity).toBe("boolean")
    expect(model.truncation_policy).toEqual({ mode: "tokens", limit: 10_000 })
    expect(model.experimental_supported_tools).toEqual([])
  }
})

test("keeps custom-only slugs separate from the official model set", async () => {
  const customFile = path.join(directory, "extra-custom.json")
  await fs.writeFile(
    customFile,
    JSON.stringify({ models: [{ slug: "local-passthrough" }] }),
  )

  const base = await loadBaseCatalog({
    customFiles: [customFile],
    upstreamCacheFile: path.join(directory, "codex-models-upstream.json"),
  })

  expect(base.officialModels).toEqual([])
  expect(base.customModels).toEqual(["local-passthrough"])
})

test("publishes one suffixed definition per serving provider", async () => {
  const { base } = await baseCatalogFixture()
  const config = codexEnabledConfig()
  const published = buildPublishedModels({
    catalog: base.entries,
    config,
    customModels: base.customModels,
    copilotModels: ["gpt-5.6-luna"],
    officialModels: base.officialModels,
  })

  const models = buildCatalogEntries({ base, published })
  const slugs = models.map((model) => String(model.slug))

  expect(slugs).toEqual([
    "gpt-5.6-luna(codex)",
    "gpt-5.5(codex)",
    "sol-fast(codex)",
    "deepseek-flash",
    "gpt-5.6-luna(copilot)",
  ])

  expect(slugs.toSorted()).toEqual([
    "deepseek-flash",
    "gpt-5.5(codex)",
    "gpt-5.6-luna(codex)",
    "gpt-5.6-luna(copilot)",
    "sol-fast(codex)",
  ])
  // The suffix carries the official definition and its display name.
  expect(models.find((model) => model.slug === "gpt-5.6-luna(codex)")) //
    .toMatchObject({
      display_name: "Luna(codex)",
      prefer_websockets: true,
      slug: "gpt-5.6-luna(codex)",
    })
  // Another provider's catalog entry keeps its own id.
  expect(models.find((model) => model.slug === "deepseek-flash")).toMatchObject(
    { display_name: "DeepSeek" },
  )
})

test("assigns picker priorities in provider order without mutating definitions", () => {
  const definitions = [
    { slug: "gpt-5.6-luna(copilot)", priority: 1 },
    { slug: "deepseek-flash", priority: 1 },
    { slug: "gpt-5.6-luna(codex)", priority: 8 },
  ]
  const models = buildCatalogEntries({
    base: {
      entries: new Map(definitions.map((model) => [model.slug, model])),
      customModels: [],
      officialModels: [],
      extensionModels: [],
      metadata: {},
    },
    published: { entries: new Map(), suffixMode: false },
  })
  expect(models).toEqual([
    { slug: "gpt-5.6-luna(codex)", priority: 1 },
    { slug: "deepseek-flash", priority: 2 },
    { slug: "gpt-5.6-luna(copilot)", priority: 3 },
  ])
  expect(definitions.map((model) => model.priority)).toEqual([1, 1, 8])
})

test("publishes bare definitions while the Codex provider is disabled", async () => {
  const { base } = await baseCatalogFixture()
  const published = buildPublishedModels({
    config: {
      environment: "test",
      providers: defaultProviderConfig().providers,
    },
    officialModels: base.officialModels,
  })

  const models = buildCatalogEntries({ base, published })
  expect(models.map((model) => String(model.slug))).toEqual([
    "deepseek-flash",
    "gpt-5.6-luna",
    "gpt-5.5",
    "sol-fast",
  ])
})

test("regenerating from the raw base never doubles a suffix", async () => {
  const { base } = await baseCatalogFixture()
  const config = codexEnabledConfig(["gpt-5.6-luna", "gpt-5.5"])
  const published = buildPublishedModels({
    catalog: base.entries,
    config,
    customModels: base.customModels,
    copilotModels: ["gpt-5.6-luna"],
    officialModels: base.officialModels,
  })
  const outputFile = path.join(directory, "generated", "codex-models.json")

  await writePublishedCatalog({ base, outputFile, published })
  const first = await fs.readFile(outputFile)
  await writePublishedCatalog({ base, outputFile, published })
  const second = await fs.readFile(outputFile, "utf8")

  expect(JSON.parse(second)).toEqual(JSON.parse(first.toString()))
  expect(second).not.toContain("(codex)(codex)")
  expect(second).toContain('"version": 2')
  expect(
    (await fs.readdir(path.dirname(outputFile))).some((name) =>
      name.endsWith(".tmp"),
    ),
  ).toBe(false)
})

test("remaps structured model references to the same source", async () => {
  const cacheFile = path.join(directory, "codex-models-upstream.json")
  await fs.writeFile(
    cacheFile,
    JSON.stringify({
      models: [
        {
          auto_review_model_override: "gpt-5.6-terra",
          slug: "gpt-5.4",
          upgrade: {
            migration_markdown: "Switch to GPT-5.6 Terra",
            model: "gpt-5.6-terra",
          },
        },
        { slug: "gpt-5.6-terra" },
        {
          slug: "retired-only",
          upgrade: { model: "gpt-not-published" },
        },
      ],
    }),
  )
  const base = await loadBaseCatalog({
    customFiles: [],
    upstreamCacheFile: cacheFile,
  })
  const published = buildPublishedModels({
    catalog: base.entries,
    config: codexEnabledConfig(),
    officialModels: base.officialModels,
  })

  const models = buildCatalogEntries({ base, published })
  const codex = models.find((model) => model.slug === "gpt-5.4(codex)")

  expect(codex).toMatchObject({
    auto_review_model_override: "gpt-5.6-terra(codex)",
    upgrade: {
      // Free-form text keeps its original wording.
      migration_markdown: "Switch to GPT-5.6 Terra",
      model: "gpt-5.6-terra(codex)",
    },
  })
  // A reference with no same-source target is dropped, not left dangling.
  expect(
    models.find((model) => model.slug === "retired-only(codex)"),
  ).not.toHaveProperty("upgrade")
})

test("refreshUpstreamCatalog caches a successful fetch and keeps the file on failure", async () => {
  const cacheFile = path.join(directory, "cache", "upstream.json")
  fetchMock.mockResolvedValueOnce(
    Response.json({ models: [{ slug: "gpt-5.6-luna" }] }),
  )

  await refreshUpstreamCatalog({ cacheFile })
  expect(JSON.parse((await fs.readFile(cacheFile)).toString())).toEqual({
    models: [{ slug: "gpt-5.6-luna" }],
  })

  fetchMock.mockRejectedValueOnce(new TypeError("offline"))
  await refreshUpstreamCatalog({ cacheFile })
  expect(JSON.parse((await fs.readFile(cacheFile)).toString())).toEqual({
    models: [{ slug: "gpt-5.6-luna" }],
  })
  expect(warnMock).toHaveBeenCalledTimes(1)
})

test("reports a corrupted base cache instead of publishing stale ids", async () => {
  const cacheFile = path.join(directory, "codex-models-upstream.json")
  await fs.writeFile(cacheFile, "not json")

  expect(
    loadBaseCatalog({ customFiles: [], upstreamCacheFile: cacheFile }),
  ).rejects.toThrow()

  expect(
    await loadBaseCatalog({
      customFiles: [],
      upstreamCacheFile: path.join(directory, "missing-upstream.json"),
    }),
  ).toMatchObject({ officialModels: [] })
})
