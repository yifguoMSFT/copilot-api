import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test"
import consola from "consola"

import { defaultProviderConfig } from "../src/lib/runtime-config"
import { state } from "../src/lib/state"
import { server } from "../src/server"
import {
  CodexAuthRequiredError,
  CodexAuthUnavailableError,
  type CodexAuthManager,
  type CodexAuthSnapshot,
} from "../src/services/codex/auth-manager"
import { buildCodexRequestHeaders } from "../src/services/codex/forward-responses"

const originalFetch = globalThis.fetch
const originalInfo = consola.info.bind(consola)
const fetchMock = mock((_input: string | URL | Request, _init?: RequestInit) =>
  Promise.resolve(Response.json({ object: "response" })),
)
const infoMock = mock(() => undefined)

globalThis.fetch = fetchMock as unknown as typeof fetch
consola.info = infoMock as unknown as typeof consola.info

const GATEWAY_KEY = "gateway-secret"

const snapshot = (
  overrides: Partial<CodexAuthSnapshot> = {},
): CodexAuthSnapshot => ({
  accessToken: "codex-access-token",
  accountId: "account-1",
  expiresAt: Date.now() + 3_600_000,
  revision: 1,
  ...overrides,
})

const authManagerWith = (
  getSnapshot: CodexAuthManager["getSnapshot"],
): CodexAuthManager => ({
  getSnapshot,
  refreshNow: () => Promise.resolve(snapshot()),
})

const codexConfig = (
  overrides: Partial<
    ReturnType<typeof defaultProviderConfig>["providers"]["codex"]
  > = {},
) => ({
  ...defaultProviderConfig().providers.codex,
  enabled: true,
  gatewayApiKey: GATEWAY_KEY,
  models: ["codex-test-model"],
  ...overrides,
})

beforeEach(() => {
  fetchMock.mockClear()
  fetchMock.mockImplementation(() =>
    Promise.resolve(Response.json({ object: "response" })),
  )

  state.accountType = "individual"
  state.manualApprove = false
  state.rateLimitSeconds = undefined
  state.rateLimitWait = false
  state.responsesStableItemIds = true
  state.lastRequestTimestamp = undefined
  state.runtimeConfig = {
    environment: "test",
    providers: { ...defaultProviderConfig().providers, codex: codexConfig() },
  }
  state.codexAuthManager = authManagerWith(() => Promise.resolve(snapshot()))
})

afterAll(() => {
  globalThis.fetch = originalFetch
  consola.info = originalInfo
  state.codexAuthManager = undefined
})

const post = (body: string, headers: Record<string, string> = {}) =>
  server.request(
    new Request("http://localhost/v1/responses", {
      body,
      headers: {
        authorization: `Bearer ${GATEWAY_KEY}`,
        "content-type": "application/json",
        ...headers,
      },
      method: "POST",
    }),
  )

const forwarded = (index = 0): [string, RequestInit] =>
  fetchMock.mock.calls[index] as [string, RequestInit]

describe("Codex passthrough forwarding", () => {
  test("posts the untouched body to the configured Codex endpoint", async () => {
    const body = `{
      "model": "codex-test-model",
      "input": "hello 世界",
      "stream": true,
      "unknown_field": {"nested": [1, 2, 3]}
    }`

    const response = await post(body)

    expect(response.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = forwarded()
    expect(url).toBe("https://chatgpt.com/backend-api/codex/responses")
    expect(init.method).toBe("POST")
    expect(init.redirect).toBe("manual")
    expect(new TextDecoder().decode(init.body as ArrayBuffer)).toBe(body)
  })

  test("injects the stored credential and replaces client credentials", async () => {
    await post(JSON.stringify({ model: "codex-test-model" }), {
      "chatgpt-account-id": "attacker-account",
      cookie: "session=attacker",
      "proxy-authorization": "Basic attacker",
      "session-id": "session-1",
      "x-api-key": GATEWAY_KEY,
      "x-codex-window-id": "window-1",
    })

    const [, init] = forwarded()
    const headers = new Headers(init.headers)

    expect(headers.get("authorization")).toBe("Bearer codex-access-token")
    expect(headers.get("chatgpt-account-id")).toBe("account-1")
    expect(headers.get("session-id")).toBe("session-1")
    expect(headers.get("x-codex-window-id")).toBe("window-1")
    expect(headers.get("cookie")).toBeNull()
    expect(headers.get("proxy-authorization")).toBeNull()
    expect(headers.get("x-api-key")).toBeNull()
    expect(headers.get("accept-encoding")).toBe("identity")
  })

  test("omits the account header when the credential has no account id", async () => {
    state.codexAuthManager = authManagerWith(() =>
      Promise.resolve(snapshot({ accountId: undefined })),
    )

    await post(JSON.stringify({ model: "codex-test-model" }), {
      "chatgpt-account-id": "attacker-account",
    })

    const [, init] = forwarded()
    expect(new Headers(init.headers).get("chatgpt-account-id")).toBeNull()
  })

  test("streams SSE bytes through without rewriting events", async () => {
    const sse = [
      "event: response.output_item.added",
      `data: {"type":"response.output_item.added","item":{"id":"item-1","type":"message"}}`,
      "",
      "event: response.completed",
      `data: {"type":"response.completed","response":{"id":"item-2","status":"completed"}}`,
      "",
      "",
    ].join("\n")

    fetchMock.mockImplementation(() =>
      Promise.resolve(
        new Response(sse, {
          headers: { "content-type": "text/event-stream" },
        }),
      ),
    )

    const response = await post(JSON.stringify({ model: "codex-test-model" }))

    expect(response.headers.get("content-type")).toBe("text/event-stream")
    expect(await response.text()).toBe(sse)
  })

  test("keeps a decompressed body consistent with its headers", async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        new Response("plain text", {
          headers: {
            "content-encoding": "gzip",
            "content-length": "58",
            "content-type": "text/plain",
          },
        }),
      ),
    )

    const response = await post(JSON.stringify({ model: "codex-test-model" }))

    expect(response.headers.get("content-encoding")).toBeNull()
    expect(response.headers.get("content-length")).toBeNull()
    expect(await response.text()).toBe("plain text")
  })
})

describe("Codex passthrough gateway", () => {
  test("rejects a request without the gateway key", async () => {
    const response = await server.request(
      new Request("http://localhost/v1/responses", {
        body: JSON.stringify({ model: "codex-test-model" }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    )

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({
      error: {
        code: "gateway_unauthorized",
        message: "Missing or invalid gateway API key",
        type: "error",
      },
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test("rejects a wrong gateway key without calling the upstream", async () => {
    const response = await post(JSON.stringify({ model: "codex-test-model" }), {
      authorization: "Bearer wrong-key",
    })

    expect(response.status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test("accepts the gateway key from x-api-key", async () => {
    const response = await server.request(
      new Request("http://localhost/v1/responses", {
        body: JSON.stringify({ model: "codex-test-model" }),
        headers: {
          "content-type": "application/json",
          "x-api-key": GATEWAY_KEY,
        },
        method: "POST",
      }),
    )

    expect(response.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test("leaves the Copilot path unauthenticated as before", async () => {
    state.runtimeConfig = {
      environment: "test",
      providers: { ...defaultProviderConfig().providers, codex: codexConfig() },
    }
    state.copilotToken = "copilot-token"
    state.vsCodeVersion = "1.0.0"

    const response = await server.request(
      new Request("http://localhost/v1/responses", {
        body: JSON.stringify({ model: "gpt-test" }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    )

    expect(response.status).toBe(200)
    expect(forwarded()[0]).toContain("/responses")
    expect(forwarded()[0]).not.toContain("chatgpt.com")
  })
})

describe("Codex passthrough authentication failures", () => {
  test("reports a missing login as 503 codex_login_required", async () => {
    state.codexAuthManager = authManagerWith(() =>
      Promise.reject(
        new CodexAuthRequiredError("No Codex credentials are stored"),
      ),
    )

    const response = await post(JSON.stringify({ model: "codex-test-model" }))

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({
      error: {
        code: "codex_login_required",
        message:
          'No usable Codex credentials for profile "default"; run the codex-auth login command',
        type: "error",
      },
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test("reports a transient refresh failure as 503 codex_auth_unavailable", async () => {
    state.codexAuthManager = authManagerWith(() =>
      Promise.reject(
        new CodexAuthUnavailableError("token endpoint unreachable"),
      ),
    )

    const response = await post(JSON.stringify({ model: "codex-test-model" }))

    expect(response.status).toBe(503)
    const payload = (await response.json()) as { error: { code: string } }
    expect(payload.error.code).toBe("codex_auth_unavailable")
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe("Codex passthrough upstream responses", () => {
  test.each([401, 429, 500])(
    "returns the upstream %s response unchanged with a single call",
    async (status) => {
      fetchMock.mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ error: { message: "upstream" } }), {
            headers: { "content-type": "application/json" },
            status,
          }),
        ),
      )

      const response = await post(JSON.stringify({ model: "codex-test-model" }))

      expect(response.status).toBe(status)
      expect(await response.text()).toBe(
        JSON.stringify({ error: { message: "upstream" } }),
      )
      expect(fetchMock).toHaveBeenCalledTimes(1)
    },
  )

  test("does not fall back to Copilot for a disabled Codex model", async () => {
    state.runtimeConfig = {
      environment: "test",
      providers: {
        ...defaultProviderConfig().providers,
        codex: codexConfig({ enabled: false }),
      },
    }

    const response = await post(JSON.stringify({ model: "codex-test-model" }))

    expect(response.status).toBe(500)
    const payload = (await response.json()) as { error: { message: string } }
    expect(payload.error.message).toContain("Codex provider is disabled")
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe("Codex request headers", () => {
  test("drops headers named by Connection", () => {
    const inbound = new Headers({
      connection: "x-hop-header",
      "content-type": "application/json",
      "x-hop-header": "drop-me",
    })

    const headers = buildCodexRequestHeaders(inbound, snapshot())

    expect(headers.get("x-hop-header")).toBeNull()
    expect(headers.get("content-type")).toBe("application/json")
  })
})
