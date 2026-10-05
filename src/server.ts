import { Hono } from "hono"
import { cors } from "hono/cors"

import { requestDumpMiddleware } from "./lib/request-dump"
import { recordIncomingRequest } from "./lib/request-log"
import { completionRoutes } from "./routes/chat-completions/route"
import { embeddingRoutes } from "./routes/embeddings/route"
import { messageRoutes } from "./routes/messages/route"
import { modelRoutes } from "./routes/models/route"
import { responseRoutes } from "./routes/responses/route"
import { tokenRoute } from "./routes/token/route"
import { usageRoute } from "./routes/usage/route"

export const server = new Hono()

server.use(requestDumpMiddleware)
server.use(cors())

const readBodyForLog = async (
  request: Request,
): Promise<string | undefined> => {
  if (request.body === null) return undefined
  try {
    return await request.clone().text()
  } catch {
    // A body the runtime refuses to clone stays unlogged; the request itself
    // must still reach its route unchanged.
    return undefined
  }
}

/**
 * Records every request the gateway receives before any route can reject it,
 * so a client that never reaches a handler is still visible in the log.
 */
server.use(async (c, next) => {
  recordIncomingRequest({
    bodyText: await readBodyForLog(c.req.raw),
    method: c.req.method,
    path: c.req.path,
  })
  await next()
})

server.get("/", (c) => c.text("Server running"))

server.route("/chat/completions", completionRoutes)
server.route("/models", modelRoutes)
server.route("/embeddings", embeddingRoutes)
server.route("/responses", responseRoutes)
server.route("/usage", usageRoute)
server.route("/token", tokenRoute)

// Compatibility with tools that expect v1/ prefix
server.route("/v1/chat/completions", completionRoutes)
server.route("/v1/models", modelRoutes)
server.route("/v1/embeddings", embeddingRoutes)
server.route("/v1/responses", responseRoutes)

// Anthropic compatible endpoints
server.route("/v1/messages", messageRoutes)
