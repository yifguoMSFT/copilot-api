/**
 * P0 probe: measure the transport behaviours the Codex passthrough route depends on.
 *
 * Run with: bun run ./scripts/codex-probes/http-transport.ts
 *
 * The probe never leaves the loopback interface and never talks to a real provider.
 * It answers three questions:
 *   1. Does a srvx/Hono style gateway forward SSE chunks before the upstream finishes?
 *   2. Does aborting the downstream client propagate to the upstream request?
 *   3. How does the Bun fetch stack treat content-encoding and accept-encoding?
 */

import { gzipSync } from "node:zlib"
import { serve } from "srvx"

const encoder = new TextEncoder()

const upstreamState = {
  sseChunksSent: 0,
  sseUpstreamAborted: false,
  sseStreamCancelled: false,
}

const upstream = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  idleTimeout: 30,
  fetch(request) {
    const url = new URL(request.url)

    if (url.pathname === "/sse") {
      request.signal.addEventListener("abort", () => {
        upstreamState.sseUpstreamAborted = true
      })
      const body = new ReadableStream<Uint8Array>({
        async pull(controller) {
          upstreamState.sseChunksSent += 1
          if (upstreamState.sseChunksSent > 400) {
            controller.close()
            return
          }
          controller.enqueue(
            encoder.encode(`data: chunk-${upstreamState.sseChunksSent}\n\n`),
          )
          await new Promise((resolve) => setTimeout(resolve, 25))
        },
        cancel() {
          upstreamState.sseStreamCancelled = true
        },
      })
      return new Response(body, {
        headers: {
          "cache-control": "no-store",
          "content-type": "text/event-stream",
        },
      })
    }

    if (url.pathname === "/gzip") {
      const payload = JSON.stringify({
        hello: "gzip",
        padding: "x".repeat(1024),
      })
      const compressed = gzipSync(Buffer.from(payload))
      return new Response(compressed, {
        headers: {
          "content-encoding": "gzip",
          "content-length": String(compressed.byteLength),
          "content-type": "application/json",
        },
      })
    }

    if (url.pathname === "/echo-headers") {
      return Response.json({ headers: Object.fromEntries(request.headers) })
    }

    return new Response("not found", { status: 404 })
  },
})

const gatewayState = {
  upstreamAborted: false,
}

const gateway = serve({
  hostname: "127.0.0.1",
  port: 0,
  async fetch(request) {
    const url = new URL(request.url)
    const target = new URL(url.pathname, upstream.url)
    request.signal.addEventListener("abort", () => {
      gatewayState.upstreamAborted = true
    })
    const init: RequestInit = {
      headers: new Headers(request.headers),
      method: request.method,
      redirect: "manual",
      signal: request.signal,
    }
    const upstreamResponse = await fetch(target, init)
    return new Response(upstreamResponse.body, {
      headers: upstreamResponse.headers,
      status: upstreamResponse.status,
    })
  },
})

const gatewayUrl = String(gateway.url)
const upstreamUrl = String(upstream.url)

const results: Record<string, unknown> = {}

// 1. First-chunk latency through the gateway.
const sseStartedAt = Date.now()
const sseAbort = new AbortController()
const sseResponse = await fetch(`${gatewayUrl}/sse`, {
  signal: sseAbort.signal,
})
const sseReader = sseResponse.body?.getReader()
if (sseReader === undefined) throw new Error("no SSE body")
const firstChunk = await sseReader.read()
const firstChunkMs = Date.now() - sseStartedAt
results.sseStatus = sseResponse.status
results.sseFirstChunkMs = firstChunkMs
const firstChunkBytes = firstChunk.value as Uint8Array | undefined
results.sseFirstChunkText = new TextDecoder().decode(
  firstChunkBytes ?? new Uint8Array(),
)
results.sseContentType = sseResponse.headers.get("content-type")

// 2. Cancel the downstream request and see whether the upstream observes it.
sseAbort.abort()
await new Promise((resolve) => setTimeout(resolve, 400))
results.afterAbort = {
  gatewaySawSignalAbort: gatewayState.upstreamAborted,
  upstreamSawRequestAbort: upstreamState.sseUpstreamAborted,
  upstreamStreamCancelled: upstreamState.sseStreamCancelled,
  upstreamChunksSent: upstreamState.sseChunksSent,
}

// 3. Compression handling of the Bun fetch stack.
const gzipResponse = await fetch(`${upstreamUrl}/gzip`)
const gzipBytes = new Uint8Array(await gzipResponse.arrayBuffer())
results.gzip = {
  contentEncodingHeader: gzipResponse.headers.get("content-encoding"),
  contentLengthHeader: gzipResponse.headers.get("content-length"),
  reportedBytes: gzipBytes.byteLength,
  startsWithGzipMagic: gzipBytes[0] === 0x1f && gzipBytes[1] === 0x8b,
}

// 4. What the runtime sends upstream by default.
const echoResponse = await fetch(`${upstreamUrl}/echo-headers`)
const echo = (await echoResponse.json()) as { headers: Record<string, string> }
results.defaultRequestHeaders = {
  acceptEncoding: echo.headers["accept-encoding"] ?? null,
}

const explicitEcho = await fetch(`${upstreamUrl}/echo-headers`, {
  headers: { "accept-encoding": "identity" },
})
const explicitEchoBody = (await explicitEcho.json()) as {
  headers: Record<string, string>
}
results.explicitIdentityRequestHeaders = {
  acceptEncoding: explicitEchoBody.headers["accept-encoding"] ?? null,
}

console.log(JSON.stringify(results, null, 2))

await gateway.close(true)
await upstream.stop(true)
