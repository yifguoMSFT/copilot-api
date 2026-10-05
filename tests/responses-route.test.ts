import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test"
import consola from "consola"

import { loadRuntimeConfig } from "../src/lib/runtime-config"
import { state } from "../src/lib/state"
import { server } from "../src/server"

const originalFetch = globalThis.fetch
const originalState = { ...state }
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
  state.verbose = false
  state.rateLimitSeconds = undefined
  state.rateLimitWait = false
  state.responsesStableItemIds = true
  state.lastRequestTimestamp = undefined
  state.runtimeConfig = undefined
})

afterAll(() => {
  globalThis.fetch = originalFetch
  consola.prompt = originalPrompt
  consola.info = originalInfo
  Object.assign(state, originalState)
})

const post = (
  path: string,
  body = "{}",
  options: { signal?: AbortSignal; headers?: Record<string, string> } = {},
) =>
  server.request(
    new Request(`http://localhost${path}`, {
      method: "POST",
      headers: {
        authorization: "Bearer local-dummy-token",
        "content-type": "application/json",
        ...options.headers,
      },
      body,
      signal: options.signal,
    }),
  )

const compactHeaders = {
  "x-codex-turn-metadata": '{"request_kind":"compaction"}',
  "session-id": "test-session",
  "thread-id": "test-thread",
}

async function enableCompaction(model = "gpt-6-luna") {
  state.runtimeConfig = await loadRuntimeConfig({
    packageRoot: import.meta.dir,
    env: {},
  })
  state.runtimeConfig.compaction = { enabled: true, model }
}

const upstreamBody = (index = 0): string => {
  const [, init] = fetchMock.mock.calls[index] as [string, RequestInit]
  return typeof init.body === "string" ?
      init.body
    : new TextDecoder().decode(init.body as ArrayBuffer)
}

const upstreamModel = (index = 0): unknown =>
  (JSON.parse(upstreamBody(index)) as Record<string, unknown>).model

describe("Compaction request handling", () => {
  test("uses body metadata fallback while respecting header precedence", async () => {
    await enableCompaction()
    const body = JSON.stringify({
      model: "gpt-6-sol",
      client_metadata: {
        "x-codex-turn-metadata": compactHeaders["x-codex-turn-metadata"],
      },
    })
    await post("/v1/responses", body)
    expect(upstreamModel()).toBe("gpt-6-luna")
    await post("/v1/responses", body, {
      headers: { "x-codex-turn-metadata": "broken" },
    })
    expect(upstreamBody(1)).toBe(body)
  })

  test("isolates concurrent and subsequent normal turns including historical compaction text", async () => {
    await enableCompaction()
    const ordinary = JSON.stringify({
      model: "gpt-6-sol",
      input: [
        {
          role: "user",
          content: "You are performing a CONTEXT CHECKPOINT COMPACTION",
        },
      ],
    })
    await Promise.all([
      post("/v1/responses", '{"model":"gpt-6-astra"}', {
        headers: compactHeaders,
      }),
      post("/v1/responses", ordinary),
    ])
    const models = [0, 1].map((index) => upstreamModel(index)).sort()
    expect(models).toEqual(["gpt-6-luna", "gpt-6-sol"])
    await post("/v1/responses", ordinary)
    expect(upstreamBody(2)).toBe(ordinary)
    expect(state.runtimeConfig?.compaction.model).toBe("gpt-6-luna")
  })

  test("keeps existing malformed and missing model behavior", async () => {
    await enableCompaction()
    for (const body of ["broken", '{"model":123}', '{"model":""}']) {
      expect(
        (await post("/v1/responses", body, { headers: compactHeaders })).status,
      ).toBe(500)
    }
    expect(fetchMock).not.toHaveBeenCalled()
    await post("/v1/responses", "{}", { headers: compactHeaders })
    expect(upstreamBody()).toBe("{}")
  })

  test("surfaces upstream rejection without retry or response model rewriting", async () => {
    await enableCompaction()
    const error = { model: "gpt-6-luna", error: { message: "cannot decrypt" } }
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(Response.json(error, { status: 400 })),
    )
    const response = await post("/v1/responses", '{"model":"gpt-6-sol"}', {
      headers: compactHeaders,
    })
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual(error)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test("streams before completion while retaining item normalization and upstream model", async () => {
    await enableCompaction()
    let controller: ReadableStreamDefaultController<Uint8Array> | undefined
    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      start(value) {
        controller = value
      },
    })
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(
        new Response(stream, {
          headers: { "content-type": "text/event-stream" },
        }),
      ),
    )
    controller?.enqueue(
      encoder.encode(
        'event: response.output_item.added\ndata: {"type":"response.output_item.added","output_index":0,"item":{"id":"first"}}\n\n',
      ),
    )
    const response = await post(
      "/v1/responses",
      '{"model":"gpt-6-sol","stream":true}',
      { headers: compactHeaders },
    )
    const reader = (
      response.body as ReadableStream<Uint8Array> | null
    )?.getReader()
    if (reader === undefined) throw new Error("Missing stream")
    try {
      const first = await reader.read()
      expect(new TextDecoder().decode(first.value)).toContain('"id":"first"')
      controller?.enqueue(
        encoder.encode(
          'event: response.output_item.done\ndata: {"type":"response.output_item.done","output_index":0,"item":{"id":"last"}}\n\nevent: response.completed\ndata: {"type":"response.completed","response":{"model":"gpt-6-luna","status":"completed"}}\n\n',
        ),
      )
      controller?.close()
      let output = ""
      for (;;) {
        const chunk = await reader.read()
        if (chunk.done) break
        output += new TextDecoder().decode(chunk.value)
      }
      expect(output).toContain('"id":"first"')
      expect(output).not.toContain('"id":"last"')
      expect(output).toContain('"model":"gpt-6-luna"')
    } finally {
      await reader.cancel()
    }
  })

  test("uses the effective provider and preserves DeepSeek validation", async () => {
    await enableCompaction("deepseek-flash")
    const config = state.runtimeConfig
    if (config === undefined) throw new Error("Missing config")
    config.providers.deepseek.enabled = true
    config.providers.deepseek.apiKeyEnv = "COMPACTION_TEST_API_KEY"
    const originalKey = process.env.COMPACTION_TEST_API_KEY
    process.env.COMPACTION_TEST_API_KEY = "test-key"
    try {
      await post("/v1/responses", '{"model":"gpt-6-sol"}', {
        headers: compactHeaders,
      })
      expect(fetchMock.mock.calls[0]?.[0]).toBe(
        "https://api.deepseek.com/responses",
      )
      expect(upstreamModel()).toBe("deepseek-flash")
      const response = await post(
        "/v1/responses",
        '{"model":"gpt-6-sol","previous_response_id":"stored"}',
        { headers: compactHeaders },
      )
      expect(response.status).toBe(500)
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(
        (
          await post(
            "/v1/responses",
            '{"model":"gpt-6-sol","tools":[{"type":"web_search"}]}',
            { headers: compactHeaders },
          )
        ).status,
      ).toBe(500)
      expect(fetchMock).toHaveBeenCalledTimes(1)
    } finally {
      if (originalKey === undefined) delete process.env.COMPACTION_TEST_API_KEY
      // Tests run sequentially; restore this isolated test key after awaits.
      // eslint-disable-next-line require-atomic-updates
      else process.env.COMPACTION_TEST_API_KEY = originalKey
    }
  })
})

describe("Compaction model selection", () => {
  test.each(["/responses", "/v1/responses"])(
    "routes marked requests on %s and preserves other fields",
    async (path) => {
      await enableCompaction()
      const payload = {
        model: "gpt-6-sol",
        input: [{ type: "reasoning", encrypted_content: "private-ciphertext" }],
        reasoning: { effort: "medium", context: "all_turns" },
        stream: true,
        store: false,
        prompt_cache_key: "test-cache",
        extra: { model: "nested-model", text: "日本語" },
      }
      const body = JSON.stringify(payload)
      expect(
        (
          await post(path, body, {
            headers: {
              ...compactHeaders,
              "content-length": String(Buffer.byteLength(body)),
            },
          })
        ).status,
      ).toBe(200)
      expect(JSON.parse(upstreamBody())).toEqual({
        ...payload,
        model: "gpt-6-luna",
      })
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
      const headers = new Headers(init.headers)
      expect(headers.get("session-id")).toBe("test-session")
      expect(headers.get("thread-id")).toBe("test-thread")
      expect(headers.get("content-length")).toBeNull()
      expect(infoMock).toHaveBeenCalledWith(
        "Compaction request sent to gpt-6-sol (gpt-6-luna)",
      )
      expect(infoMock).toHaveBeenCalledWith(
        expect.stringMatching(
          /^Compaction response received from gpt-6-sol \(gpt-6-luna\): 200 in \d+ms$/,
        ),
      )
      expect(infoMock).toHaveBeenCalledWith("Compaction model routing", {
        requestedModel: "gpt-6-sol",
        configuredModel: "gpt-6-luna",
        upstreamModel: "gpt-6-luna",
        provider: "copilot",
        metadataSource: "header",
      })
    },
  )

  test("disabled and legacy config preserve marked request bytes", async () => {
    const body = '{ "model": "gpt-6-sol", "input": [] }'
    await post("/v1/responses", body, { headers: compactHeaders })
    expect(upstreamBody()).toBe(body)
    state.runtimeConfig = await loadRuntimeConfig({
      packageRoot: import.meta.dir,
      env: {},
    })
    state.runtimeConfig.compaction.model = "gpt-6-luna"
    await post("/v1/responses", body, { headers: compactHeaders })
    expect(upstreamBody(1)).toBe(body)
  })

  test("resolves target aliases and preserves bytes for a no-op target", async () => {
    await enableCompaction("codex-auto-review")
    await post("/v1/responses", '{"model":"gpt-6-sol"}', {
      headers: compactHeaders,
    })
    expect(upstreamModel()).toBe("gpt-6-luna")
    const body = '{ "model": "gpt-6-luna", "input": [] }'
    await post("/v1/responses", body, { headers: compactHeaders })
    expect(upstreamBody(1)).toBe(body)
  })
})

describe("Responses header forwarding", () => {
  test("diagnostics preserve the request body and correlate both boundaries", async () => {
    state.verbose = true
    const body =
      '{"model":"gpt-6-sol","input":[{"type":"function_call_output","output":[{"type":"encrypted_content","encrypted_content":"private-ciphertext"}]}]}'
    try {
      await post("/v1/responses", body, {
        headers: {
          "x-request-id": "diagnostic-request",
          session_id: "private-session",
        },
      })
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
      expect(new TextDecoder().decode(init.body as ArrayBuffer)).toBe(body)
      const diagnosticCalls = infoMock.mock.calls as unknown as Array<
        [string, string]
      >
      const records = diagnosticCalls
        .filter(([label]) => label === "Responses diagnostic")
        .map(([, value]) => JSON.parse(value) as Record<string, unknown>)
      const request = records.find((entry) => entry.stage === "request")
      if (request === undefined) throw new Error("Missing request diagnostic")
      expect(request.requestId).toBe("diagnostic-request")
      expect(request.incoming).toEqual(request.upstream)
      expect(
        records.find((entry) => entry.stage === "upstream-response")?.requestId,
      ).toBe("diagnostic-request")
      expect(JSON.stringify(records)).not.toContain("private-ciphertext")
      expect(JSON.stringify(records)).not.toContain("private-session")
    } finally {
      state.verbose = false
    }
  })

  test("omits request diagnostics without verbose logging", async () => {
    await post("/v1/responses")
    const diagnosticCalls = infoMock.mock.calls as unknown as Array<[string]>
    expect(
      diagnosticCalls.some(([label]) => label === "Responses diagnostic"),
    ).toBe(false)
  })

  test.each(["/responses", "/v1/responses"])(
    "forwards Codex session headers through %s without replacing Copilot credentials",
    async (path) => {
      const sessionHeaders = {
        session_id: "session-a",
        conversation_id: "conversation-a",
        "X-Codex-Turn-State": "opaque-turn-state",
        "x-codex-turn-metadata": '{"turn_id":"turn-a"}',
        "x-client-request-id": "client-request-a",
      }
      const response = await post(path, "{}", {
        headers: {
          ...sessionHeaders,
          "copilot-integration-id": "untrusted-client",
          "x-request-id": "client-request-override",
          cookie: "local-secret=value",
          "x-private-header": "local-only",
          accept: "text/event-stream",
          "openai-beta": "future-feature=v1",
          connection: "keep-alive, x-connection-only",
          "x-connection-only": "transport-only",
          "proxy-authorization": "Basic local-proxy-secret",
          host: "local-proxy.example",
        },
      })

      expect(response.status).toBe(200)
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
      const headers = new Headers(init.headers)
      for (const [name, value] of Object.entries(sessionHeaders)) {
        expect(headers.get(name)).toBe(value)
      }
      expect(headers.get("authorization")).toBe("Bearer test-copilot-token")
      expect(headers.get("copilot-integration-id")).toBe("vscode-chat")
      expect(headers.get("x-request-id")).toBe("client-request-override")
      expect(headers.get("cookie")).toBeNull()
      expect(headers.get("x-private-header")).toBe("local-only")
      expect(headers.get("accept")).toBe("text/event-stream")
      expect(headers.get("openai-beta")).toBe("future-feature=v1")
      expect(headers.get("connection")).toBeNull()
      expect(headers.get("x-connection-only")).toBeNull()
      expect(headers.get("proxy-authorization")).toBeNull()
      expect(headers.get("host")).toBeNull()
      expect(headers.get("content-length")).toBeNull()
    },
  )

  test("keeps session headers scoped to each request", async () => {
    for (const session of ["session-a", "session-a", "session-b", undefined]) {
      await post("/v1/responses", "{}", {
        headers:
          session === undefined ?
            {}
          : {
              session_id: session,
              "x-codex-turn-state": `state-${session}`,
            },
      })
    }

    const headers = fetchMock.mock.calls.map(
      ([, init]) => new Headers(init?.headers),
    )
    expect(headers.map((entry) => entry.get("session_id"))).toEqual([
      "session-a",
      "session-a",
      "session-b",
      null,
    ])
    expect(headers.map((entry) => entry.get("x-codex-turn-state"))).toEqual([
      "state-session-a",
      "state-session-a",
      "state-session-b",
      null,
    ])
    expect(
      new Set(headers.map((entry) => entry.get("x-request-id"))).size,
    ).toBe(4)
  })

  test.each([false, true])(
    "returns upstream session headers with stream=%s",
    async (stream) => {
      const body =
        stream ? 'data: {"type":"response.completed"}\n\n' : '{"id":"resp-a"}'
      const sessionHeaders = {
        session_id: "upstream-session",
        conversation_id: "upstream-conversation",
        "x-codex-turn-state": "next-turn-state",
      }
      fetchMock.mockImplementationOnce(() =>
        Promise.resolve(
          new Response(body, {
            headers: {
              ...sessionHeaders,
              "content-type": stream ? "text/event-stream" : "application/json",
              "set-cookie": "upstream-secret=value",
              "content-encoding": "gzip",
              "content-length": "999",
              connection: "keep-alive, x-transport-only, x-request-id",
              "x-transport-only": "remove-me",
              "x-request-id": "connection-local-id",
              "x-future-provider-state": "opaque-provider-state",
              "retry-after": "10",
            },
          }),
        ),
      )

      const response = await post("/v1/responses", JSON.stringify({ stream }))

      expect(await response.text()).toBe(body)
      for (const [name, value] of Object.entries(sessionHeaders)) {
        expect(response.headers.get(name)).toBe(value)
      }
      expect(response.headers.get("set-cookie")).toBeNull()
      expect(response.headers.get("content-encoding")).toBeNull()
      expect(response.headers.get("content-length")).toBeNull()
      expect(response.headers.get("connection")).toBeNull()
      expect(response.headers.get("x-transport-only")).toBeNull()
      expect(response.headers.get("x-request-id")).toBeNull()
      expect(response.headers.get("x-future-provider-state")).toBe(
        "opaque-provider-state",
      )
      expect(response.headers.get("retry-after")).toBe("10")
    },
  )
})

describe("Responses routes", () => {
  test.each(["/responses", "/v1/responses"])(
    "registers %s and preserves request bytes",
    async (path) => {
      const body = '{ "model": "test", "unknown": [1, 2] }'

      const response = await post(path, body)

      expect(response.status).toBe(200)
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
      expect(await new Response(init.body).text()).toBe(body)
      expect(new Headers(init.headers).get("authorization")).toBe(
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
      model: "gpt-6-luna",
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
      "Request sent to codex-auto-review (gpt-6-luna)",
    )
    expect(infoMock).toHaveBeenCalledWith(
      expect.stringMatching(
        /^Response received from codex-auto-review \(gpt-6-luna\): 200 in \d+ms$/,
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
    expect(response.headers.get("x-private-header")).toBe("hidden")
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

  test("normalizes item IDs by default", async () => {
    const event =
      'event: response.output_item.added\ndata: {"type":"response.output_item.added","output_index":0,"item":{"id":"first"}}\n\nevent: response.output_item.done\ndata: {"type":"response.output_item.done","output_index":0,"item":{"id":"last"}}\n\n'
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(
        new Response(event, {
          headers: { "content-type": "text/event-stream" },
        }),
      ),
    )
    const response = await post("/v1/responses", '{"stream":true}')
    const output = await response.text()

    expect(output).toContain('"item":{"id":"first"}')
    expect(output).not.toContain('"item":{"id":"last"}')
  })

  test("passes item IDs through when normalization is disabled", async () => {
    const event =
      'event: response.output_item.added\ndata: {"type":"response.output_item.added","output_index":0,"item":{"id":"first"}}\n\nevent: response.output_item.done\ndata: {"type":"response.output_item.done","output_index":0,"item":{"id":"last"}}\n\n'
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(
        new Response(event, {
          headers: { "content-type": "text/event-stream" },
        }),
      ),
    )
    state.responsesStableItemIds = false

    const response = await post("/v1/responses", '{"stream":true}')

    expect(await response.text()).toBe(event)
  })

  test("logs aliased streaming output without changing SSE framing", async () => {
    const event =
      'event: response.output_text.delta\ndata: {"delta":"allow","obfuscation":"noise"}\n\nevent: response.completed\ndata: {"copilot_usage":{"total_nano_aiu":42},"response":{"model":"gpt-6-luna","status":"completed","instructions":"large policy","output":[{"encrypted_content":"secret","content":[{"text":"{\\"risk_level\\":\\"low\\",\\"outcome\\":\\"allow\\"}"}]}],"usage":{"input_tokens":100,"output_tokens":10}},"type":"response.completed"}\n\n'
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
      '{"model":"gpt-6-luna","status":"completed","output":{"risk_level":"low","outcome":"allow"},"usage":{"input_tokens":100,"output_tokens":10},"copilot_usage":{"total_nano_aiu":42}}',
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

    await post("/v1/responses", "{}", { signal: controller.signal })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(init.signal).toBe(controller.signal)
  })

  test("ignores a request signal already aborted after body consumption", async () => {
    const controller = new AbortController()
    controller.abort()

    await post("/v1/responses", "{}", { signal: controller.signal })

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
