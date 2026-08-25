import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test"
import consola from "consola"

import { state } from "../src/lib/state"
import { server } from "../src/server"

const originalFetch = globalThis.fetch
const originalPrompt = consola.prompt.bind(consola)
const originalInfo = consola.info.bind(consola)
const fetchMock = mock((_input: string | URL | Request, _init?: RequestInit) =>
  Promise.resolve(Response.json({ object: "response" })),
)
const promptMock = mock(() => Promise.resolve(true))
const infoMock = mock(() => undefined)

globalThis.fetch = fetchMock as unknown as typeof fetch
consola.prompt = promptMock as typeof consola.prompt
consola.info = infoMock as unknown as typeof consola.info

beforeEach(() => {
  fetchMock.mockClear()
  promptMock.mockClear()
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
  state.lastRequestTimestamp = undefined
})

afterAll(() => {
  globalThis.fetch = originalFetch
  consola.prompt = originalPrompt
  consola.info = originalInfo
})

const post = (path: string, body = "{}", signal?: AbortSignal) =>
  server.request(
    new Request(`http://localhost${path}`, {
      method: "POST",
      headers: {
        authorization: "Bearer local-dummy-token",
        "content-type": "application/json",
      },
      body,
      signal,
    }),
  )

describe("Responses routes", () => {
  test.each(["/responses", "/v1/responses"])(
    "registers %s and preserves request bytes",
    async (path) => {
      const body = '{ "model": "test", "unknown": [1, 2] }'

      const response = await post(path, body)

      expect(response.status).toBe(200)
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
      expect(await new Response(init.body).text()).toBe(body)
      expect((init.headers as Record<string, string>).Authorization).toBe(
        "Bearer test-copilot-token",
      )
    },
  )

  test("resolves the codex-auto-review model alias", async () => {
    const response = await post(
      "/v1/responses",
      JSON.stringify({ model: "codex-auto-review", input: "review this" }),
    )
    await response.text()

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(await new Response(init.body).json()).toEqual({
      model: "gpt-5.6-luna",
      input: "review this",
    })
    expect(infoMock).toHaveBeenCalledWith(
      "codex-auto-review input:",
      '{"model":"codex-auto-review","input":"review this"}',
    )
    expect(infoMock).toHaveBeenCalledWith(
      "codex-auto-review output:",
      '{"object":"response"}',
    )
    expect(infoMock).toHaveBeenCalledWith(
      "Request sent to codex-auto-review (gpt-5.6-luna)",
    )
    expect(infoMock).toHaveBeenCalledWith(
      expect.stringMatching(
        /^Response received from codex-auto-review \(gpt-5\.6-luna\): 200 in \d+ms$/,
      ),
    )
  })

  test("preserves upstream JSON status, body, and safe headers", async () => {
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(
        new Response('{"error":{"message":"invalid"}}', {
          status: 400,
          headers: {
            "cache-control": "no-store",
            "content-length": "999",
            "content-type": "application/json",
            "openai-processing-ms": "12",
            "x-private-header": "hidden",
            "x-request-id": "request-1",
          },
        }),
      ),
    )

    const response = await post("/v1/responses")

    expect(response.status).toBe(400)
    expect(await response.text()).toBe('{"error":{"message":"invalid"}}')
    expect(response.headers.get("content-type")).toBe("application/json")
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(response.headers.get("openai-processing-ms")).toBe("12")
    expect(response.headers.get("x-request-id")).toBe("request-1")
    expect(response.headers.get("content-length")).toBeNull()
    expect(response.headers.get("x-private-header")).toBeNull()
  })

  test("streams upstream SSE framing without parsing", async () => {
    const event =
      'event: response.completed\ndata: {"type":"response.completed"}\n\n'
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(
        new Response(event, {
          headers: { "content-type": "text/event-stream" },
        }),
      ),
    )

    const response = await post("/v1/responses", '{"stream":true}')

    expect(response.headers.get("content-type")).toBe("text/event-stream")
    expect(await response.text()).toBe(event)
  })

  test("logs aliased streaming output without changing SSE framing", async () => {
    const event =
      'event: response.output_text.delta\ndata: {"delta":"allow","obfuscation":"noise"}\n\nevent: response.completed\ndata: {"copilot_usage":{"total_nano_aiu":42},"response":{"model":"gpt-5.6-luna","status":"completed","instructions":"large policy","output":[{"encrypted_content":"secret","content":[{"text":"{\\"risk_level\\":\\"low\\",\\"outcome\\":\\"allow\\"}"}]}],"usage":{"input_tokens":100,"output_tokens":10}},"type":"response.completed"}\n\n'
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(
        new Response(event, {
          headers: { "content-type": "text/event-stream" },
        }),
      ),
    )

    const response = await post(
      "/v1/responses",
      '{"model":"codex-auto-review","input":"review this","stream":true}',
    )

    expect(await response.text()).toBe(event)
    expect(infoMock).toHaveBeenCalledWith(
      "codex-auto-review output:",
      '{"model":"gpt-5.6-luna","status":"completed","output":{"risk_level":"low","outcome":"allow"},"usage":{"input_tokens":100,"output_tokens":10},"copilot_usage":{"total_nano_aiu":42}}',
    )
  })

  test("omits encrypted content from aliased input logs", async () => {
    await post(
      "/v1/responses",
      '{"model":"codex-auto-review","input":[{"encrypted_content":"secret","content":"review this"}]}',
    )

    expect(infoMock).toHaveBeenCalledWith(
      "codex-auto-review input:",
      '{"model":"codex-auto-review","input":[{"content":"review this"}]}',
    )
  })

  test("runs manual approval before the upstream request", async () => {
    state.manualApprove = true

    await post("/v1/responses")

    expect(promptMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test("enforces the existing rate limit before the upstream request", async () => {
    state.rateLimitSeconds = 60
    state.lastRequestTimestamp = Date.now()

    const response = await post("/v1/responses")

    expect(response.status).toBe(429)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test("propagates request cancellation to upstream fetch", async () => {
    const controller = new AbortController()

    await post("/v1/responses", "{}", controller.signal)

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(init.signal).toBe(controller.signal)
  })

  test("ignores a request signal already aborted after body consumption", async () => {
    const controller = new AbortController()
    controller.abort()

    await post("/v1/responses", "{}", controller.signal)

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(init.signal).toBeUndefined()
  })

  test("uses the local error envelope when no upstream response exists", async () => {
    state.copilotToken = undefined

    const response = await post("/v1/responses")

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      error: {
        message: "Copilot token not found",
        type: "error",
      },
    })
  })
})
