import { describe, expect, test } from "bun:test"
import { createAntigravityResponses } from "../src/services/antigravity/create-responses"
import { AntigravityCredentialStore } from "../src/services/antigravity/auth"

describe("createAntigravityResponses in-process service", () => {
  const mockStore = {
    current: async () => ({
      access_token: "mock-token-xyz",
      project_id: "my-test-project",
      type: "antigravity",
    }),
  } as unknown as AntigravityCredentialStore

  test("rejects non-JSON payload with 400", async () => {
    await expect(
      createAntigravityResponses("not-json", { credentialStore: mockStore }),
    ).rejects.toThrow("Responses request must be valid JSON")
  })

  test("rejects non-streaming requests with 400", async () => {
    const body = JSON.stringify({ model: "gemini-3.8-flash-tiered", stream: false, input: "hi" })
    await expect(
      createAntigravityResponses(body, { credentialStore: mockStore }),
    ).rejects.toThrow("only supports streaming requests")
  })

  test("rejects missing project_id with 503", async () => {
    const storeWithoutProject = {
      current: async () => ({
        access_token: "token",
        project_id: "",
        type: "antigravity",
      }),
    } as unknown as AntigravityCredentialStore

    const body = JSON.stringify({ model: "gemini-3.8-flash-tiered", stream: true, input: "hi" })
    await expect(
      createAntigravityResponses(body, { credentialStore: storeWithoutProject }),
    ).rejects.toThrow("no valid project_id")
  })

  test("maps effort to upstream model, sets bearer and UA, and streams back responses", async () => {
    let capturedUrl = ""
    let capturedHeaders: Record<string, string> = {}
    let capturedBody: any = null

    const mockFetch = async (url: string, init: any) => {
      capturedUrl = url
      capturedHeaders = init.headers
      capturedBody = JSON.parse(init.body)

      const sseContent = [
        "data: " + JSON.stringify({
          candidates: [{
            content: { parts: [{ text: "Hello from Antigravity!" }] },
            finishReason: "STOP",
          }],
          usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 10, totalTokenCount: 15 }
        }),
        "",
        ""
      ].join("\n\n")

      return new Response(sseContent, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      })
    }

    const body = JSON.stringify({
      model: "gemini-3.8-flash-tiered",
      stream: true,
      reasoning: { effort: "high" },
      input: "hi",
    })

    // Verify Session-Id header as sent by Codex client
    const headers = new Headers({ "session-id": "codex-session-abc" })
    const response = await createAntigravityResponses(body, {
      credentialStore: mockStore,
      headers,
      fetchImpl: mockFetch as any,
    })

    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain("text/event-stream")

    // Check upstream request
    expect(capturedUrl).toContain("v1internal:streamGenerateContent?alt=sse")
    expect(capturedHeaders["authorization"]).toBe("Bearer mock-token-xyz")
    expect(capturedHeaders["user-agent"]).toBe("antigravity/hub/2.9.1 darwin/arm64")
    expect(capturedBody.model).toBe("gemini-3.8-flash-high")
    expect(capturedBody.project).toBe("my-test-project")
    expect(capturedBody.request.sessionId).toBe("codex-session-abc")

    // Read SSE body
    const text = await response.text()
    expect(text).toContain("response.output_text.delta")
    expect(text).toContain("Hello from Antigravity!")
    expect(text).toContain("response.completed")
  })

  test("forwards non-200 upstream responses with their status and body", async () => {
    const mockFetch = async () => {
      return new Response(JSON.stringify({ error: { message: "Quota exceeded" } }), {
        status: 429,
        headers: { "content-type": "application/json" },
      })
    }

    const body = JSON.stringify({
      model: "gemini-3.8-flash-tiered",
      stream: true,
      input: "hi",
    })

    const response = await createAntigravityResponses(body, {
      credentialStore: mockStore,
      fetchImpl: mockFetch as any,
    })

    expect(response.status).toBe(429)
    const errBody = await response.json()
    expect(errBody.error.message).toBe("Quota exceeded")
  })

  test("uses client_metadata session_id but never prompt_cache_key as session identity", async () => {
    let capturedBody: any = null
    const mockFetch = async (_url: string, init: any) => {
      capturedBody = JSON.parse(init.body)
      return new Response(
        `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: "ok" }] }, finishReason: "STOP" }] })}\n\n`,
        { status: 200, headers: { "content-type": "text/event-stream" } },
      )
    }

    const body = JSON.stringify({
      model: "gemini-3.8-flash-tiered",
      stream: true,
      input: "hi",
      prompt_cache_key: "cache-key-is-not-session",
      client_metadata: { session_id: "body-session-1" },
    })
    const response = await createAntigravityResponses(body, {
      credentialStore: mockStore,
      fetchImpl: mockFetch as any,
    })

    expect(response.status).toBe(200)
    expect(capturedBody.request.sessionId).toBe("body-session-1")
  })
})
