import type { IncomingHttpHeaders, Server, ServerResponse } from "node:http"

/**
 * Drives the live-test runner against a controlled loopback upstream. The
 * runner must reach the native `v1internal:*` paths through the real proxy
 * server, keep the response bytes intact, and report each check separately.
 */
import { afterAll, describe, expect, test } from "bun:test"
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises"
import { createServer } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { runAntigravityLiveTest } from "../scripts/antigravity-proxy-live-test"
import {
  ANTIGRAVITY_USER_AGENT,
  type AntigravityFetch,
} from "../src/services/antigravity/auth"

const directories: Array<string> = []
const servers: Array<Server> = []

afterAll(async () => {
  for (const server of servers) await close(server)
  for (const directory of directories)
    await rm(directory, { force: true, recursive: true })
})

interface SeenRequest {
  authorization: string | undefined
  body: string
  url: string | undefined
  userAgent: string | undefined
}

function markerOf(body: string): string {
  return /Remember this marker: ([0-9a-f-]+)/.exec(body)?.[1] ?? ""
}

async function startUpstream(): Promise<{
  origin: string
  requests: Array<SeenRequest>
}> {
  const requests: Array<SeenRequest> = []
  const server = createServer((request, response) => {
    const chunks: Array<Buffer> = []
    request.on("data", (chunk: Buffer) => chunks.push(chunk))
    request.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8")
      requests.push({
        authorization: headerOf(request.headers, "authorization"),
        body,
        url: request.url,
        userAgent: headerOf(request.headers, "user-agent"),
      })
      const url = request.url ?? ""
      if (url.startsWith("/v1internal:loadCodeAssist")) {
        json(response, 200, {
          cloudaicompanionProject: "project-from-upstream",
          currentTier: { id: "free-tier" },
        })
        return
      }
      if (url.startsWith("/v1internal:fetchAvailableModels")) {
        json(response, 200, {
          models: {
            "gemini-2.5-flash": { displayName: "Gemini 2.5 Flash" },
            "gemini-3.8-flash-medium": {
              displayName: "Gemini 3.8 Flash Medium",
            },
          },
          webSearchModelIds: ["gemini-3.8-flash-medium"],
        })
        return
      }
      if (url.startsWith("/v1internal:streamGenerateContent")) {
        response.writeHead(200, { "content-type": "text/event-stream" })
        response.write(
          `data: ${JSON.stringify({ response: candidate("pong") })}\n\n`,
        )
        response.end(
          `data: ${JSON.stringify({ response: { candidates: [] } })}\n\n`,
        )
        return
      }
      if (url.startsWith("/v1internal:generateContent")) {
        if (!body.includes('"request"')) {
          json(response, 400, {
            error: {
              code: 400,
              message: "Request must contain a request body.",
              status: "INVALID_ARGUMENT",
            },
          })
          return
        }
        const marker = markerOf(body)
        const text = marker === "" ? "OK" : `The marker is ${marker}`
        json(response, 200, {
          response: candidate(text),
          traceId: "trace-live-test",
        })
        return
      }
      json(response, 404, { error: { message: `no route for ${url}` } })
    })
  })
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve())
  })
  servers.push(server)
  const address = server.address()
  if (address === null || typeof address === "string")
    throw new Error("upstream did not report a port")
  return { origin: `http://127.0.0.1:${address.port}`, requests }
}

function candidate(text: string): Record<string, unknown> {
  return {
    candidates: [
      {
        content: { parts: [{ text }], role: "model" },
        finishReason: "STOP",
      },
    ],
    usageMetadata: { candidatesTokenCount: 1, promptTokenCount: 8 },
  }
}

function headerOf(
  headers: IncomingHttpHeaders,
  name: string,
): string | undefined {
  const value = headers[name]
  return Array.isArray(value) ? value.join(", ") : value
}

function json(response: ServerResponse, status: number, body: unknown): void {
  const payload = Buffer.from(JSON.stringify(body))
  response.writeHead(status, {
    "content-length": payload.length,
    "content-type": "application/json",
  })
  response.end(payload)
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve) => {
    server.close(() => resolve())
  })
}

const tokenFetch: AntigravityFetch = () =>
  Promise.resolve(
    Response.json({
      access_token: "refreshed-access-token",
      expires_in: 3600,
      token_type: "Bearer",
    }),
  )

async function prepareCredential(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "antigravity-live-test-"))
  directories.push(directory)
  const credentialPath = join(directory, "antigravity.json")
  await writeFile(
    credentialPath,
    JSON.stringify({
      access_token: "access-token-value",
      expired: new Date(Date.now() + 3_600_000).toISOString(),
      project_id: "project-from-credential",
      refresh_token: "refresh-token-value",
    }),
  )
  return credentialPath
}

describe("Antigravity endpoint live-test runner", () => {
  test("walks every check through the proxy and keeps the raw evidence", async () => {
    const upstream = await startUpstream()
    const credentialPath = await prepareCredential()
    const evidenceDir = join(
      tmpdir(),
      `antigravity-live-evidence-${Date.now()}`,
    )
    directories.push(evidenceDir)

    const report = await runAntigravityLiveTest({
      credentialPath,
      evidenceDir,
      tokenFetch,
      upstreamOrigin: upstream.origin,
    })

    expect(report.steps.map((step) => [step.id, step.status])).toEqual([
      ["metadata.loadCodeAssist", "pass"],
      ["metadata.fetchAvailableModels", "pass"],
      ["generate.nonStreaming", "pass"],
      ["generate.streaming", "pass"],
      ["generate.continuation", "pass"],
      ["credential.refresh", "pass"],
      ["error.invalidRequest", "pass"],
    ])
    expect(report.projectId).toBe("project-from-upstream")
    expect(report.model).toBe("gemini-3.8-flash-medium")

    const paths = upstream.requests.map((request) => request.url)
    expect(paths).toContain("/v1internal:loadCodeAssist")
    expect(paths).toContain("/v1internal:fetchAvailableModels")
    expect(paths).toContain("/v1internal:generateContent")
    expect(paths).toContain("/v1internal:streamGenerateContent?alt=sse")
    expect(paths.some((path) => path?.includes("interactions"))).toBe(false)

    // The proxy owns both headers; the client never sent them.
    for (const request of upstream.requests) {
      expect(request.userAgent).toBe(ANTIGRAVITY_USER_AGENT)
      expect(
        request.authorization === "Bearer access-token-value"
          || request.authorization === "Bearer refreshed-access-token",
      ).toBe(true)
    }

    // The refresh check runs on a copy, so the account credential is untouched.
    expect(JSON.parse(await readFile(credentialPath, "utf8"))).toMatchObject({
      access_token: "access-token-value",
      refresh_token: "refresh-token-value",
    })

    const evidence = await readdir(evidenceDir)
    expect(evidence).toContain("report.json")
    expect(evidence).toContain("generate-content.response.bin")
    expect(evidence).toContain("stream-generate-content.response.bin")
    const streamed = await readFile(
      join(evidenceDir, "stream-generate-content.response.bin"),
      "utf8",
    )
    expect(streamed).toContain("pong")
  })

  test("reports a failing step instead of throwing when the upstream refuses", async () => {
    const credentialPath = await prepareCredential()
    const evidenceDir = join(
      tmpdir(),
      `antigravity-live-evidence-${Date.now()}-b`,
    )
    directories.push(evidenceDir)

    const report = await runAntigravityLiveTest({
      credentialPath,
      evidenceDir,
      model: "gemini-3.8-flash-medium",
      timeoutMs: 5_000,
      tokenFetch,
      // Nothing listens here: every proxied request must fail as a gateway error.
      upstreamOrigin: "http://127.0.0.1:1",
    })

    expect(report.steps.every((step) => step.status === "fail")).toBe(true)
    expect(report.steps[0]?.detail).toContain("502")
  })
})
