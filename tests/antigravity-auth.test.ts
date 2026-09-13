import { afterAll, describe, expect, test } from "bun:test"
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { createServer } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"

import {
  ANTIGRAVITY_OAUTH,
  type AntigravityCredential,
  AntigravityCredentialStore,
  type AntigravityFetch,
  readCredentialFile,
  runAntigravityLogin,
} from "../src/services/antigravity/auth"
import { rejection } from "./support/async-errors"

const directories: Array<string> = []

afterAll(async () => {
  for (const directory of directories)
    await rm(directory, { force: true, recursive: true })
})

async function temporaryCredentialPath(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "antigravity-auth-"))
  directories.push(directory)
  return join(directory, "antigravity-test.json")
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  })
}

/** A credential file shaped exactly like the one CLIProxyAPI writes. */
function cliProxyCredential(overrides: Record<string, unknown> = {}) {
  return {
    access_token: "access-token-value",
    disabled: false,
    email: "user@example.com",
    expired: new Date(Date.now() + 3_600_000).toISOString(),
    expires_in: 3599,
    project_id: "project-from-cliproxy",
    refresh_token: "refresh-token-value",
    timestamp: Date.now(),
    type: "antigravity",
    ...overrides,
  }
}

/** Picks a currently free loopback port so login tests never collide. */
async function freePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve())
  })
  const address = server.address()
  const port =
    typeof address === "object" && address !== null ? address.port : 0
  await new Promise<void>((resolve) => {
    server.close(() => resolve())
  })
  return port
}

/** Starts a login and returns the authorization URL the flow advertised. */
async function startLogin(
  credentialPath: string,
  fetchImpl: AntigravityFetch,
  overrides: { port: number; timeoutMs?: number },
) {
  const advertised = Promise.withResolvers<string>()
  const login = runAntigravityLogin({
    credentialPath,
    fetchImpl,
    onAuthorizationUrl: (url) => advertised.resolve(url),
    port: overrides.port,
    ...(overrides.timeoutMs === undefined ?
      {}
    : { timeoutMs: overrides.timeoutMs }),
  })
  // Tests assert rejections through `rejection(login)`, which may attach after
  // another await. Mark the promise handled so Bun does not report it first.
  login.catch(() => {})
  const url = await advertised.promise
  const state = new URL(url).searchParams.get("state")
  if (state === null) throw new Error("authorization URL carried no state")
  return { login, state }
}

function callbackUrl(port: number, params: Record<string, string>): string {
  const url = new URL(
    `http://127.0.0.1:${port}${ANTIGRAVITY_OAUTH.callbackPath}`,
  )
  for (const [key, value] of Object.entries(params))
    url.searchParams.set(key, value)
  return url.href
}

/** Serves the three upstream calls a successful login makes. */
function loginUpstream(): AntigravityFetch {
  return (url) => {
    const parsed = new URL(url)
    if (parsed.href === ANTIGRAVITY_OAUTH.tokenEndpoint)
      return Promise.resolve(
        jsonResponse({
          access_token: "fresh-access-token",
          expires_in: 3600,
          refresh_token: "fresh-refresh-token",
        }),
      )
    if (parsed.href === ANTIGRAVITY_OAUTH.userInfoEndpoint)
      return Promise.resolve(jsonResponse({ email: "user@example.com" }))
    if (parsed.pathname.endsWith(":loadCodeAssist"))
      return Promise.resolve(
        jsonResponse({ cloudaicompanionProject: "project-abc" }),
      )
    return Promise.reject(new Error(`unexpected upstream request: ${url}`))
  }
}

describe("credential file", () => {
  test("parses a CLIProxyAPI-shaped file and preserves its extra fields", async () => {
    const path = await temporaryCredentialPath()
    await writeFile(path, JSON.stringify(cliProxyCredential()), "utf8")

    const credential = await readCredentialFile(path)

    expect(credential.access_token).toBe("access-token-value")
    expect(credential.refresh_token).toBe("refresh-token-value")
    expect(credential.project_id).toBe("project-from-cliproxy")
    expect(credential.email).toBe("user@example.com")
    expect(credential.type).toBe("antigravity")
    expect(credential.disabled).toBe(false)
  })

  test("rejects an unparsable expired value", async () => {
    const path = await temporaryCredentialPath()
    await writeFile(
      path,
      JSON.stringify(cliProxyCredential({ expired: "not-a-timestamp" })),
      "utf8",
    )

    const error = await rejection(readCredentialFile(path))

    expect(error.message).toContain("not an RFC3339 timestamp")
  })

  test("rejects an expired credential with no refresh token", async () => {
    const path = await temporaryCredentialPath()
    await writeFile(
      path,
      JSON.stringify(
        cliProxyCredential({
          expired: new Date(Date.now() - 1000).toISOString(),
          refresh_token: undefined,
        }),
      ),
      "utf8",
    )

    const error = await rejection(readCredentialFile(path))

    expect(error.message).toContain("no refresh_token is available")
  })

  test("rejects a blank access token", async () => {
    const path = await temporaryCredentialPath()
    await writeFile(
      path,
      JSON.stringify(cliProxyCredential({ access_token: "   " })),
      "utf8",
    )

    const error = await rejection(readCredentialFile(path))

    expect(error.message).toContain("empty access_token")
  })
})

describe("AntigravityCredentialStore", () => {
  test("refreshes a stale credential atomically", async () => {
    const path = await temporaryCredentialPath()
    await writeFile(
      path,
      JSON.stringify({
        ...cliProxyCredential(),
        expired: new Date(Date.now() + 60_000).toISOString(),
      }),
      "utf8",
    )
    let tokenRequests = 0
    const fetchImpl: AntigravityFetch = (url) => {
      if (url !== ANTIGRAVITY_OAUTH.tokenEndpoint)
        return Promise.reject(new Error(`unexpected upstream request: ${url}`))
      tokenRequests += 1
      return Promise.resolve(
        jsonResponse({
          access_token: "refreshed-access-token",
          expires_in: 3600,
        }),
      )
    }

    const credential = await new AntigravityCredentialStore(path, {
      fetchImpl,
    }).current()

    expect(tokenRequests).toBe(1)
    expect(credential.access_token).toBe("refreshed-access-token")
    // The response omitted refresh_token, so the previous one must survive.
    expect(credential.refresh_token).toBe("refresh-token-value")
    expect(credential.project_id).toBe("project-from-cliproxy")

    const entries = await readdir(join(path, ".."))
    expect(entries.filter((entry) => entry.endsWith(".tmp"))).toEqual([])
    const onDisk = JSON.parse(
      await readFile(path, "utf8"),
    ) as AntigravityCredential
    expect(onDisk.access_token).toBe("refreshed-access-token")
    expect(onDisk.project_id).toBe("project-from-cliproxy")
  })

  test("leaves a fresh credential alone", async () => {
    const path = await temporaryCredentialPath()
    await writeFile(path, JSON.stringify(cliProxyCredential()), "utf8")
    let tokenRequests = 0
    const fetchImpl: AntigravityFetch = () => {
      tokenRequests += 1
      return Promise.resolve(jsonResponse({}))
    }

    const credential = await new AntigravityCredentialStore(path, {
      fetchImpl,
    }).current()

    expect(tokenRequests).toBe(0)
    expect(credential.access_token).toBe("access-token-value")
  })

  test("collapses concurrent refreshes into one request", async () => {
    const path = await temporaryCredentialPath()
    await writeFile(
      path,
      JSON.stringify({
        ...cliProxyCredential(),
        expired: new Date(Date.now() + 1000).toISOString(),
      }),
      "utf8",
    )
    let tokenRequests = 0
    const fetchImpl: AntigravityFetch = async () => {
      tokenRequests += 1
      await new Promise((resolve) => setTimeout(resolve, 20))
      return jsonResponse({
        access_token: "refreshed-access-token",
        expires_in: 3600,
        refresh_token: "rotated-refresh-token",
      })
    }
    const store = new AntigravityCredentialStore(path, { fetchImpl })

    const [first, second] = await Promise.all([
      store.current(),
      store.current(),
    ])

    expect(tokenRequests).toBe(1)
    expect(first.access_token).toBe("refreshed-access-token")
    expect(second.refresh_token).toBe("rotated-refresh-token")
  })
})

describe("runAntigravityLogin", () => {
  test("completes the browser flow and writes the credential", async () => {
    const path = await temporaryCredentialPath()
    const port = await freePort()
    const { login, state } = await startLogin(path, loginUpstream(), { port })

    const callback = await fetch(
      callbackUrl(port, { code: "authorization-code", state }),
    )

    expect(callback.status).toBe(200)
    const credential = await login
    expect(credential.access_token).toBe("fresh-access-token")
    expect(credential.refresh_token).toBe("fresh-refresh-token")
    expect(credential.project_id).toBe("project-abc")
    expect(credential.email).toBe("user@example.com")
    expect(credential.expired).toBeString()

    const onDisk = JSON.parse(
      await readFile(path, "utf8"),
    ) as AntigravityCredential
    expect(onDisk.access_token).toBe("fresh-access-token")
  })

  test("ignores a mismatched state instead of cancelling the login", async () => {
    const path = await temporaryCredentialPath()
    const port = await freePort()
    const { login, state } = await startLogin(path, loginUpstream(), { port })

    const wrong = await fetch(
      callbackUrl(port, { code: "attacker-code", state: "not-the-state" }),
    )
    expect(wrong.status).toBe(400)
    expect(await wrong.text()).toContain("State mismatch")

    const right = await fetch(
      callbackUrl(port, { code: "authorization-code", state }),
    )
    expect(right.status).toBe(200)
    expect((await login).access_token).toBe("fresh-access-token")
  })

  test("fails when the callback carries an authorization error", async () => {
    const path = await temporaryCredentialPath()
    const port = await freePort()
    const { login, state } = await startLogin(path, loginUpstream(), { port })

    const callback = await fetch(
      callbackUrl(port, { error: "access_denied", state }),
    )

    expect(callback.status).toBe(400)
    expect((await rejection(login)).message).toContain(
      "Antigravity authorization was rejected",
    )
  })

  test("rejects a callback without a code and keeps waiting", async () => {
    const path = await temporaryCredentialPath()
    const port = await freePort()
    const { login, state } = await startLogin(path, loginUpstream(), { port })

    const withoutCode = await fetch(callbackUrl(port, { state }))
    expect(withoutCode.status).toBe(400)
    expect(await withoutCode.text()).toContain("Missing authorization code")

    const withCode = await fetch(
      callbackUrl(port, { code: "authorization-code", state }),
    )
    expect(withCode.status).toBe(200)
    expect((await login).access_token).toBe("fresh-access-token")
  })

  test("times out when no callback arrives", async () => {
    const path = await temporaryCredentialPath()
    const port = await freePort()
    const { login } = await startLogin(path, loginUpstream(), {
      port,
      timeoutMs: 150,
    })

    const error = await rejection(login)

    expect(error.message).toContain("Timed out after 150 ms")
  })
})
