import { afterEach, beforeEach, expect, spyOn, test } from "bun:test"
import consola from "consola"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { refreshCodexModels } from "../src/lib/codex-models"

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

test("skips missing configured custom catalogs and loads existing ones", async () => {
  fetchMock.mockResolvedValue(Response.json({ models: [{ slug: "astra" }] }))

  await refreshCodexModels({
    outputFile: path.join(directory, "codex-models.json"),
    customFiles: [
      path.join(directory, "missing-before.json"),
      path.join(directory, "codex-models-custom.json"),
      path.join(directory, "missing-after.json"),
    ],
  })

  const output = await fs.readFile(path.join(directory, "codex-models.json"))
  expect(JSON.parse(output.toString("utf8"))).toEqual({
    models: [
      { slug: "astra" },
      { slug: "sol-fast", model_messages: { instructions_template: "custom" } },
    ],
  })
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

test.each([false, true])(
  "excludes merged slugs without filtering the upstream cache (offline: %s)",
  async (offline) => {
    const upstream = {
      version: 2,
      models: [
        { slug: "gpt-5.6-luna" },
        { slug: "gpt-6-luna", description: "retained metadata" },
        { slug: "sol-fast", description: "overridden by custom" },
        { slug: "GPT-5.6-LUNA" },
        { slug: "gpt-5.6-luna-extra" },
      ],
    }
    const cache = path.join(directory, "codex-models-upstream.json")
    await fs.writeFile(cache, JSON.stringify(upstream))
    if (offline) fetchMock.mockRejectedValue(new Error("offline"))
    else fetchMock.mockResolvedValue(Response.json(upstream))
    const options = {
      outputFile: path.join(directory, "codex-models.json"),
      customFiles: [path.join(directory, "codex-models-custom.json")],
      deepSeekModels: ["deepseek-flash"],
      disabledModels: [
        "gpt-5.6-luna",
        "gpt-5.6-luna",
        "sol-fast",
        "deepseek-flash",
        "future-model",
      ],
    }
    await refreshCodexModels(options)
    const output = JSON.parse(
      // eslint-disable-next-line unicorn/prefer-json-parse-buffer
      await fs.readFile(options.outputFile, "utf8"),
    ) as { version: number; models: Array<Record<string, unknown>> }
    expect(output).toEqual({
      version: 2,
      models: [
        { slug: "gpt-6-luna", description: "retained metadata" },
        { slug: "GPT-5.6-LUNA" },
        { slug: "gpt-5.6-luna-extra" },
      ],
    })
    expect(infoMock).toHaveBeenCalledWith("Codex catalog exclusions", {
      removed: ["gpt-5.6-luna", "sol-fast", "deepseek-flash"],
      unmatched: ["future-model"],
    })
    expect(JSON.parse((await fs.readFile(cache)).toString())).toEqual(upstream)
    fetchMock.mockRejectedValue(new Error("offline"))
    await refreshCodexModels({ ...options, disabledModels: [] })
    const restored = JSON.parse(
      (await fs.readFile(options.outputFile)).toString(),
    ) as { models: Array<Record<string, unknown>> }
    expect(restored.models).toContainEqual({ slug: "gpt-5.6-luna" })
  },
)

test("writes an empty catalog when every merged model is excluded", async () => {
  fetchMock.mockResolvedValue(Response.json({ models: [{ slug: "sol" }] }))
  const outputFile = path.join(directory, "codex-models.json")
  await refreshCodexModels({
    outputFile,
    customFiles: [],
    disabledModels: ["sol"],
  })
  expect(JSON.parse((await fs.readFile(outputFile)).toString())).toEqual({
    models: [],
  })
})
