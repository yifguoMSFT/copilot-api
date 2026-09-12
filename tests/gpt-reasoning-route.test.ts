import { afterAll, beforeEach, expect, mock, test } from "bun:test"
import consola from "consola"

import type { RuntimeConfig } from "../src/lib/runtime-config"

import { state } from "../src/lib/state"
import { server } from "../src/server"

const originalFetch = globalThis.fetch
const originalInfo = consola.info.bind(consola)
const fetchMock = mock((_input: string | URL | Request, _init?: RequestInit) =>
  Promise.resolve(Response.json({ object: "response" })),
)
const infoMock = mock(() => undefined)

globalThis.fetch = fetchMock as unknown as typeof fetch
consola.info = infoMock as unknown as typeof consola.info

const config = (
  stripReasoningContentForGpt: boolean,
  deepseekEnabled = false,
): RuntimeConfig => ({
  environment: "test",
  providers: {
    copilot: { enabled: true, stripReasoningContentForGpt },
    deepseek: {
      enabled: deepseekEnabled,
      baseUrl: "https://api.deepseek.com",
      apiKeyEnv: "DEEPSEEK_API_KEY",
      models: ["deepseek-flash"],
    },
  },
  catalog: { enabled: false, customFiles: [], outputFile: "" },
})

const reasoningEntry = {
  type: "reasoning",
  id: "reasoning-40",
  summary: [],
  content: [{ type: "reasoning_text", text: "hidden" }],
}

const messageEntry = (index: number) => ({
  type: "message",
  role: "user",
  content: [{ type: "input_text", text: `message-${index}` }],
})

const payloadWithReasoning = (
  model: string,
  extra: Record<string, unknown> = {},
): string =>
  JSON.stringify({
    model,
    ...extra,
    input: Array.from({ length: 41 }, (_, index) =>
      index === 40 ? reasoningEntry : messageEntry(index),
    ),
  })

const send = async (body: string) => {
  const response = await server.request(
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
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
  return { url, text: await new Response(init.body).text() }
}

beforeEach(() => {
  fetchMock.mockClear()
  infoMock.mockClear()
  fetchMock.mockImplementation(() =>
    Promise.resolve(Response.json({ object: "response" })),
  )
  state.accountType = "individual"
  state.copilotToken = "test-copilot-token"
  state.vsCodeVersion = "1.0.0"
  state.manualApprove = false
  state.rateLimitSeconds = undefined
  state.rateLimitWait = false
  state.responsesStableItemIds = true
  state.lastRequestTimestamp = undefined
  state.runtimeConfig = config(true)
})

afterAll(() => {
  globalThis.fetch = originalFetch
  consola.info = originalInfo
})

test("clears GPT reasoning content by default and keeps other fields", async () => {
  const { text } = await send(
    payloadWithReasoning("gpt-5.6-terra", { stream: true, store: false }),
  )
  const outbound = JSON.parse(text) as {
    model: string
    stream: boolean
    store: boolean
    input: Array<Record<string, unknown>>
  }

  expect(outbound.model).toBe("gpt-5.6-terra")
  expect(outbound.stream).toBe(true)
  expect(outbound.store).toBe(false)
  expect(outbound.input).toHaveLength(41)
  expect(outbound.input[40]?.content).toEqual([])
  expect(outbound.input[40]?.id).toBe("reasoning-40")
  expect(outbound.input[40]?.summary).toEqual([])
  expect(outbound.input[39]).toEqual(messageEntry(39))
  expect(infoMock).toHaveBeenCalledWith(
    "GPT reasoning content stripped: model=gpt-5.6-terra indices=[40] items=1 contentParts=1",
  )
})

test("keeps the original request bytes when the switch is disabled", async () => {
  state.runtimeConfig = config(false)
  const body = payloadWithReasoning("gpt-5.6-terra")

  const { text } = await send(body)

  expect(text).toBe(body)
  expect(infoMock).not.toHaveBeenCalledWith(
    expect.stringContaining("GPT reasoning content stripped"),
  )
})

test("keeps the original request bytes for DeepSeek models", async () => {
  state.runtimeConfig = config(true, true)
  const body = payloadWithReasoning("deepseek-flash")

  const { url, text } = await send(body)

  expect(url).toBe("https://api.deepseek.com/responses")
  expect(text).toBe(body)
})

test("keeps the original request bytes for non-GPT Copilot models", async () => {
  const body = payloadWithReasoning("claude-sonnet-4.5")

  const { url, text } = await send(body)

  expect(url).not.toContain("api.deepseek.com")
  expect(text).toBe(body)
})

test("applies alias rewrite and reasoning cleanup together", async () => {
  const { text } = await send(payloadWithReasoning("codex-auto-review"))
  const outbound = JSON.parse(text) as {
    model: string
    input: Array<Record<string, unknown>>
  }

  expect(outbound.model).toBe("gpt-5.6-luna")
  expect(outbound.input[40]?.content).toEqual([])
  expect(infoMock).toHaveBeenCalledWith(
    "GPT reasoning content stripped: model=gpt-5.6-luna indices=[40] items=1 contentParts=1",
  )
})
