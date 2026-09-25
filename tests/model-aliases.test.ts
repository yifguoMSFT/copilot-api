import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test"
import consola from "consola"

import { state } from "../src/lib/state"
import { server } from "../src/server"

const originalFetch = globalThis.fetch
const originalInfo = consola.info.bind(consola)
const fetchMock = mock((_input: string | URL | Request, _init?: RequestInit) =>
  Promise.resolve(
    Response.json({
      id: "response-1",
      object: "chat.completion",
      choices: [],
    }),
  ),
)
const infoMock = mock(() => undefined)

globalThis.fetch = fetchMock as unknown as typeof fetch
consola.info = infoMock as unknown as typeof consola.info

beforeEach(() => {
  fetchMock.mockClear()
  infoMock.mockClear()
  state.accountType = "individual"
  state.copilotToken = "test-copilot-token"
  state.vsCodeVersion = "1.0.0"
  state.manualApprove = false
  state.rateLimitSeconds = undefined
  state.rateLimitWait = false
  state.lastRequestTimestamp = undefined
  state.models = {
    object: "list",
    data: [
      {
        id: "gpt-6-luna",
        name: "GPT-6 Luna",
        object: "model",
        vendor: "OpenAI",
        version: "6",
        preview: false,
        model_picker_enabled: true,
        capabilities: {
          family: "gpt-6",
          limits: { max_output_tokens: 16_384 },
          object: "model_capabilities",
          supports: { tool_calls: true },
          tokenizer: "o200k_base",
          type: "chat",
        },
      },
    ],
  }
})

afterAll(() => {
  globalThis.fetch = originalFetch
  consola.info = originalInfo
})

describe("model aliases", () => {
  test("lists codex-auto-review as an alias of an available Luna model", async () => {
    const response = await server.request("http://localhost/v1/models")
    const body = (await response.json()) as {
      data: Array<Record<string, unknown>>
    }

    expect(
      body.data.some(
        (model) =>
          model.id === "codex-auto-review"
          && model.display_name === "codex-auto-review"
          && model.owned_by === "OpenAI",
      ),
    ).toBe(true)
  })

  test("resolves codex-auto-review for chat completions", async () => {
    await server.request("http://localhost/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "codex-auto-review",
        messages: [{ role: "user", content: "review this" }],
      }),
    })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    if (typeof init.body !== "string") throw new Error("Expected JSON body")

    const forwardedPayload = JSON.parse(init.body) as unknown
    expect(forwardedPayload).toMatchObject({
      model: "gpt-6-luna",
      max_tokens: 16_384,
    })
    expect(infoMock).toHaveBeenCalledWith(
      "codex-auto-review input:",
      '{"model":"codex-auto-review","messages":[{"role":"user","content":"review this"}]}',
    )
    expect(infoMock).toHaveBeenCalledWith(
      "codex-auto-review output:",
      '{"id":"response-1","object":"chat.completion","choices":[]}',
    )
    expect(infoMock).toHaveBeenCalledWith(
      "Request sent to codex-auto-review (gpt-6-luna)",
    )
    expect(infoMock).toHaveBeenCalledWith(
      expect.stringMatching(
        /^Response received from codex-auto-review \(gpt-6-luna\) in \d+ms$/,
      ),
    )
  })
})
