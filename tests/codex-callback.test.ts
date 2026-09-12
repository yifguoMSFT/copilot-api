import type { AddressInfo } from "node:net"

import { describe, expect, test } from "bun:test"
import { createServer, type Server } from "node:http"

import { waitForAuthorizationCode } from "../src/services/codex/callback-server"
import { rejection } from "./support/async-errors"

const listen = async (server: Server, port: number): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen({ host: "127.0.0.1", port }, () => {
      server.off("error", reject)
      resolve()
    })
  })
}

const close = async (server: Server): Promise<void> => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
}

const getFreePort = async (): Promise<number> => {
  const server = createServer()
  await listen(server, 0)
  const { port } = server.address() as AddressInfo
  await close(server)
  return port
}

const callbackUrl = (port: number, query: string): string =>
  `http://127.0.0.1:${port}/auth/callback?${query}`

describe("Codex OAuth callback server", () => {
  test("resolves with the code once the state matches", async () => {
    const port = await getFreePort()
    const listening = Promise.withResolvers<string>()

    const codePromise = waitForAuthorizationCode({
      expectedState: "state-1",
      onListening: (redirectUri) => {
        listening.resolve(redirectUri)
      },
      port,
      timeoutMs: 5000,
    })

    expect(await listening.promise).toBe(
      `http://localhost:${port}/auth/callback`,
    )

    const response = await fetch(
      callbackUrl(port, "code=the-code&state=state-1"),
    )
    expect(response.status).toBe(200)
    expect(await response.text()).not.toContain("the-code")
    expect(await codePromise).toBe("the-code")
  })

  test("ignores a state mismatch and still accepts the legitimate callback", async () => {
    const port = await getFreePort()
    const listening = Promise.withResolvers<string>()
    const codePromise = waitForAuthorizationCode({
      expectedState: "state-1",
      onListening: () => {
        listening.resolve("ready")
      },
      port,
      timeoutMs: 5000,
    })
    await listening.promise

    const hostile = await fetch(
      callbackUrl(port, "code=attacker-code&state=state-2"),
    )
    expect(hostile.status).toBe(400)

    const legitimate = await fetch(
      callbackUrl(port, "code=the-code&state=state-1"),
    )
    expect(legitimate.status).toBe(200)
    expect(await codePromise).toBe("the-code")
  })

  test("answers other paths and requests without a code but keeps waiting", async () => {
    const port = await getFreePort()
    const listening = Promise.withResolvers<string>()
    const codePromise = waitForAuthorizationCode({
      expectedState: "state-1",
      onListening: () => {
        listening.resolve("ready")
      },
      port,
      timeoutMs: 5000,
    })
    await listening.promise

    const wrongPath = await fetch(`http://127.0.0.1:${port}/other`)
    expect(wrongPath.status).toBe(404)

    const noCode = await fetch(callbackUrl(port, "state=state-1"))
    expect(noCode.status).toBe(400)

    await fetch(callbackUrl(port, "code=the-code&state=state-1"))
    expect(await codePromise).toBe("the-code")
  })

  test("fails fast when the authorization server reports an error", async () => {
    const port = await getFreePort()
    const listening = Promise.withResolvers<string>()
    const codePromise = waitForAuthorizationCode({
      expectedState: "state-1",
      onListening: () => {
        listening.resolve("ready")
      },
      port,
      timeoutMs: 5000,
    })
    await listening.promise

    // Attach the handler before triggering the request so the rejection is never
    // reported as unhandled.
    const settled = codePromise.catch((error: unknown) => error)
    await fetch(
      callbackUrl(
        port,
        "error=access_denied&state=state-1&error_description=user+cancelled",
      ),
    )

    const error = await settled
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toContain("authorization was rejected")
  })

  test("times out and releases the port when nothing arrives", async () => {
    const port = await getFreePort()
    const listening = Promise.withResolvers<string>()
    const codePromise = waitForAuthorizationCode({
      expectedState: "state-1",
      onListening: () => {
        listening.resolve("ready")
      },
      port,
      timeoutMs: 60,
    })
    await listening.promise

    expect((await rejection(codePromise)).message).toContain("Timed out")

    // The port must be free again, otherwise the next login attempt would fail.
    const probe = createServer()
    await listen(probe, port)
    await close(probe)
  })

  test("reports a port conflict with a clear message", async () => {
    const port = await getFreePort()
    const blocker = createServer()
    await listen(blocker, port)

    try {
      const error = await rejection(
        waitForAuthorizationCode({
          expectedState: "state-1",
          port,
          timeoutMs: 5000,
        }),
      )
      expect(error.message).toContain("already in use")
    } finally {
      await close(blocker)
    }
  })
})
