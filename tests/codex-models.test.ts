import { afterEach, beforeEach, expect, spyOn, test } from "bun:test"
import consola from "consola"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import {
  buildCodexModelEntries,
  codexModelCapabilities,
  findCodexCatalogGaps,
  loadCodexCatalog,
  refreshCodexModels,
} from "../src/lib/codex-models"

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
