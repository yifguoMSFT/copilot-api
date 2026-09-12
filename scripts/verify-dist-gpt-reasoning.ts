/**
 * Verifies the built dist/main.js GPT reasoning-content behavior offline.
 *
 * Usage:
 *   bun run build
 *   bun run scripts/verify-dist-gpt-reasoning.ts gpt
 *   bun run scripts/verify-dist-gpt-reasoning.ts gpt-off
 *   bun run scripts/verify-dist-gpt-reasoning.ts deepseek
 *
 * Every network dependency is mocked and the process runs in a temporary
 * directory, so the repository working tree is not modified.
 */
import { mock } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"

const MODES = ["gpt", "gpt-off", "deepseek"] as const
const rawMode = process.argv[2]
const mode = MODES.find((candidate) => candidate === rawMode)
if (mode === undefined) {
  throw new Error(`Expected mode gpt, gpt-off, or deepseek: ${rawMode}`)
}

const repo = path.resolve(import.meta.dir, "..")
const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "copilot-dist-"))
await fs.mkdir(path.join(workDir, "home"), { recursive: true })
process.env.USERPROFILE = path.join(workDir, "home")
process.env.DEEPSEEK_API_KEY = "verify-key"
process.chdir(workDir)

const configPath = path.join(workDir, "config.json")
await fs.writeFile(
  configPath,
  JSON.stringify({
    version: 1,
    defaults: {
      providers: {
        copilot: {
          enabled: mode !== "deepseek",
          stripReasoningContentForGpt: mode !== "gpt-off",
        },
        deepseek: {
          enabled: mode === "deepseek",
          baseUrl: "https://deepseek.invalid",
          apiKeyEnv: "DEEPSEEK_API_KEY",
          models: ["deepseek-flash"],
        },
      },
      catalog: { enabled: false },
    },
  }),
)

const cannedResponse = (url: string): Response => {
  if (url.includes("aur.archlinux.org")) return new Response("pkgver=1.104.3")
  if (url.includes("raw.githubusercontent.com")) {
    return Response.json({ models: [] })
  }
  if (url.endsWith("/user")) return Response.json({ login: "verify" })
  if (url.includes("copilot_internal/v2/token")) {
    return Response.json({
      token: "copilot-verify-token",
      expires_at: 0,
      refresh_in: 3600,
    })
  }
  if (url.endsWith("/models")) {
    return Response.json({ object: "list", data: [] })
  }
  return Response.json({ object: "response" })
}

const requestUrl = (input: string | URL | Request): string => {
  if (typeof input === "string") return input
  if (input instanceof URL) return input.href
  return input.url
}

const outbound: Array<{ url: string; body: RequestInit["body"] }> = []

globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
  const url = requestUrl(input)
  if (url.includes("/responses")) outbound.push({ url, body: init?.body })
  return Promise.resolve(cannedResponse(url))
}) as unknown as typeof fetch

interface CapturedCommand {
  subCommands: Record<
    string,
    { run: (input: { args: Record<string, unknown> }) => Promise<void> }
  >
}

let capturedCommand: CapturedCommand | undefined
let capturedHandler: ((request: Request) => Promise<Response>) | undefined

await mock.module("citty", () => ({
  defineCommand: (definition: unknown) => definition,
  runMain: (definition: unknown) => {
    capturedCommand = definition as CapturedCommand
    return Promise.resolve()
  },
}))

await mock.module("srvx", () => ({
  serve: (options: { fetch: (request: Request) => Promise<Response> }) => {
    capturedHandler = options.fetch
    return { stop: () => undefined }
  },
}))

await import(pathToFileURL(path.join(repo, "dist/main.js")).href)

const start = capturedCommand?.subCommands.start
if (start === undefined) throw new Error("start command was not captured")

await start.run({
  args: {
    port: "4141",
    verbose: false,
    "account-type": "individual",
    manual: false,
    wait: false,
    "claude-code": false,
    "show-token": false,
    "proxy-env": false,
    "responses-stable-item-ids": true,
    "github-token": "github-verify-token",
    config: configPath,
  },
})

const handler = capturedHandler
if (handler === undefined) throw new Error("server handler was not captured")

const reasoningEntry = {
  type: "reasoning",
  id: "reasoning-40",
  summary: [],
  content: [{ type: "reasoning_text", text: "hidden" }],
}

const body = JSON.stringify({
  model: mode === "deepseek" ? "deepseek-flash" : "gpt-5.6-terra",
  stream: true,
  input: Array.from({ length: 41 }, (_, index) =>
    index === 40 ? reasoningEntry : (
      {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: `message-${index}` }],
      }
    ),
  ),
})

const response = await handler(
  new Request("http://localhost/v1/responses", {
    method: "POST",
    headers: {
      authorization: "Bearer local-dummy-token",
      "content-type": "application/json",
    },
    body,
  }),
)
await response.text()

const upstream = outbound.find((entry) => entry.url.length > 0)
if (upstream === undefined) throw new Error("No upstream request captured")

const readBody = async (value: RequestInit["body"]): Promise<string> => {
  if (typeof value === "string") return value
  if (value === null) return ""
  return await new Response(value).text()
}

const sentText = await readBody(upstream.body)
const sent = JSON.parse(sentText) as { input: Array<Record<string, unknown>> }
const reasoningContent = sent.input[40]?.content

const expectedUrl =
  mode === "deepseek" ?
    "https://deepseek.invalid/responses"
  : "https://api.githubcopilot.com/responses"
const expectedCleared = mode === "gpt"
const expectedBytesUnchanged = mode !== "gpt"

const actual = {
  url: upstream.url,
  cleared: Array.isArray(reasoningContent) && reasoningContent.length === 0,
  bytesUnchanged: sentText === body,
}

const pass =
  actual.url === expectedUrl
  && actual.cleared === expectedCleared
  && actual.bytesUnchanged === expectedBytesUnchanged

console.log(JSON.stringify({ mode, status: response.status, actual, pass }))
process.exit(pass ? 0 : 1)
