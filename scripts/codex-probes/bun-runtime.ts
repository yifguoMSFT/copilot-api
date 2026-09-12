import type { ServerWebSocket } from "bun"
import type { serve } from "srvx"

/**
 * srvx forwards `options.bun` straight into `Bun.serve`, but its published type
 * only declares the `Omit<ServeOptions, "fetch">` shape and drops `websocket`.
 * This helper narrows the cast to the single option the probes need.
 */
export interface BunWebSocketHandlers {
  close?: (socket: ServerWebSocket) => void
  message?: (socket: ServerWebSocket, message: string | Buffer) => void
  open?: (socket: ServerWebSocket) => void
}

export interface BunRuntimeContext {
  bun?: {
    server: {
      upgrade: (request: Request, options?: { data?: unknown }) => boolean
    }
  }
}

type ServeOptions = Parameters<typeof serve>[0]

export function bunOptions(websocket: BunWebSocketHandlers): {
  bun: ServeOptions["bun"]
} {
  return { bun: { websocket } } as unknown as { bun: ServeOptions["bun"] }
}
