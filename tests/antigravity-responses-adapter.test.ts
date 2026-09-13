import { readFileSync } from "node:fs"
import { join } from "node:path"
import { createServer } from "node:http"
import type { Server } from "node:http"
import { afterAll, beforeAll, describe, expect, it } from "bun:test"

import {
  buildCloudCodeEnvelope,
  createAntigravityResponsesServer,
} from "../scripts/antigravity-responses"

const FIXTURES = join(import.meta.dir, "fixtures", "antigravity-generate-content")

describe("Antigravity Responses adapter", () => {
  let mockProxy: Server
  let mockProxyPort: number
  let adapter: Server
  let adapterPort: number
  let capturedUpstreamRequest: {
    method?: string
    url?: string
    headers?: Record<string, string | string[] | undefined>
    body?: Record<string, unknown>
  } = {}

  beforeAll(async () => {
    // 1. Stand up a mock Antigravity auth proxy
    mockProxy = createServer((req, res) => {
      capturedUpstreamRequest.method = req.method
      capturedUpstreamRequest.url = req.url
      capturedUpstreamRequest.headers = req.headers
      const chunks: Buffer[] = []
      req.on("data", (c: Buffer) => chunks.push(c))
      req.on("end", () => {
        try {
          capturedUpstreamRequest.body = JSON.parse(Buffer.concat(chunks).toString("utf-8"))
        } catch {
          // ignore
        }
        // Return the byte-exact stream-text.sse fixture
        const sse = readFileSync(join(FIXTURES, "stream-text.sse"))
        res.writeHead(200, {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-cache",
        })
        res.end(sse)
      })
    })

    await new Promise<void>((resolve) => {
      mockProxy.listen(0, "127.0.0.1", () => {
        const addr = mockProxy.address()
        mockProxyPort = typeof addr === "object" && addr !== null ? addr.port : 0
        resolve()
      })
    })

    // 2. Stand up the adapter pointing to the mock proxy
    adapter = createAntigravityResponsesServer({
      proxyOrigin: `http://127.0.0.1:${mockProxyPort}`,
      defaultModel: "gemini-3.8-flash-medium",
      defaultProject: "aicode-consumers",
    })

    await new Promise<void>((resolve) => {
      adapter.listen(0, "127.0.0.1", () => {
        const addr = adapter.address()
        adapterPort = typeof addr === "object" && addr !== null ? addr.port : 0
        resolve()
      })
    })
  })

  afterAll(async () => {
    await new Promise<void>((resolve) => adapter.close(() => resolve()))
    await new Promise<void>((resolve) => mockProxy.close(() => resolve()))
  })

  it("builds the confirmed Cloud Code envelope accurately", () => {
    const env = buildCloudCodeEnvelope({
      model: "gemini-3.8-flash-medium",
      project: "aicode-consumers",
      requestBody: { contents: [{ role: "user", parts: [{ text: "hi" }] }] },
      sessionId: "-12345",
      requestId: "agent-fixed-id",
    })

    expect(env.model).toBe("gemini-3.8-flash-medium")
    expect(env.project).toBe("aicode-consumers")
    expect(env.requestId).toBe("agent-fixed-id")
    expect(env.requestType).toBe("agent")
    expect(env.userAgent).toBe("antigravity")
    expect((env.request as Record<string, unknown>).sessionId).toBe("-12345")
  })

  it("receives a Responses POST request, converts it to Cloud Code envelope, sends to upstream proxy, and streams Responses SSE back", async () => {
    const response = await fetch(`http://127.0.0.1:${adapterPort}/v1/responses`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-session-id": "-custom-sess-id",
      },
      body: JSON.stringify({
        model: "gemini-3.8-flash-medium",
        input: [{ role: "user", content: "Reply with pong" }],
      }),
    })

    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain("text/event-stream")

    // Check what was captured upstream by the proxy
    expect(capturedUpstreamRequest.method).toBe("POST")
    expect(capturedUpstreamRequest.url).toBe("/v1internal:streamGenerateContent?alt=sse")
    const upstreamEnvelope = capturedUpstreamRequest.body as Record<string, unknown>
    expect(upstreamEnvelope.model).toBe("gemini-3.8-flash-medium")
    expect(upstreamEnvelope.project).toBe("aicode-consumers")
    expect(upstreamEnvelope.requestType).toBe("agent")
    expect(upstreamEnvelope.userAgent).toBe("antigravity")
    const upReq = upstreamEnvelope.request as Record<string, unknown>
    expect(upReq.sessionId).toBe("-custom-sess-id")
    expect(Array.isArray(upReq.contents)).toBe(true)

    // Check streamed body received by client
    const responseText = await response.text()
    expect(responseText).toContain("event: response.created")
    expect(responseText).toContain("event: response.output_text.delta")
    expect(responseText).toContain("pong")
    expect(responseText).toContain("event: response.completed")
  })

  it("returns 400 for invalid responses JSON or conversion errors", async () => {
    const response = await fetch(`http://127.0.0.1:${adapterPort}/v1/responses`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        input: "hi",
        parallel_tool_calls: false, // Refused by converter
      }),
    })
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error).toBeDefined()
  })
})
