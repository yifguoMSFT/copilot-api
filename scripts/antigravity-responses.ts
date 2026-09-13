import type { IncomingMessage, Server, ServerResponse } from "node:http"
import { createServer } from "node:http"
import { randomUUID } from "node:crypto"
import {
  convertResponsesRequestToGenerateContent,
  type JsonObject,
  type ToolIdentity,
} from "../src/services/generate-content/convert"
import { createGenerateContentEventStream } from "../src/services/generate-content/stream"
import { assertLoopbackHost, resolveUpstreamOrigin } from "../src/services/antigravity/proxy"

export const DEFAULT_PROXY_ORIGIN = "http://127.0.0.1:51234"
export const DEFAULT_LISTEN_HOST = "127.0.0.1"
export const DEFAULT_LISTEN_PORT = 51_235
export const DEFAULT_MODEL = "gemini-3.8-flash-medium"
export const DEFAULT_PROJECT = "aicode-consumers"
export const DEFAULT_USER_AGENT = "antigravity"
export const DEFAULT_REQUEST_TYPE = "agent"

export interface AdapterOptions {
  proxyOrigin?: string
  defaultModel?: string
  defaultProject?: string
  fetchImpl?: typeof fetch
}

export function buildCloudCodeEnvelope(options: {
  model: string
  project: string
  requestBody: JsonObject
  sessionId: string
  requestId?: string
  requestType?: string
  userAgent?: string
}): JsonObject {
  return {
    model: options.model,
    project: options.project,
    request: {
      ...options.requestBody,
      sessionId: options.sessionId,
    },
    requestId: options.requestId ?? `agent-${randomUUID()}`,
    requestType: options.requestType ?? DEFAULT_REQUEST_TYPE,
    userAgent: options.userAgent ?? DEFAULT_USER_AGENT,
  }
}

export function createAntigravityResponsesListener(
  options: AdapterOptions = {},
): (req: IncomingMessage, res: ServerResponse) => void {
  const proxyOriginUrl = resolveUpstreamOrigin(options.proxyOrigin ?? DEFAULT_PROXY_ORIGIN)
  const defaultModel = options.defaultModel ?? DEFAULT_MODEL
  const defaultProject = options.defaultProject ?? DEFAULT_PROJECT
  const fetchFn = options.fetchImpl ?? fetch

  return (req: IncomingMessage, res: ServerResponse) => {
    if (req.method === "GET" && req.url === "/healthz") {
      res.writeHead(200, { "content-type": "application/json" })
      res.end(JSON.stringify({ status: "ok" }))
      return
    }

    if (req.method !== "POST" || (req.url !== "/v1/responses" && req.url !== "/responses")) {
      res.writeHead(404, { "content-type": "application/json" })
      res.end(JSON.stringify({ error: { message: "Not found" } }))
      return
    }

    const chunks: Array<Buffer> = []
    req.on("data", (chunk: Buffer) => chunks.push(chunk))
    req.on("end", async () => {
      const rawBody = Buffer.concat(chunks).toString("utf-8")
      let responsesReq: JsonObject
      try {
        responsesReq = JSON.parse(rawBody)
      } catch {
        res.writeHead(400, { "content-type": "application/json" })
        res.end(JSON.stringify({ error: { message: "Invalid JSON" } }))
        return
      }

      const requestedModel =
        typeof responsesReq.model === "string" && responsesReq.model !== "" ?
          responsesReq.model
        : defaultModel

      // Map Responses to GenerateContent body
      let converted: { body: JsonObject; tools: Map<string, ToolIdentity> }
      try {
        converted = convertResponsesRequestToGenerateContent(responsesReq)
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        res.writeHead(400, { "content-type": "application/json" })
        res.end(JSON.stringify({ error: { message, code: "conversion_error" } }))
        return
      }

      // Determine session ID (from header or fallback)
      const headerSessionId = req.headers["x-session-id"]
      const sessionId =
        typeof headerSessionId === "string" && headerSessionId !== "" ?
          headerSessionId
        : `-${Date.now()}`

      // Wrap in Cloud Code envelope
      const envelope = buildCloudCodeEnvelope({
        model: requestedModel,
        project: defaultProject,
        requestBody: converted.body,
        sessionId,
      })

      const upstreamUrl = new URL(
        "/v1internal:streamGenerateContent?alt=sse",
        proxyOriginUrl.origin,
      ).toString()

      let upstreamResp: Response
      try {
        upstreamResp = await fetchFn(upstreamUrl, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "text/event-stream",
          },
          body: JSON.stringify(envelope),
        })
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        res.writeHead(502, { "content-type": "application/json" })
        res.end(JSON.stringify({ error: { message, code: "upstream_unavailable" } }))
        return
      }

      if (!upstreamResp.ok) {
        const errText = await upstreamResp.text()
        res.writeHead(upstreamResp.status, { "content-type": "application/json" })
        res.end(JSON.stringify({ error: { status: upstreamResp.status, message: errText } }))
        return
      }

      if (!upstreamResp.body) {
        res.writeHead(502, { "content-type": "application/json" })
        res.end(JSON.stringify({ error: { message: "No upstream body" } }))
        return
      }

      // Setup Responses SSE
      res.writeHead(200, {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache",
        connection: "keep-alive",
      })

      const stream = createGenerateContentEventStream({
        requestedModel,
        tools: converted.tools,
      })

      const reader = upstreamResp.body.getReader()
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          if (value) {
            const out = stream.push(value)
            if (out !== "") res.write(out)
          }
        }
        const finalOut = stream.flush()
        if (finalOut !== "") res.write(finalOut)
      } catch {
        stream.cancel()
      } finally {
        res.end()
      }
    })
  }
}

export function createAntigravityResponsesServer(
  options: AdapterOptions & { host?: string; port?: number },
): Server {
  const host = options.host ?? DEFAULT_LISTEN_HOST
  assertLoopbackHost(host)
  return createServer(createAntigravityResponsesListener(options))
}
