/**
 * P0 probe: can a srvx/Bun gateway relay an incoming WebSocket to an upstream
 * WebSocket, preserving frames, ordering and close semantics?
 *
 * Run with: bun run ./scripts/codex-probes/ws-relay.ts
 *
 * This is the transport a Codex WebSocket passthrough would need. The probe is
 * loopback-only.
 */

import type { ServerWebSocket } from "bun"

import { serve } from "srvx"

import { bunOptions, type BunRuntimeContext } from "./bun-runtime"

const upstreamServer = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch(request, server) {
    const url = new URL(request.url)
    if (url.pathname !== "/ws")
      return new Response("not found", { status: 404 })
    return server.upgrade(request) ? undefined : (
        new Response("upgrade failed", { status: 400 })
      )
  },
  websocket: {
    message(socket, message) {
      socket.send(`up:${String(message)}`)
    },
    open(socket) {
      socket.send("upstream-hello")
    },
  },
})

const upstreamWsUrl = upstreamServer.url.href.replace(/^http/, "ws") + "ws"

const downstreamToUpstream = new Map<ServerWebSocket<unknown>, WebSocket>()
const bufferedBeforeUpstream = new Map<
  ServerWebSocket<unknown>,
  Array<string>
>()
const relayState = {
  downstreamClosed: 0,
  upstreamClosed: 0,
}

const gateway = serve({
  hostname: "127.0.0.1",
  port: 0,
  ...bunOptions({
    close(socket: ServerWebSocket) {
      relayState.downstreamClosed += 1
      const upstream = downstreamToUpstream.get(socket)
      downstreamToUpstream.delete(socket)
      bufferedBeforeUpstream.delete(socket)
      upstream?.close()
    },
    message(socket: ServerWebSocket, message: string | Buffer) {
      const upstream = downstreamToUpstream.get(socket)
      if (upstream === undefined) {
        bufferedBeforeUpstream.get(socket)?.push(String(message))
        return
      }
      upstream.send(String(message))
    },
    open(socket: ServerWebSocket) {
      const upstream = new WebSocket(upstreamWsUrl)
      downstreamToUpstream.set(socket, upstream)
      upstream.addEventListener("close", () => {
        relayState.upstreamClosed += 1
        socket.close()
      })
      upstream.addEventListener("error", () => {
        socket.close()
      })
      upstream.addEventListener("message", (event) => {
        socket.send(String(event.data))
      })
      upstream.addEventListener("open", () => {
        const buffered = bufferedBeforeUpstream.get(socket) ?? []
        bufferedBeforeUpstream.delete(socket)
        for (const item of buffered) upstream.send(item)
      })
    },
  }),
  fetch(request: Request) {
    const url = new URL(request.url)
    if (url.pathname !== "/ws") return new Response("ok")
    const runtime = (request as Request & { runtime?: BunRuntimeContext })
      .runtime
    const server = runtime?.bun?.server
    if (server === undefined) return new Response("no server", { status: 500 })
    const accepted = server.upgrade(request)
    if (!accepted) return new Response("upgrade failed", { status: 400 })
    return undefined as unknown as Response
  },
})

const gatewayUrl = gateway.url
if (gatewayUrl === undefined)
  throw new Error("probe server did not report a URL")

const results: Record<string, unknown> = {}

const outcome = await new Promise<string>((resolve) => {
  const socket = new WebSocket(gatewayUrl.replace(/^http/, "ws") + "ws")
  const seen: Array<string> = []
  const timeout = setTimeout(() => {
    socket.close()
    resolve("timeout")
  }, 5000)

  socket.addEventListener("message", (event) => {
    const payload = String(event.data)
    seen.push(payload)
    if (payload === "upstream-hello") {
      socket.send("first")
      return
    }
    if (payload === "up:first") {
      socket.send("second-多字节")
      return
    }
    if (payload.startsWith("up:second-")) {
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

await new Promise((resolve) => setTimeout(resolve, 400))

results.outcome = outcome
results.relayState = relayState

console.log(JSON.stringify(results, null, 2))

await gateway.close(true)
await upstreamServer.stop(true)
