import { describe, expect, it } from "bun:test"
import { Hono } from "hono"
import { state } from "~/lib/state"
import { handleResponse } from "~/routes/responses/handler"

describe("Responses route with sanitized input IDs across providers", () => {
  it("normalizes un-prefixed input IDs when forwarding to DeepSeek", async () => {
    let capturedBody: string | undefined
    const origFetch = globalThis.fetch
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).includes("api.deepseek.com")) {
        capturedBody = typeof init?.body === "string" ? init.body : ""
        return new Response(JSON.stringify({ id: "resp_1", choices: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      }
      return origFetch(url, init)
    }) as typeof fetch

    const prevConfig = state.runtimeConfig
    try {
      state.runtimeConfig = {
        environment: "production",
        providers: {
          copilot: {
            defaultModel: "gpt-4o",
            stripReasoningContentForGpt: false,
          },
          codex: {
            authProfile: "default",
            endpoint: "https://chatgpt.com/backend-api",
          },
          deepseek: {
            apiKey: "sk-test",
            baseUrl: "https://api.deepseek.com",
            enabled: true,
            models: ["deepseek-chat"],
          },
          antigravity: {
            enabled: false,
          },
        },
      }

      const app = new Hono()
      app.post("/responses", handleResponse)

      const payload = {
        model: "deepseek-chat",
        input: [
          {
            id: "11KmaujSL-ON1e8P2rKtmQk_0",
            type: "function_call",
            call_id: "call_abc",
            name: "test_tool",
            arguments: "{}",
          },
          {
            id: "raw_msg_1",
            type: "message",
            role: "user",
            content: "hello",
          },
        ],
      }

      const res = await app.request("/responses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      })

      expect(res.status).toBe(200)
      expect(capturedBody).toBeDefined()
      const parsed = JSON.parse(capturedBody!)
      expect(parsed.input[0].id).toBe("fc_11KmaujSL-ON1e8P2rKtmQk_0")
      expect(parsed.input[0].call_id).toBe("call_abc")
      expect(parsed.input[1].id).toBe("msg_raw_msg_1")
    } finally {
      state.runtimeConfig = prevConfig
      globalThis.fetch = origFetch
    }
  })
})
