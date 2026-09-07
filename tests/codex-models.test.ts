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
