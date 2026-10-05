import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test"
import consola from "consola"

import {
  defaultProviderConfig,
  loadRuntimeConfig,
} from "../src/lib/runtime-config"
import { state } from "../src/lib/state"
import { server } from "../src/server"
import automationUpdateNamespace from "./fixtures/deepseek-schema/automation-update.tools.json"

interface FunctionTool {
  name: string
  parameters: Record<string, unknown>
  type: string
}

interface NamespaceTool {
  name: string
  tools: Array<FunctionTool>
  type: string
}

interface ForwardedDeepSeekBody {
  input: Array<Record<string, unknown>>
  model: string
  tools: Array<NamespaceTool>
}

const automationUpdateTool =
  automationUpdateNamespace as unknown as NamespaceTool

const withDeclaredRoot = (namespace: NamespaceTool): NamespaceTool => ({
  ...namespace,
  tools: namespace.tools.map((tool) => ({
    ...tool,
    parameters: { ...tool.parameters, type: "object" },
  })),
})

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

// The Responses API requires a model; these cases exercise transport
// behaviour, so they carry a routable Copilot model.
const post = (
  path: string,
  body = '{"model":"gpt-copilot"}',
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

describe("DeepSeek forwarding", () => {
  test.each([200, 400])(
    "forwards DeepSeek namespace tools unchanged and preserves upstream status %s",
    async (status) => {
      const previousConfig = state.runtimeConfig
      state.runtimeConfig = {
        environment: "test",
        ...defaultProviderConfig(),
        providers: {
          ...defaultProviderConfig().providers,
          copilot: { enabled: true, stripReasoningContentForGpt: true },
          deepseek: {
            enabled: true,
            baseUrl: "https://api.deepseek.com",
            apiKey: "test-deepseek-key",
            models: ["deepseek-flash"],
          },
        },
      }
      const upstreamBody = status === 200 ? "response" : "unsupported tool"
      fetchMock.mockImplementation(() =>
        Promise.resolve(new Response(upstreamBody, { status })),
      )
      const body = JSON.stringify({
        model: "deepseek-flash",
        previous_response_id: "previous-response",
        conversation: "conversation-id",
        tools: [
          {
            type: "namespace",
            name: "functions",
            tools: [
              {
                type: "function",
                name: "exec_command",
                parameters: { type: "object", properties: {} },
              },
            ],
          },
        ],
      })
      try {
        const response = await post("/v1/responses", body)
        expect(response.status).toBe(status)
        expect(await response.text()).toBe(upstreamBody)
        expect(fetchMock).toHaveBeenCalledTimes(1)
        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
        expect(url).toBe("https://api.deepseek.com/responses")
        expect(await new Response(init.body).text()).toBe(body)
        expect((init.headers as Record<string, string>).authorization).toBe(
          "Bearer test-deepseek-key",
        )
      } finally {
        // Tests run sequentially and restore their own runtime configuration.
        // eslint-disable-next-line require-atomic-updates
        state.runtimeConfig = previousConfig
      }
    },
  )

  test("declares the object root for DeepSeek schemas that only imply it", async () => {
    const previousConfig = state.runtimeConfig
    state.runtimeConfig = {
      environment: "test",
      ...defaultProviderConfig(),
      providers: {
        ...defaultProviderConfig().providers,
        copilot: { enabled: true, stripReasoningContentForGpt: true },
        deepseek: {
          enabled: true,
          baseUrl: "https://api.deepseek.com",
          apiKey: "test-deepseek-key",
          models: ["deepseek-flash"],
        },
      },
    }
    fetchMock.mockImplementation(() =>
      Promise.resolve(Response.json({ object: "response" })),
    )
    const body = JSON.stringify({
      model: "deepseek-flash",
      tools: [structuredClone(automationUpdateTool)],
      input: [
        {
          type: "tool_search_output",
          call_id: "call_search",
          execution: "client",
          tools: [structuredClone(automationUpdateTool)],
        },
      ],
    })
    try {
      const response = await post("/v1/responses", body)
      expect(response.status).toBe(200)
      expect(fetchMock).toHaveBeenCalledTimes(1)

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
      const forwarded = JSON.parse(
        await new Response(init.body).text(),
      ) as unknown as ForwardedDeepSeekBody

      const expected = withDeclaredRoot(automationUpdateTool)
      expect(forwarded.model).toBe("deepseek-flash")
      expect(forwarded.tools).toHaveLength(1)
      expect(forwarded.tools[0]).toEqual(expected)
      expect(forwarded.tools[0].tools[0].parameters.oneOf).toHaveLength(4)
      expect(
        Object.keys(forwarded.tools[0].tools[0].parameters.$defs as object),
      ).toHaveLength(25)

      expect(forwarded.input).toHaveLength(1)
      expect(forwarded.input[0].call_id).toBe("call_search")
      expect(forwarded.input[0].execution).toBe("client")
      expect(forwarded.input[0].tools).toEqual([expected])

      // The caller's request stays byte-identical to what the client sent.
      expect(body).toBe(
        JSON.stringify({
          model: "deepseek-flash",
          tools: [automationUpdateTool],
          input: [
            {
              type: "tool_search_output",
              call_id: "call_search",
              execution: "client",
              tools: [automationUpdateTool],
            },
          ],
        }),
      )
    } finally {
      // Tests run sequentially and restore their own runtime configuration.
      // eslint-disable-next-line require-atomic-updates
      state.runtimeConfig = previousConfig
    }
  })

  test("drops a call the client answered with unsupported call before forwarding", async () => {
    const previousConfig = state.runtimeConfig
    state.runtimeConfig = {
      environment: "test",
      ...defaultProviderConfig(),
      providers: {
        ...defaultProviderConfig().providers,
        copilot: { enabled: true, stripReasoningContentForGpt: true },
        deepseek: {
          enabled: true,
          baseUrl: "https://api.deepseek.com",
          apiKey: "test-deepseek-key",
          models: ["deepseek-flash"],
        },
      },
    }
    fetchMock.mockImplementation(() =>
      Promise.resolve(Response.json({ object: "response" })),
    )
    const input = [
      {
        type: "function_call",
        id: "9ebb480d-06e9-457e-af25-62082aa1c8f5",
        name: "mcp__kanban_execution::kanban_update",
        arguments: "{}",
        call_id: "call_rejected",
      },
      {
        type: "function_call_output",
        id: "fco_rejected",
        call_id: "call_rejected",
        output: "unsupported call: mcp__kanban_execution::kanban_update",
      },
      {
        type: "function_call",
        id: "bffe5ec6-ab43-4397-90c9-cf66919ba650",
        name: "kanban_update",
        namespace: "mcp__kanban_execution",
        arguments: "{}",
        call_id: "call_retry",
      },
      {
        type: "function_call_output",
        id: "fco_retry",
        call_id: "call_retry",
        output: 'Wall time: 4s\nOutput:\n{"result":"ok"}',
      },
    ]
    try {
      const response = await post(
        "/v1/responses",
        JSON.stringify({ model: "deepseek-flash", input }),
      )

      expect(response.status).toBe(200)
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
      expect(url).toBe("https://api.deepseek.com/responses")
      const forwarded = JSON.parse(await new Response(init.body).text()) as {
        input: Array<Record<string, unknown>>
      }
      expect(forwarded.input).toEqual([input[2], input[3]])
    } finally {
      // eslint-disable-next-line require-atomic-updates
      state.runtimeConfig = previousConfig
    }
  })
})

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
  state.runtimeConfig.providers.copilot.stripReasoningContentForGpt = false
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
      ).toBe(400)
    }
    expect(fetchMock).not.toHaveBeenCalled()
    expect(
      (await post("/v1/responses", "{}", { headers: compactHeaders })).status,
    ).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
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

  test("uses the effective DeepSeek provider and forwards provider-specific fields", async () => {
    await enableCompaction("deepseek-flash")
    const config = state.runtimeConfig
    if (config === undefined) throw new Error("Missing config")
    config.providers.deepseek.enabled = true
    config.providers.deepseek.apiKey = "test-key"
    const payload = {
      model: "gpt-6-sol",
      previous_response_id: "stored",
      tools: [{ type: "web_search" }],
    }
    const response = await post("/v1/responses", JSON.stringify(payload), {
      headers: compactHeaders,
    })
    expect(response.status).toBe(200)
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.deepseek.com/responses",
    )
    expect(JSON.parse(upstreamBody())).toEqual({
      ...payload,
      model: "deepseek-flash",
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
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
      const response = await post(path, '{"model":"gpt-copilot"}', {
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
      await post("/v1/responses", '{"model":"gpt-copilot"}', {
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

      const response = await post(
        "/v1/responses",
        JSON.stringify({ model: "gpt-copilot", stream }),
      )

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

  test("rejects a request without a model before reaching an upstream", async () => {
    const response = await post("/v1/responses", "{}")

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: {
        code: "invalid_model",
        message: "Responses request must include a model",
        type: "error",
      },
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

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

    const response = await post(
      "/v1/responses",
      '{"model":"gpt-copilot","stream":true}',
    )

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
    const response = await post(
      "/v1/responses",
      '{"model":"gpt-copilot","stream":true}',
    )
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

    const response = await post(
      "/v1/responses",
      '{"model":"gpt-copilot","stream":true}',
    )

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

    await post("/v1/responses", '{"model":"gpt-copilot"}', {
      signal: controller.signal,
    })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(init.signal).toBe(controller.signal)
  })

  test("ignores a request signal already aborted after body consumption", async () => {
    const controller = new AbortController()
    controller.abort()

    await post("/v1/responses", '{"model":"gpt-copilot"}', {
      signal: controller.signal,
    })

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

  test("preserves native Responses item IDs and tool fields", async () => {
    const previousConfig = state.runtimeConfig
    state.runtimeConfig = {
      environment: "test",
      ...defaultProviderConfig(),
      providers: {
        ...defaultProviderConfig().providers,
        copilot: { enabled: true, stripReasoningContentForGpt: true },
        deepseek: {
          enabled: true,
          baseUrl: "https://api.deepseek.com",
          apiKey: "test-deepseek-key",
          models: ["deepseek-flash"],
        },
      },
    }
    const body = JSON.stringify({
      model: "deepseek-flash",
      input: [
        {
          type: "function_call",
          id: "native-call-id",
          call_id: "native-call-id",
          name: "exec",
          arguments: "{}",
        },
        {
          type: "function_call_output",
          call_id: "native-call-id",
          output: "ok",
        },
      ],
      tools: [{ type: "function", name: "exec" }],
    })
    try {
      await post("/v1/responses", body)
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
      expect(await new Response(init.body).text()).toBe(body)
    } finally {
      // eslint-disable-next-line require-atomic-updates
      state.runtimeConfig = previousConfig
    }
  })

  test("answers a section header on the cheap Copilot reviewer at low effort", async () => {
    const previousConfig = state.runtimeConfig
    state.runtimeConfig = {
      environment: "test",
      ...defaultProviderConfig(),
      providers: {
        ...defaultProviderConfig().providers,
        copilot: { enabled: true, stripReasoningContentForGpt: true },
      },
    }
    // Codex sends its own background turns, such as thread titles, with the
    // first id of the catalog, which is a display-only header.
    const body = JSON.stringify({
      model: "----codex----",
      input: [{ type: "message", role: "user", content: "title this thread" }],
      reasoning: { effort: "max", summary: "auto" },
    })

    try {
      const response = await post("/v1/responses", body)

      expect(response.status).toBe(200)
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
      expect(url.endsWith("/responses")).toBe(true)
      const forwarded = JSON.parse(await new Response(init.body).text()) as {
        model: string
        reasoning: Record<string, unknown>
      }
      expect(forwarded.model).toBe("gpt-6-luna")
      expect(forwarded.reasoning).toEqual({ effort: "low", summary: "auto" })
    } finally {
      // eslint-disable-next-line require-atomic-updates
      state.runtimeConfig = previousConfig
    }
  })
})

describe("Antigravity route forwarding", () => {
  test("routes gemini-3.8-flash-tiered through handler to Antigravity Responses", async () => {
    state.runtimeConfig = {
      environment: "test",
      ...defaultProviderConfig(),
      providers: {
        codex: {
          authProfile: "default",
          baseUrl: "https://chatgpt.com/backend-api/codex",
          enabled: false,
          models: [],
          transport: "http",
        },
        copilot: { enabled: true, stripReasoningContentForGpt: true },
        deepseek: {
          enabled: false,
          baseUrl: "https://api.deepseek.com",
          apiKey: "",
          models: [],
        },
        antigravity: { enabled: true },
      },
    }

    state.antigravityCredentialStore = {
      current: async () => ({
        access_token: "test-token",
        project_id: "test-proj",
        type: "antigravity",
      }),
    } as any

    const originalFetch = globalThis.fetch
    let capturedBody: any = null
    globalThis.fetch = (async (_url: string, init: any) => {
      capturedBody = JSON.parse(init.body)
      return new Response(
        "data: "
          + JSON.stringify({
            candidates: [
              {
                content: { parts: [{ text: "antigravity response" }] },
                finishReason: "STOP",
              },
            ],
          })
          + "\n\n",
        {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        },
      )
    }) as any

    try {
      const app = server
      const res = await app.request("/v1/responses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: "gemini-3.8-flash-tiered",
          stream: true,
          reasoning: { effort: "low" },
          input: "hello",
        }),
      })

      expect(res.status).toBe(200)
      expect(capturedBody.model).toBe("gemini-3.8-flash-low")
      expect(capturedBody.project).toBe("test-proj")
      const text = await res.text()
      expect(text).toContain("antigravity response")
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test("does not convert the call the client answered with unsupported call", async () => {
    state.runtimeConfig = {
      environment: "test",
      ...defaultProviderConfig(),
      providers: {
        codex: {
          authProfile: "default",
          baseUrl: "https://chatgpt.com/backend-api/codex",
          enabled: false,
          models: [],
          transport: "http",
        },
        copilot: { enabled: true, stripReasoningContentForGpt: true },
        deepseek: {
          enabled: false,
          baseUrl: "https://api.deepseek.com",
          apiKey: "",
          models: [],
        },
        antigravity: { enabled: true },
      },
    }
    state.antigravityCredentialStore = {
      current: async () => ({
        access_token: "test-token",
        project_id: "test-proj",
        type: "antigravity",
      }),
    } as any

    const originalFetch = globalThis.fetch
    let capturedBody: any = null
    globalThis.fetch = (async (_url: string, init: any) => {
      capturedBody = JSON.parse(init.body)
      return new Response(
        "data: "
          + JSON.stringify({
            candidates: [
              { content: { parts: [{ text: "ok" }] }, finishReason: "STOP" },
            ],
          })
          + "\n\n",
        { status: 200, headers: { "content-type": "text/event-stream" } },
      )
    }) as any

    const input = [
      {
        type: "function_call",
        id: "fc_rejected",
        name: "mcp__kanban_execution::kanban_update",
        arguments: "{}",
        call_id: "call_rejected",
      },
      {
        type: "function_call_output",
        id: "fco_rejected",
        call_id: "call_rejected",
        output: "unsupported call: mcp__kanban_execution::kanban_update",
      },
    ]

    try {
      const res = await server.request("/v1/responses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: "gemini-3.8-flash-tiered",
          stream: true,
          input,
        }),
      })

      expect(res.status).toBe(200)
      expect(JSON.stringify(capturedBody)).not.toContain(
        "mcp__kanban_execution::kanban_update",
      )
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
