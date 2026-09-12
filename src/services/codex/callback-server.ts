import { createServer } from "node:http"

import { CODEX_OAUTH } from "./oauth"

export interface WaitForAuthorizationCodeOptions {
  expectedState: string
  onListening?: (redirectUri: string) => Promise<void> | void
  path?: string
  port?: number
  timeoutMs?: number
}

export class CodexCallbackError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CodexCallbackError"
  }
}

/**
 * Waits for exactly one valid OAuth callback on the loopback interface.
 *
 * Requests with invalid state cannot cancel a legitimate in-flight login.
 */
export async function waitForAuthorizationCode(
  options: WaitForAuthorizationCodeOptions,
): Promise<string> {
  const callbackPath = options.path ?? CODEX_OAUTH.callbackPath
  const port = options.port ?? CODEX_OAUTH.defaultCallbackPort
  const timeoutMs = options.timeoutMs ?? 300_000
  const host = "127.0.0.1"

  return await new Promise<string>((resolve, reject) => {
    let settled = false

    const server = createServer((request, response) => {
      const url = new URL(request.url ?? "/", `http://${host}:${port}`)

      if (request.method !== "GET" || url.pathname !== callbackPath) {
        respond(response, 404, "Not found")
        return
      }

      if (
        url.searchParams.getAll("state").length !== 1
        || url.searchParams.get("state") !== options.expectedState
      ) {
        respond(response, 400, "State mismatch")
        return
      }

      const authorizationError = url.searchParams.get("error")
      if (authorizationError !== null) {
        respond(response, 400, "Authorization was rejected")
        finish(new CodexCallbackError("Codex authorization was rejected"))
        return
      }

      const code = url.searchParams.get("code")
      if (
        code === null
        || code.length === 0
        || url.searchParams.getAll("code").length !== 1
      ) {
        respond(response, 400, "Missing authorization code")
        return
      }

      respond(response, 200, "Codex login complete. You can close this window.")
      finish(undefined, code)
    })

    const finish = (error?: Error, code?: string): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      server.close()
      if (error === undefined && code !== undefined) resolve(code)
      else
        reject(
          error ?? new CodexCallbackError("Codex login ended unexpectedly"),
        )
    }

    const timer = setTimeout(() => {
      finish(
        new CodexCallbackError(
          `Timed out after ${timeoutMs} ms waiting for the Codex login callback`,
        ),
      )
    }, timeoutMs)
    timer.unref()

    server.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE") {
        finish(
          new CodexCallbackError(
            `Cannot start the Codex login callback on port ${port}: the port is already in use`,
          ),
        )
        return
      }
      finish(error)
    })

    server.listen({ host, port }, () => {
      const address = server.address()
      const actualPort =
        typeof address === "object" && address !== null ? address.port : port
      const redirectUri = `http://localhost:${actualPort}${callbackPath}`
      Promise.resolve()
        .then(() => options.onListening?.(redirectUri))
        .catch((error: unknown) => {
          finish(
            error instanceof Error ? error : (
              new CodexCallbackError(String(error))
            ),
          )
        })
    })
  })
}

function respond(
  response: import("node:http").ServerResponse,
  status: number,
  body: string,
): void {
  response.writeHead(status, { "content-type": "text/plain; charset=utf-8" })
  response.end(`${body}\n`)
}
