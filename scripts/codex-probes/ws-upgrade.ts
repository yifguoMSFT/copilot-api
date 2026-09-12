/**
 * P0 probe: can a srvx gateway perform a WebSocket upgrade on Bun?
 *
 * Run with: bun run ./scripts/codex-probes/ws-upgrade.ts
 *
 * The probe is loopback-only. It answers:
 *   1. Is `request.runtime.bun.server` reachable from a srvx fetch handler?
 *   2. Does `server.upgrade()` work when the websocket handlers are passed
 *      through `serve({ bun: { websocket } })`?
 *   3. Are frames preserved byte-for-byte and does close propagate?
 */

import type { ServerWebSocket } from "bun"

import { serve } from "srvx"

import { bunOptions, type BunRuntimeContext } from "./bun-runtime"

const receivedByUpstream: Array<string> = []
let upstreamClosed = false
let upgradeAccepted = false
let upgradeRejected = 0

const gateway = serve({
  hostname: "127.0.0.1",
  port: 0,
  ...bunOptions({
    close() {
      upstreamClosed = true
    },
    message(socket: ServerWebSocket, message: string | Buffer) {
      const text = typeof message === "string" ? message : "<binary>"
      receivedByUpstream.push(text)
      socket.send(`echo:${text}`)
    },
    open(socket: ServerWebSocket) {
      socket.send("hello-from-gateway")
    },
  }),
  fetch(request: Request) {
    const url = new URL(request.url)
    if (url.pathname !== "/ws") {
      return new Response("ok", { status: 200 })
    }

    const runtime = (request as Request & { runtime?: BunRuntimeContext })
      .runtime
    const server = runtime?.bun?.server
    if (server === undefined) {
      upgradeRejected += 1
      return new Response("no bun server handle", { status: 500 })
    }

    const accepted = server.upgrade(request)
    upgradeAccepted = accepted
    if (!accepted) {
      upgradeRejected += 1
      return new Response("upgrade failed", { status: 400 })
    }
    // Bun requires the fetch handler to not return a Response once upgraded.
    return undefined as unknown as Response
  },
})

const gatewayUrl = gateway.url
if (gatewayUrl === undefined)
  throw new Error("probe server did not report a URL")

const wsUrl = gatewayUrl.replace(/^http/, "ws") + "ws"

const results: Record<string, unknown> = {}

const outcome = await new Promise<string>((resolve) => {
  const socket = new WebSocket(wsUrl)
  const seen: Array<string> = []
  const timeout = setTimeout(() => {
    socket.close()
    resolve("timeout")
  }, 4000)

  socket.addEventListener("message", (event) => {
    const payload = String(event.data)
    seen.push(payload)
    if (payload === "hello-from-gateway") {
      socket.send("ping-1")
      return
    }
    if (payload === "echo:ping-1") {
      socket.send("多字节 payload")
      return
    }
    if (payload.startsWith("echo:多字节")) {
      clearTimeout(timeout)
      results.framesSeenByClient = seen
      socket.close()
      resolve("ok")
    }
  })
  socket.addEventListener("error", () => {
    clearTimeout(timeout)
    resolve("error")
  })
})

await new Promise((resolve) => setTimeout(resolve, 300))

results.upgradeAccepted = upgradeAccepted
results.upgradeRejected = upgradeRejected
results.outcome = outcome
results.framesSeenByUpstream = receivedByUpstream
results.upstreamClosed = upstreamClosed

console.log(JSON.stringify(results, null, 2))

await gateway.close(true)
