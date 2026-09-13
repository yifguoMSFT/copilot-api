import { readFileSync } from "node:fs"
import { join } from "node:path"
import { createServer } from "node:http"
import type { Server } from "node:http"
import { afterAll, beforeAll, describe, expect, it } from "bun:test"

import { createAntigravityProxyServer } from "../src/services/antigravity/proxy"
import type { AntigravityCredentialStore } from "../src/services/antigravity/auth"
import { buildCloudCodeEnvelope } from "../scripts/antigravity-responses"

const FIXTURES = join(import.meta.dir, "fixtures", "antigravity-generate-content")

describe("Proxy preservation for GenerateContent request and Cloud Code SSE", () => {
  let mockUpstream: Server
  let upstreamPort: number
  let proxyServer: Server
  let proxyPort: number
  let upstreamReceived: {
    method?: string
    path?: string
    headers?: Record<string, string | string[] | undefined>
    body?: string
  } = {}

  const fakeStore: AntigravityCredentialStore = {
    current: async () => ({
      access_token: "fake-preservation-token",
      expires_in: 3600,
      token_type: "Bearer",
    }),
    save: async () => {},
  }

  beforeAll(async () => {
    // 1. Mock upstream (emulating daily-cloudcode-pa.googleapis.com)
    mockUpstream = createServer((req, res) => {
      upstreamReceived.method = req.method
      upstreamReceived.path = req.url
      upstreamReceived.headers = req.headers
      const chunks: Buffer[] = []
      req.on("data", (c) => chunks.push(c))
      req.on("end", () => {
        upstreamReceived.body = Buffer.concat(chunks).toString("utf-8")
        const fixtureSSE = readFileSync(join(FIXTURES, "stream-text.sse"))
        res.writeHead(200, {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-cache",
          "x-custom-upstream-header": "preserved-value",
        })
        res.end(fixtureSSE)
      })
    })

    await new Promise<void>((resolve) => {
      mockUpstream.listen(0, "127.0.0.1", () => {
        const addr = mockUpstream.address()
        upstreamPort = typeof addr === "object" && addr !== null ? addr.port : 0
        resolve()
      })
    })

    // 2. Antigravity forwarding proxy under test
    proxyServer = createAntigravityProxyServer({
      credentialStore: fakeStore,
      host: "127.0.0.1",
      upstreamOrigin: `http://127.0.0.1:${upstreamPort}`,
    })

    await new Promise<void>((resolve) => {
      proxyServer.listen(0, "127.0.0.1", () => {
        const addr = proxyServer.address()
        proxyPort = typeof addr === "object" && addr !== null ? addr.port : 0
        resolve()
      })
    })
  })

  afterAll(async () => {
    await new Promise<void>((resolve) => proxyServer.close(() => resolve()))
    await new Promise<void>((resolve) => mockUpstream.close(() => resolve()))
  })

  it("preserves method, path, query, envelope bytes, and stream response framing unchanged", async () => {
    const envelope = buildCloudCodeEnvelope({
      model: "gemini-3.8-flash-medium",
      project: "aicode-consumers",
      requestBody: { contents: [{ role: "user", parts: [{ text: "ping" }] }] },
      sessionId: "-preserve-sess-1",
    })
    const bodyBytes = JSON.stringify(envelope)

    const targetPath = "/v1internal:streamGenerateContent?alt=sse"
    const res = await fetch(`http://127.0.0.1:${proxyPort}${targetPath}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer client-temp-token", // Should be replaced by proxy
        "x-request-marker": "marker-preserve-123", // Should be forwarded
      },
      body: bodyBytes,
    })

    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toContain("text/event-stream")
    expect(res.headers.get("x-custom-upstream-header")).toBe("preserved-value")

    // Check upstream request received
    expect(upstreamReceived.method).toBe("POST")
    expect(upstreamReceived.path).toBe(targetPath)
    expect(upstreamReceived.body).toBe(bodyBytes) // Exact byte-for-byte preservation
    expect(upstreamReceived.headers?.authorization).toBe("Bearer fake-preservation-token")
    expect(upstreamReceived.headers?.["x-request-marker"]).toBe("marker-preserve-123")

    // Check response body received by caller matches fixture byte-identically
    const expectedFixture = readFileSync(join(FIXTURES, "stream-text.sse")).toString("utf-8")
    const actualBody = await res.text()
    expect(actualBody).toBe(expectedFixture)
  })
})
