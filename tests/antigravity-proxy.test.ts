import type {
  IncomingHttpHeaders,
  IncomingMessage,
  Server,
  ServerResponse,
} from "node:http"

import { afterAll, describe, expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { createServer, request as httpRequest } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"

import {
  ANTIGRAVITY_USER_AGENT,
  AntigravityCredentialStore,
} from "../src/services/antigravity/auth"
import {
  AntigravityProxyError,
  createAntigravityProxyServer,
  resolveUpstreamOrigin,
} from "../src/services/antigravity/proxy"

const directories: Array<string> = []
const servers: Array<Server> = []

afterAll(async () => {
  for (const server of servers) await closeServer(server)
  for (const directory of directories)
    await rm(directory, { force: true, recursive: true })
})

/** A credential file exactly like the one the login module writes. */
async function credentialStore(
  overrides: Record<string, unknown> = {},
): Promise<AntigravityCredentialStore> {
  const directory = await mkdtemp(join(tmpdir(), "antigravity-proxy-"))
  directories.push(directory)
  const path = join(directory, "antigravity-test.json")
  await writeFile(
    path,
    JSON.stringify({
      access_token: "access-token-value",
      expired: new Date(Date.now() + 3_600_000).toISOString(),
      project_id: "project-from-cliproxy",
      refresh_token: "refresh-token-value",
      ...overrides,
    }),
  )
  return new AntigravityCredentialStore(path)
}

interface CapturedRequest {
  body: Buffer
  headers: IncomingHttpHeaders
  method: string | undefined
  url: string | undefined
}

type UpstreamHandler = (
  request: IncomingMessage,
  response: ServerResponse,
  body: Buffer,
) => void

interface Upstream {
  origin: string
  requests: Array<CapturedRequest>
}

async function startUpstream(handler: UpstreamHandler): Promise<Upstream> {
  const requests: Array<CapturedRequest> = []
  const server = createServer((request, response) => {
    const chunks: Array<Buffer> = []
    request.on("data", (chunk: Buffer) => chunks.push(chunk))
    request.on("end", () => {
      const body = Buffer.concat(chunks)
      requests.push({
        body,
        headers: request.headers,
        method: request.method,
        url: request.url,
      })
      handler(request, response, body)
    })
  })
  await listen(server)
  servers.push(server)
  return { origin: `http://127.0.0.1:${portOf(server)}`, requests }
}

interface ProxyResult {
  body: Buffer
  headers: IncomingHttpHeaders
  status: number
}

async function startProxy(
  credentialStore: AntigravityCredentialStore,
  upstreamOrigin: string,
): Promise<number> {
  const server = createAntigravityProxyServer({
    credentialStore,
    host: "127.0.0.1",
    upstreamOrigin,
  })
  await listen(server)
  servers.push(server)
  return portOf(server)
}

async function callProxy(
  port: number,
  options: {
    body?: string | Buffer
    headers?: Record<string, string>
    method?: string
    path: string
  },
): Promise<ProxyResult> {
  const { promise, reject, resolve } = Promise.withResolvers<ProxyResult>()
  const request = httpRequest(
    {
      headers: options.headers,
      host: "127.0.0.1",
      method: options.method ?? "GET",
      path: options.path,
      port,
    },
    (response) => {
      const chunks: Array<Buffer> = []
      response.on("data", (chunk: Buffer) => chunks.push(chunk))
      response.on("error", reject)
      response.on("end", () =>
        resolve({
          body: Buffer.concat(chunks),
          headers: response.headers,
          status: response.statusCode ?? 0,
        }),
      )
    },
  )
  request.on("error", reject)
  request.end(options.body)
  return await promise
}

async function listen(server: Server): Promise<void> {
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve())
  })
}

async function closeServer(server: Server): Promise<void> {
  server.closeAllConnections()
  await new Promise<void>((resolve) => {
    server.close(() => resolve())
  })
}

function portOf(server: Server): number {
  const address = server.address()
  return typeof address === "object" && address !== null ? address.port : 0
}

/** Picks a currently free loopback port for the unreachable-upstream case. */
async function freePort(): Promise<number> {
  const server = createServer()
  await listen(server)
  const port = portOf(server)
  await closeServer(server)
  return port
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds)
  })
}

function okHandler(
  _request: IncomingMessage,
  response: ServerResponse,
  body: Buffer,
): void {
  response.writeHead(200, { "content-type": "application/octet-stream" })
  response.end(body)
}

describe("resolveUpstreamOrigin", () => {
  test("accepts https and loopback http but rejects anything ambiguous", () => {
    expect(
      resolveUpstreamOrigin("https://generativelanguage.googleapis.com")
        .hostname,
    ).toBe("generativelanguage.googleapis.com")
    expect(resolveUpstreamOrigin("http://127.0.0.1:1234").port).toBe("1234")

    expect(() => resolveUpstreamOrigin("http://example.com")).toThrow(
      AntigravityProxyError,
    )
    expect(() => resolveUpstreamOrigin("https://example.com/v1beta")).toThrow(
      AntigravityProxyError,
    )
    expect(() => resolveUpstreamOrigin("https://example.com?x=1")).toThrow(
      AntigravityProxyError,
    )
    expect(() =>
      resolveUpstreamOrigin("https://user:pass@example.com"),
    ).toThrow(AntigravityProxyError)
    expect(() => resolveUpstreamOrigin("not an absolute url")).toThrow(
      AntigravityProxyError,
    )
  })
})

describe("createAntigravityProxyServer", () => {
  test("refuses to bind a non-loopback listen address", async () => {
    const store = await credentialStore()
    let thrown: unknown
    try {
      createAntigravityProxyServer({
        credentialStore: store,
        host: "0.0.0.0",
        upstreamOrigin: "http://127.0.0.1:1",
      })
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBeInstanceOf(AntigravityProxyError)
    expect((thrown as AntigravityProxyError).code).toBe("listen_invalid")
  })
})

describe("Antigravity forwarding proxy", () => {
  test("forwards the exact method, escaped path, and query to the fixed origin", async () => {
    const upstream = await startUpstream(okHandler)
    const store = await credentialStore()
    const port = await startProxy(store, upstream.origin)

    const targets = [
      "/",
      "/v1beta/interactions",
      "/v1beta/interactions/abc-123",
      "/v1beta/interactions/abc-123/cancel",
      "/v1beta/interactions/a%2Fb%20c?x=%20&y=1",
      "/unknown/deep/path?a=1&a=2&empty=&flag",
    ]

    for (const target of targets) {
      const result = await callProxy(port, { method: "POST", path: target })
      expect(result.status).toBe(200)
    }

    expect(upstream.requests.map((entry) => entry.url)).toEqual(targets)
    expect(upstream.requests.map((entry) => entry.method)).toEqual(
      targets.map(() => "POST"),
    )
  })

  test("replaces the caller bearer and user-agent, and strips forwarding headers", async () => {
    const upstream = await startUpstream(okHandler)
    const store = await credentialStore()
    const port = await startProxy(store, upstream.origin)

    const result = await callProxy(port, {
      headers: {
        authorization: "Bearer caller-token",
        connection: "close, x-dropped",
        forwarded: "for=10.0.0.1",
        host: "evil.example",
        "x-dropped": "1",
        "x-forwarded-for": "10.0.0.1",
        "x-real-ip": "10.0.0.1",
        "x-request-id": "req-1",
        "user-agent": "curl/8.11.0",
      },
      path: "/v1beta/interactions",
    })

    expect(result.status).toBe(200)
    expect(upstream.requests).toHaveLength(1)
    const seen = upstream.requests[0].headers
    expect(seen.authorization).toBe("Bearer access-token-value")
    expect(seen.host).toBe(new URL(upstream.origin).host)
    expect(seen["x-request-id"]).toBe("req-1")
    expect(seen.forwarded).toBeUndefined()
    expect(seen["x-forwarded-for"]).toBeUndefined()
    expect(seen["x-real-ip"]).toBeUndefined()
    expect(seen["x-dropped"]).toBeUndefined()
    // Verified live on 2026-09-13: the upstream rejects any other UA with 403
    // SUBSCRIPTION_REQUIRED, exactly as CLIProxyAPI's executor replaces it.
    expect(seen["user-agent"]).toBe(ANTIGRAVITY_USER_AGENT)
  })

  test("streams the request body through unchanged, byte for byte", async () => {
    const upstream = await startUpstream(okHandler)
    const store = await credentialStore()
    const port = await startProxy(store, upstream.origin)

    const bodies: Array<string | Buffer> = [
      '{"a":1,"a":2}',
      '{"big":123456789012345678901234567890}',
      '{"spaced":  [1,  2]  }\n',
      "not json at all \u0000\u0007",
      Buffer.from([0x00, 0x01, 0x7f, 0x80, 0xfe, 0xff, 0x0d, 0x0a]),
    ]

    for (const body of bodies) {
      const sent = Buffer.from(body)
      const result = await callProxy(port, {
        body: sent,
        headers: { "content-type": "application/octet-stream" },
        method: "POST",
        path: "/v1beta/interactions",
      })
      expect(result.status).toBe(200)
      expect(result.body.equals(sent)).toBe(true)
    }

    expect(upstream.requests).toHaveLength(bodies.length)
    for (const [index, body] of bodies.entries())
      expect(upstream.requests[index].body.equals(Buffer.from(body))).toBe(true)
  })
})

describe("Antigravity forwarding proxy safety", () => {
  test("fails locally with zero upstream requests when the credential is unusable", async () => {
    const upstream = await startUpstream(okHandler)

    for (const overrides of [
      { access_token: "" },
      {
        expired: new Date(Date.now() - 60_000).toISOString(),
        refresh_token: undefined,
      },
      { expired: "not-a-timestamp" },
    ]) {
      const store = await credentialStore(overrides)
      const port = await startProxy(store, upstream.origin)
      const result = await callProxy(port, { path: "/v1beta/interactions" })
      expect(result.status).toBe(503)
      expect(result.body.toString()).toBe("credential_unavailable\n")
    }

    expect(upstream.requests).toHaveLength(0)
  })

  test("passes status codes and bodies through with exactly one upstream request each", async () => {
    const store = await credentialStore()

    const statuses = [401, 403, 429, 500, 503]
    for (const status of statuses) {
      const body = JSON.stringify({ error: { status } })
      let seen = 0
      const server = createServer((_request, response) => {
        seen += 1
        response.writeHead(status, { "content-type": "application/json" })
        response.end(body)
      })
      await listen(server)
      servers.push(server)

      const scoped = await startProxy(
        store,
        `http://127.0.0.1:${portOf(server)}`,
      )
      const result = await callProxy(scoped, { path: "/v1beta/interactions" })
      expect(result.status).toBe(status)
      expect(result.body.toString()).toBe(body)
      expect(seen).toBe(1)
    }
  })

  test("returns a redirect to the caller instead of following it", async () => {
    const upstream = await startUpstream((_request, response) => {
      response.writeHead(302, { location: "/v1beta/interactions/elsewhere" })
      response.end()
    })
    const store = await credentialStore()
    const port = await startProxy(store, upstream.origin)

    const result = await callProxy(port, { path: "/v1beta/interactions" })
    expect(result.status).toBe(302)
    expect(result.headers.location).toBe("/v1beta/interactions/elsewhere")
    expect(upstream.requests).toHaveLength(1)
  })

  test("drops hop-by-hop response headers and keeps end-to-end ones", async () => {
    const upstream = await startUpstream((_request, response) => {
      response.writeHead(200, {
        connection: "x-conn-named",
        "proxy-authenticate": "Basic realm=antigravity",
        te: "trailers",
        "x-conn-named": "1",
        "x-request-id": "upstream-1",
      })
      response.end("ok")
    })
    const store = await credentialStore()
    const port = await startProxy(store, upstream.origin)

    const result = await callProxy(port, { path: "/v1beta/interactions" })
    expect(result.status).toBe(200)
    expect(result.headers["x-request-id"]).toBe("upstream-1")
    expect(result.headers["proxy-authenticate"]).toBeUndefined()
    expect(result.headers.te).toBeUndefined()
    expect(result.headers["x-conn-named"]).toBeUndefined()
  })

  test("forwards an upstream Content-Encoding without decompressing it", async () => {
    const gzipped = Buffer.from([
      0x1f, 0x8b, 0x08, 0x00, 0x01, 0x02, 0x03, 0x04,
    ])
    const upstream = await startUpstream((_request, response) => {
      response.writeHead(200, { "content-encoding": "gzip" })
      response.end(gzipped)
    })
    const store = await credentialStore()
    const port = await startProxy(store, upstream.origin)

    const result = await callProxy(port, { path: "/v1beta/interactions" })
    expect(result.headers["content-encoding"]).toBe("gzip")
    expect(result.body.equals(gzipped)).toBe(true)
  })

  test("returns a short local gateway error when the upstream is unreachable", async () => {
    const store = await credentialStore()
    const port = await startProxy(store, `http://127.0.0.1:${await freePort()}`)

    const result = await callProxy(port, { path: "/v1beta/interactions" })
    expect(result.status).toBe(502)
    expect(result.body.toString()).toBe("upstream_unavailable\n")
  })

  test("rejects an absolute-form or authority-form request target", async () => {
    const upstream = await startUpstream(okHandler)
    const store = await credentialStore()
    const port = await startProxy(store, upstream.origin)

    for (const path of [
      "http://evil.example/v1beta/interactions",
      "//evil.example/x",
    ]) {
      const result = await callProxy(port, { path })
      expect(result.status).toBe(400)
      expect(result.body.toString()).toContain("origin-form")
    }

    expect(upstream.requests).toHaveLength(0)
  })

  test("propagates client cancellation to the upstream request", async () => {
    const started = Promise.withResolvers<true>()
    const aborted = Promise.withResolvers<true>()
    const upstream = await startUpstream((request) => {
      started.resolve(true)
      if (request.socket.destroyed) aborted.resolve(true)
      request.socket.on("close", () => {
        aborted.resolve(true)
      })
    })
    const store = await credentialStore()
    const port = await startProxy(store, upstream.origin)

    const client = httpRequest({
      host: "127.0.0.1",
      method: "POST",
      path: "/v1beta/interactions",
      port,
    })
    client.on("error", () => {
      // The abort below is deliberate; a socket error is expected.
    })
    client.end()

    await started.promise
    client.destroy()

    const propagated = await Promise.race([
      aborted.promise.then(() => true),
      delay(2000).then(() => false),
    ])
    expect(propagated).toBe(true)
  })
})
