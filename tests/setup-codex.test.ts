import { afterEach, expect, spyOn, test } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { parse } from "smol-toml"

import {
  configureCodex,
  setupCodex,
  updateCodexConfig,
} from "../scripts/setup-codex"

const directories: Array<string> = []

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true })),
  )
})

async function fixture(): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "copilot-install-"))
  directories.push(directory)
  return path.join(directory, ".codex", "config.toml")
}

test("creates the missing Codex folder and config.toml", async () => {
  const configPath = await fixture()
  const catalogPath = String.raw`E:\copilot api\codex-models.json`
  expect(await configureCodex(configPath, catalogPath)).toBeUndefined()
  expect(parse(await fs.readFile(configPath, "utf8"))).toEqual({
    model_provider: "copilot-api",
    model_catalog_json: "E:/copilot api/codex-models.json",
    model_providers: {
      "copilot-api": {
        name: "GitHub Copilot API",
        base_url: "http://localhost:4141/v1",
        wire_api: "responses",
        requires_openai_auth: false,
      },
    },
  })
})

test("preserves the selected model, other providers, and nested settings", () => {
  const original = `# Original formatting is preserved in the backup.
model = "gpt-6-sol"
model_provider = "other"
[model_providers.other]
name = "Other provider"
base_url = "http://localhost:1234/v1"
[model_providers.copilot-api]
name = "Old"
base_url = "http://localhost:9999"
request_max_retries = 8
[projects.'E:\\some project']
trust_level = "trusted"
`
  const result = parse(
    updateCodexConfig(original, "E:/copilot/codex-models.json"),
  )
  expect(result.model).toBe("gpt-6-sol")
  expect(result.projects).toEqual(parse(original).projects)
  expect(result.model_providers).toEqual({
    other: { name: "Other provider", base_url: "http://localhost:1234/v1" },
    "copilot-api": {
      name: "GitHub Copilot API",
      base_url: "http://localhost:4141/v1",
      request_max_retries: 8,
      wire_api: "responses",
      requires_openai_auth: false,
    },
  })
})

test("backs up the original config and is idempotent on a second install", async () => {
  const configPath = await fixture()
  await fs.mkdir(path.dirname(configPath), { recursive: true })
  const original = '# keep this exact original\r\nmodel = "gpt-6-sol"\r\n'
  await fs.writeFile(configPath, original)
  const backup = await configureCodex(
    configPath,
    "E:/copilot/codex-models.json",
  )
  expect(backup).toBeDefined()
  if (backup === undefined) throw new Error("Expected a config backup")
  expect(await fs.readFile(backup, "utf8")).toBe(original)
  const first = await fs.readFile(configPath, "utf8")
  expect(
    await configureCodex(configPath, "E:/copilot/codex-models.json"),
  ).toBeUndefined()
  expect(await fs.readFile(configPath, "utf8")).toBe(first)
  expect(await fs.readdir(path.dirname(configPath))).toHaveLength(2)
})

test.each(['model = "unfinished', 'model_providers = "invalid"'])(
  "leaves invalid existing configuration untouched: %s",
  async (original) => {
    const configPath = await fixture()
    await fs.mkdir(path.dirname(configPath), { recursive: true })
    await fs.writeFile(configPath, original)
    expect(
      configureCodex(configPath, "E:/copilot/codex-models.json"),
    ).rejects.toThrow()
    expect(await fs.readFile(configPath, "utf8")).toBe(original)
    expect(await fs.readdir(path.dirname(configPath))).toEqual(["config.toml"])
  },
)

test("supports inline and quoted provider keys without duplicate tables", () => {
  const original =
    'model_providers = { "copilot-api" = { name = "Old" }, other = { name = "Keep" } }'
  const updated = updateCodexConfig(original, "E:/copilot/codex-models.json")
  expect(updateCodexConfig(updated, "E:/copilot/codex-models.json")).toBe(
    updated,
  )
  expect(Object.keys(parse(updated).model_providers as object)).toEqual([
    "copilot-api",
    "other",
  ])
})

test.each([true, false])(
  "initial setup protects the config when catalog download succeeds=%s",
  async (online) => {
    const configPath = await fixture()
    const root = path.dirname(path.dirname(configPath))
    const catalogPath = path.join(root, "codex-models.json")
    const previous = '{"models":[{"slug":"previous"}]}'
    await fs.writeFile(catalogPath, previous)
    const fetchMock = spyOn(globalThis, "fetch")
    if (online)
      fetchMock.mockResolvedValue(
        Response.json({ models: [{ slug: "gpt-6-sol" }] }),
      )
    else fetchMock.mockRejectedValue(new Error("Offline test"))
    try {
      if (online) {
        await setupCodex(root, path.dirname(configPath))
        const catalog = await fs.readFile(catalogPath)
        expect(JSON.parse(catalog.toString("utf8"))).toEqual({
          models: [{ slug: "gpt-6-sol" }],
        })
        expect(
          parse(await fs.readFile(configPath, "utf8")).model_catalog_json,
        ).toBe(catalogPath.replaceAll("\\", "/"))
      } else {
        let error: unknown
        try {
          await setupCodex(root, path.dirname(configPath))
        } catch (caught) {
          error = caught
        }
        expect(error).toBeInstanceOf(Error)
        expect(await fs.readFile(catalogPath, "utf8")).toBe(previous)
        expect(await fs.exists(configPath)).toBe(false)
      }
    } finally {
      fetchMock.mockRestore()
    }
  },
)
