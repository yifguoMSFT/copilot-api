import type { IncomingMessage, Server, ServerResponse } from "node:http"

import { request as httpRequest } from "node:http"
import { createServer } from "node:http"
import { request as httpsRequest } from "node:https"

import type { AntigravityCredentialStore } from "./auth"
import { ANTIGRAVITY_USER_AGENT } from "./auth"

/**
 * Headers that describe a single hop and must not be forwarded (RFC 9110).
 * `connection` may also name additional headers; those are dropped separately.
 */
const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
])

/**
 * The proxy never adds these, and a client must not be able to smuggle them
 * upstream either.
 */
const FORWARDING_HEADERS = new Set([
  "forwarded",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-port",
  "x-forwarded-proto",
  "x-real-ip",
])

export class AntigravityProxyError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = "AntigravityProxyError"
    this.code = code
  }
}

export interface AntigravityProxyOptions {
  credentialStore: AntigravityCredentialStore
  /** Fixed upstream origin; a request can never change it. */
  upstreamOrigin: string
}

export type AntigravityProxyListener = (
  request: IncomingMessage,
  response: ServerResponse,
) => void

/**
 * Validates the one configured upstream origin.
 *
 * HTTPS is required except for a loopback origin, so tests can stand up a
 * local mock. A path, query, fragment, or userinfo is always rejected: the
 * request's own target supplies the path.
 */
export function resolveUpstreamOrigin(value: string): URL {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new AntigravityProxyError(
      "upstream_invalid",
      "Antigravity upstream origin must be an absolute URL",
    )
  }

  const isLoopback =
    url.hostname === "127.0.0.1"
    || url.hostname === "::1"
    || url.hostname === "[::1]"
    || url.hostname === "localhost"

  if (url.protocol !== "https:" && (url.protocol !== "http:" || !isLoopback))
    throw new AntigravityProxyError(
      "upstream_invalid",
      "Antigravity upstream origin must use https unless it targets loopback",
    )
  if (url.pathname !== "/" || url.search !== "" || url.hash !== "")
    throw new AntigravityProxyError(
      "upstream_invalid",
      "Antigravity upstream origin must not carry a path, query, or fragment",
    )
  if (url.username !== "" || url.password !== "")
    throw new AntigravityProxyError(
      "upstream_invalid",
      "Antigravity upstream origin must not carry userinfo",
    )

  return url
}

export function assertLoopbackHost(host: string): void {
  if (
    host !== "127.0.0.1"
    && host !== "::1"
    && host !== "[::1]"
    && host !== "localhost"
  )
    throw new AntigravityProxyError(
      "listen_invalid",
      `Antigravity proxy must bind loopback, refused to bind ${host}`,
    )
}

/**
 * The transparent forward.
 *
 * The only thing this edits is the `Authorization` header: the method, raw
 * escaped path, query string, body bytes, and every end-to-end header travel
 * unchanged in both directions. There is no schema awareness here on purpose.
 */
export function createAntigravityProxyListener(
  options: AntigravityProxyOptions,
): AntigravityProxyListener {
  const upstream = resolveUpstreamOrigin(options.upstreamOrigin)
  const store = options.credentialStore
  const isHttps = upstream.protocol === "https:"
  const upstreamPort = upstream.port === "" ? undefined : Number(upstream.port)

  return (request, response) => {
    const forward = async (): Promise<void> => {
      let requestPath: string
      try {
        requestPath = resolveRequestPath(request.url)
      } catch (error) {
        respondLocally(response, 400, messageOf(error, "invalid_request"))
        return
      }

      let accessToken: string
      try {
        accessToken = (await store.current()).access_token
      } catch {
        // The credential never reaches the client or the log; only the class
        // of failure is reported.
        respondLocally(response, 503, "credential_unavailable")
        return
      }

      const send = isHttps ? httpsRequest : httpRequest
      const upstreamRequest = send(
        {
          headers: forwardRequestHeaders(request, accessToken),
          host: upstream.hostname,
          method: request.method,
          path: requestPath,
          ...(upstreamPort === undefined ? {} : { port: upstreamPort }),
        },
        (upstreamResponse) => {
          response.writeHead(
            upstreamResponse.statusCode ?? 502,
            forwardResponseHeaders(upstreamResponse),
          )
          // Send the head as soon as it exists. Without this, Node holds the
          // status and headers back until the first body byte, so a caller
          // could not observe a streamed response while the upstream is still
          // thinking. The body stays a byte-for-byte pipe.
          response.flushHeaders()
          upstreamResponse.pipe(response)
          upstreamResponse.on("aborted", () => {
            response.destroy()
          })
          upstreamResponse.on("error", () => {
            response.destroy()
          })
        },
      )

      upstreamRequest.on("error", () => {
        // A failure before the response starts is a local gateway error; after
        // it starts the stream is aborted instead of being completed.
        if (response.headersSent) response.destroy()
        else respondLocally(response, 502, "upstream_unavailable")
      })

      response.on("close", () => {
        if (!upstreamRequest.destroyed) upstreamRequest.destroy()
      })

      request.pipe(upstreamRequest)
    }

    void forward().catch(() => {
      if (response.headersSent) response.destroy()
      else respondLocally(response, 500, "proxy_failure")
    })
  }
}

export function createAntigravityProxyServer(
  options: AntigravityProxyOptions & { host: string },
): Server {
  assertLoopbackHost(options.host)
  return createServer(createAntigravityProxyListener(options))
}

/**
 * Only an origin-form target is accepted. Absolute-form (`http://evil/…`) and
 * authority-form (`//evil/…`) would otherwise let the caller pick a host.
 */
function resolveRequestPath(rawUrl: string | undefined): string {
  const target = rawUrl ?? "/"
  if (!target.startsWith("/") || target.startsWith("//"))
    throw new AntigravityProxyError(
      "invalid_request_target",
      "Antigravity proxy only accepts an origin-form request target",
    )
  return target
}

function forwardRequestHeaders(
  request: IncomingMessage,
  accessToken: string,
): Record<string, string> {
  const connectionTokens = parseTokenList(request.headers.connection)
  const headers: Record<string, string> = {}

  for (const [name, value] of Object.entries(request.headers)) {
    const lower = name.toLowerCase()
    if (value === undefined) continue
    if (HOP_BY_HOP.has(lower) || connectionTokens.has(lower)) continue
    if (FORWARDING_HEADERS.has(lower)) continue
    // `host` is re-derived from the configured origin, the caller's bearer
    // token is replaced by the account's own, and the UA is replaced by the
    // Antigravity Hub fingerprint below.
    if (
      lower === "host"
      || lower === "authorization"
      || lower === "user-agent"
    )
      continue
    headers[lower] = Array.isArray(value) ? value.join(", ") : value
  }

  headers.authorization = `Bearer ${accessToken}`
  // The upstream only answers the Antigravity Hub fingerprint: the same request
  // without this UA is rejected with 403 `SUBSCRIPTION_REQUIRED`. CLIProxyAPI's
  // executor sends the identical value, so this belongs to the auth injection
  // rather than to passthrough.
  headers["user-agent"] = ANTIGRAVITY_USER_AGENT
  return headers
}

function forwardResponseHeaders(
  upstreamResponse: IncomingMessage,
): Record<string, string | Array<string>> {
  const connectionTokens = parseTokenList(upstreamResponse.headers.connection)
  const headers: Record<string, string | Array<string>> = {}

  for (const [name, value] of Object.entries(upstreamResponse.headers)) {
    const lower = name.toLowerCase()
    if (value === undefined) continue
    if (HOP_BY_HOP.has(lower) || connectionTokens.has(lower)) continue
    headers[lower] = value
  }

  return headers
}

function parseTokenList(
  value: string | Array<string> | undefined,
): Set<string> {
  if (value === undefined) return new Set()
  const raw = Array.isArray(value) ? value.join(",") : value
  return new Set(
    raw
      .split(",")
      .map((token) => token.trim().toLowerCase())
      .filter((token) => token !== ""),
  )
}

function respondLocally(
  response: ServerResponse,
  status: number,
  body: string,
): void {
  if (response.headersSent) {
    response.destroy()
    return
  }
  response.writeHead(status, { "content-type": "text/plain; charset=utf-8" })
  response.end(`${body}\n`)
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}
