import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test"
import consola from "consola"

import { buildPublishedModels } from "../src/lib/model-sources"
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
const originalWarn = consola.warn.bind(consola)
const fetchMock = mock((_input: string | URL | Request, _init?: RequestInit) =>
  Promise.resolve(Response.json({ object: "response" })),
)
const infoMock = mock(() => undefined)
const warnMock = mock(() => undefined)

globalThis.fetch = fetchMock as unknown as typeof fetch
consola.info = infoMock as unknown as typeof consola.info
consola.warn = warnMock as unknown as typeof consola.warn

const GATEWAY_KEY = "gateway-secret"
const CODEX_MODEL = "codex-test-model(codex)"

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
  models: ["codex-test-model"],
  ...overrides,
})

beforeEach(() => {
  fetchMock.mockClear()
  infoMock.mockClear()
  warnMock.mockClear()
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
    ...defaultProviderConfig(),
    providers: { ...defaultProviderConfig().providers, codex: codexConfig() },
  }
  state.publishedModels = buildPublishedModels({
    config: state.runtimeConfig,
    officialModels: ["codex-test-model"],
    copilotModels: [],
  })
  state.codexAuthManager = authManagerWith(() => Promise.resolve(snapshot()))
})

afterAll(() => {
  globalThis.fetch = originalFetch
  consola.info = originalInfo
  consola.warn = originalWarn
  state.codexAuthManager = undefined
  state.publishedModels = undefined
})

const post = (body: string, headers: Record<string, string> = {}) =>
  server.request(
    new Request("http://localhost/v1/responses", {
      body,
      headers: {
        "content-type": "application/json",
        ...headers,
      },
      method: "POST",
    }),
  )

const forwarded = (index = 0): [string, RequestInit] =>
  fetchMock.mock.calls[index] as [string, RequestInit]

describe("Codex passthrough forwarding", () => {
  test("strips encrypted-only reasoning before forwarding to Codex", async () => {
    const response = await post(
      JSON.stringify({
        model: CODEX_MODEL,
        input: [
          {
            type: "reasoning",
            summary: [],
            encrypted_content: "foreign-cipher",
          },
        ],
      }),
    )
    expect(response.status).toBe(200)
    const [url, init] = forwarded()
    expect(url).toBe("https://chatgpt.com/backend-api/codex/responses")
    expect(await new Response(init.body).json()).toEqual({
      model: "codex-test-model",
      input: [{ type: "reasoning", summary: [] }],
    })
    expect(new Headers(init.headers).get("authorization")).toBe(
      "Bearer codex-access-token",
    )
  })
  test("strips the source suffix and posts the rest of the payload", async () => {
    const body = JSON.stringify({
      model: CODEX_MODEL,
      input: "hello 世界",
      stream: true,
      unknown_field: { nested: [1, 2, 3], text: CODEX_MODEL },
    })

    const response = await post(body)

    expect(response.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = forwarded()
    expect(url).toBe("https://chatgpt.com/backend-api/codex/responses")
    expect(init.method).toBe("POST")
    expect(init.redirect).toBe("manual")
    expect(await new Response(init.body).json()).toEqual({
      model: "codex-test-model",
      input: "hello 世界",
      stream: true,
      // Only the top-level model is rewritten; other text stays untouched.
      unknown_field: { nested: [1, 2, 3], text: CODEX_MODEL },
    })
  })

  test("injects the stored credential and replaces client credentials", async () => {
    await post(JSON.stringify({ model: CODEX_MODEL }), {
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

    await post(JSON.stringify({ model: CODEX_MODEL }), {
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

    const response = await post(JSON.stringify({ model: CODEX_MODEL }))

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

    const response = await post(JSON.stringify({ model: CODEX_MODEL }))

    expect(response.headers.get("content-encoding")).toBeNull()
    expect(response.headers.get("content-length")).toBeNull()
    expect(await response.text()).toBe("plain text")
  })
})

describe("Codex passthrough gateway", () => {
  test("forwards without a client API key using the logged-in credential", async () => {
    const response = await server.request(
      new Request("http://localhost/v1/responses", {
        body: JSON.stringify({ model: CODEX_MODEL }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    )

    expect(response.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(new Headers(forwarded()[1].headers).get("authorization")).toBe(
      "Bearer codex-access-token",
    )
  })

  test("ignores client credentials and injects the stored credential", async () => {
    const response = await post(JSON.stringify({ model: CODEX_MODEL }), {
      authorization: "Bearer wrong-key",
    })

    expect(response.status).toBe(200)
    expect(new Headers(forwarded()[1].headers).get("authorization")).toBe(
      "Bearer codex-access-token",
    )
  })

  test("accepts and strips a client x-api-key", async () => {
    const response = await server.request(
      new Request("http://localhost/v1/responses", {
        body: JSON.stringify({ model: CODEX_MODEL }),
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
      ...defaultProviderConfig(),
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

    const response = await post(JSON.stringify({ model: CODEX_MODEL }))

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

    const response = await post(JSON.stringify({ model: CODEX_MODEL }))

    expect(response.status).toBe(503)
    const payload = (await response.json()) as { error: { code: string } }
    expect(payload.error.code).toBe("codex_auth_unavailable")
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe("Codex passthrough upstream responses", () => {
  test("logs every step of the Codex forward", async () => {
    const response = await post(JSON.stringify({ model: CODEX_MODEL }))
    await response.text()

    expect(response.status).toBe(200)
    expect(infoMock).toHaveBeenCalledWith(
      expect.stringMatching(
        /^Codex forward: profile=\S+ baseUrl=\S+ bodyBytes=\d+$/,
      ),
    )
    expect(infoMock).toHaveBeenCalledWith(
      expect.stringMatching(
        /^Codex forward: credentials ready account=\S+ revision=\d+ expiresAt=\S+$/,
      ),
    )
    expect(infoMock).toHaveBeenCalledWith(
      expect.stringMatching(/^Codex forward: upstream responded 200 in \d+ms$/),
    )
  })

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

      const response = await post(JSON.stringify({ model: CODEX_MODEL }))

      expect(response.status).toBe(status)
      expect(await response.text()).toBe(
        JSON.stringify({ error: { message: "upstream" } }),
      )
      expect(fetchMock).toHaveBeenCalledTimes(1)
    },
  )

  test("rejects a Codex suffix while the provider is disabled", async () => {
    state.runtimeConfig = {
      environment: "test",
      ...defaultProviderConfig(),
      providers: {
        ...defaultProviderConfig().providers,
        codex: codexConfig({ enabled: false }),
      },
    }
    // The published set is rebuilt for the disabled configuration, so the
    // suffix is no longer a known model id at all.
    state.publishedModels = buildPublishedModels({
      config: state.runtimeConfig,
      officialModels: ["codex-test-model"],
      copilotModels: [],
    })

    const response = await post(JSON.stringify({ model: CODEX_MODEL }))

    expect(response.status).toBe(400)
    const payload = (await response.json()) as {
      error: { code: string; message: string }
    }
    expect(payload.error.code).toBe("model_provider_disabled")
    expect(payload.error.message).toContain("Codex provider is disabled")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test("routes a Copilot suffix to Copilot without the Codex gateway key", async () => {
    state.runtimeConfig = {
      environment: "test",
      ...defaultProviderConfig(),
      providers: {
        ...defaultProviderConfig().providers,
        codex: codexConfig({ models: ["codex-test-model"] }),
      },
    }
    state.publishedModels = buildPublishedModels({
      config: state.runtimeConfig,
      officialModels: ["codex-test-model"],
      copilotModels: ["codex-test-model"],
    })
    state.copilotToken = "copilot-token"
    state.vsCodeVersion = "1.0.0"

    const response = await server.request(
      new Request("http://localhost/v1/responses", {
        body: JSON.stringify({ model: "codex-test-model(copilot)" }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    )

    expect(response.status).toBe(200)
    const [url, init] = forwarded()
    expect(url).not.toContain("chatgpt.com")
    expect(await new Response(init.body).json()).toEqual({
      model: "codex-test-model",
    })
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
