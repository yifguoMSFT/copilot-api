import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test"

import { state } from "../src/lib/state"
import { createResponses } from "../src/services/copilot/create-responses"

const originalFetch = globalThis.fetch
const upstreamResponse = new Response(
  JSON.stringify({ object: "response", status: "completed" }),
  {
    headers: { "content-type": "application/json" },
  },
)
const fetchMock = mock((_input: string | URL | Request, _init?: RequestInit) =>
  Promise.resolve(upstreamResponse),
)

globalThis.fetch = fetchMock as unknown as typeof fetch

beforeEach(() => {
  fetchMock.mockClear()
  fetchMock.mockImplementation(() => Promise.resolve(upstreamResponse))
  state.accountType = "individual"
  state.copilotToken = "current-copilot-token"
  state.vsCodeVersion = "1.0.0"
})

afterAll(() => {
  globalThis.fetch = originalFetch
})

describe("createResponses", () => {
  test.each([
    ["individual", "https://api.githubcopilot.com/responses"],
    ["business", "https://api.business.githubcopilot.com/responses"],
    ["enterprise", "https://api.enterprise.githubcopilot.com/responses"],
  ])("uses the %s account URL", async (accountType, expectedUrl) => {
    state.accountType = accountType

    await createResponses("{}")

    expect(fetchMock).toHaveBeenCalledWith(
      expectedUrl,
      expect.objectContaining({ method: "POST" }),
    )
  })

  test("forwards exact body, signal, and shared Copilot headers", async () => {
    const body = new Uint8Array([0, 1, 2, 255])
    const controller = new AbortController()

    await createResponses(body, controller.signal)

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const headers = new Headers(init.headers)
    expect(init.body).toBe(body)
    expect(init.signal).toBe(controller.signal)
    expect(headers.get("authorization")).toBe("Bearer current-copilot-token")
    expect(headers.get("copilot-integration-id")).toBe("vscode-chat")
    expect(headers.get("editor-version")).toBe("vscode/1.0.0")
    expect(headers.get("content-type")).toBe("application/json")
  })

  test("returns JSON, SSE, and upstream errors without parsing", async () => {
    const responses = [
      upstreamResponse,
      new Response("event: response.completed\ndata: {}\n\n", {
        headers: { "content-type": "text/event-stream" },
      }),
      new Response(JSON.stringify({ error: { message: "invalid" } }), {
        status: 400,
      }),
    ]

    for (const response of responses) {
      fetchMock.mockImplementationOnce(() => Promise.resolve(response))
      expect(await createResponses("{}")).toBe(response)
    }
  })

  test("fails before fetch when no Copilot token exists", () => {
    state.copilotToken = undefined

    expect(createResponses("{}")).rejects.toThrow("Copilot token not found")
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
