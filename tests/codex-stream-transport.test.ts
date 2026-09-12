import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  mock,
  test,
} from "bun:test"

import type {
  CodexAuthManager,
  CodexAuthSnapshot,
} from "../src/services/codex/auth-manager"

import { defaultProviderConfig } from "../src/lib/runtime-config"
import { state } from "../src/lib/state"
import { server } from "../src/server"

const originalFetch = globalThis.fetch

const fetchMock = mock((_input: string | URL | Request, _init?: RequestInit) =>
  Promise.resolve(Response.json({ object: "response" })),
)
globalThis.fetch = fetchMock as unknown as typeof fetch

const snapshot = (): CodexAuthSnapshot => ({
  accessToken: "codex-access-token",
  accountId: "account-1",
  expiresAt: Date.now() + 3_600_000,
  revision: 1,
})

const authManager: CodexAuthManager = {
  getSnapshot: () => Promise.resolve(snapshot()),
  refreshNow: () => Promise.resolve(snapshot()),
}

interface ControllableStream {
  controller: ReadableStreamDefaultController<Uint8Array>
  stream: ReadableStream<Uint8Array>
}

const controllableStream = (): ControllableStream => {
  let captured: ReadableStreamDefaultController<Uint8Array> | undefined
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      captured = controller
    },
  })
  if (captured === undefined) throw new Error("stream did not start")
  return { controller: captured, stream }
}

let port = 0
let bunServer: ReturnType<typeof Bun.serve> | undefined

beforeAll(() => {
  state.accountType = "individual"
  state.manualApprove = false
  state.rateLimitSeconds = undefined
  state.rateLimitWait = false
  state.responsesStableItemIds = true
  state.lastRequestTimestamp = undefined
  state.runtimeConfig = {
    environment: "test",
    providers: {
      ...defaultProviderConfig().providers,
      codex: {
        ...defaultProviderConfig().providers.codex,
        enabled: true,
        models: ["codex-test-model"],
      },
    },
  }
  state.codexAuthManager = authManager

  bunServer = Bun.serve({
    fetch: (request) => server.fetch(request),
    hostname: "127.0.0.1",
    port: 0,
  })
  port = bunServer.port ?? 0
})

afterAll(() => {
  globalThis.fetch = originalFetch
  void bunServer?.stop(true)
})

afterEach(() => {
  fetchMock.mockClear()
})

const startStreamingRequest = (signal?: AbortSignal) =>
  fetch(`http://127.0.0.1:${port}/v1/responses`, {
    body: JSON.stringify({ model: "codex-test-model", stream: true }),
    headers: {
      authorization: "Bearer gateway-secret",
      "content-type": "application/json",
    },
    method: "POST",
    signal,
  })

describe("Codex SSE transport over a real socket", () => {
  test("delivers a chunk before the upstream stream completes", async () => {
    const upstream = controllableStream()
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        new Response(upstream.stream, {
          headers: { "content-type": "text/event-stream" },
        }),
      ),
    )

    const response = await startStreamingRequest()
    expect(response.headers.get("content-type")).toBe("text/event-stream")

    const reader = response.body?.getReader()
    if (reader === undefined) throw new Error("no response body")

    upstream.controller.enqueue(new TextEncoder().encode("data: first\n\n"))

    const first = await reader.read()
    expect(new TextDecoder().decode(first.value as Uint8Array)).toBe(
      "data: first\n\n",
    )

    // The upstream stream is still open, so the first chunk proved streaming
    // rather than a buffered whole-body copy.
    upstream.controller.enqueue(new TextEncoder().encode("data: second\n\n"))
    const second = await reader.read()
    expect(new TextDecoder().decode(second.value as Uint8Array)).toBe(
      "data: second\n\n",
    )

    upstream.controller.close()
    expect((await reader.read()).done).toBeTrue()
  })

  test("propagates a downstream cancel to the upstream request signal", async () => {
    const upstream = controllableStream()
    let upstreamSignal: AbortSignal | undefined
    fetchMock.mockImplementation(
      (_input: string | URL | Request, init?: RequestInit) => {
        upstreamSignal = init?.signal ?? undefined
        return Promise.resolve(
          new Response(upstream.stream, {
            headers: { "content-type": "text/event-stream" },
          }),
        )
      },
    )

    const abort = new AbortController()
    const response = await startStreamingRequest(abort.signal)
    const reader = response.body?.getReader()
    if (reader === undefined) throw new Error("no response body")

    upstream.controller.enqueue(new TextEncoder().encode("data: first\n\n"))
    await reader.read()

    abort.abort()
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(upstreamSignal?.aborted).toBeTrue()
  })

  test("stops pulling from the upstream while the client is not reading", async () => {
    const upstream = controllableStream()
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        new Response(upstream.stream, {
          headers: { "content-type": "text/event-stream" },
        }),
      ),
    )

    const response = await startStreamingRequest()
    const reader = response.body?.getReader()
    if (reader === undefined) throw new Error("no response body")

    // Nothing reads the client socket yet, so the runtime must stop pulling
    // once its buffers are full instead of materializing the whole stream.
    const chunk = new Uint8Array(64 * 1024)
    let queued = 0
    const limit = 16 * 1024 * 1024
    while (queued < limit) {
      upstream.controller.enqueue(chunk)
      queued += chunk.byteLength
      const remaining = upstream.controller.desiredSize
      if (remaining !== null && remaining <= 0) break
      await new Promise((resolve) => setTimeout(resolve, 5))
    }

    expect(upstream.controller.desiredSize ?? 0).toBeLessThanOrEqual(0)
    expect(queued).toBeLessThan(limit)

    await reader.cancel()
  })
})
