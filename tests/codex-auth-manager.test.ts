import { afterEach, describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import {
  createCodexCredentialStore,
  type CodexCredential,
} from "../src/lib/codex-credentials"
import { CodexProfileLockError } from "../src/lib/codex-profile-lock"
import {
  CodexAuthRequiredError,
  CodexAuthUnavailableError,
  createCodexAuthManager,
} from "../src/services/codex/auth-manager"
import { CodexOAuthError } from "../src/services/codex/oauth"
import { rejection } from "./support/async-errors"

const NOW = 1_700_000_000_000
const STORE_MODULE_URL = new URL(
  "../src/lib/codex-credentials.ts",
  import.meta.url,
).href

const temporaryDirectories: Array<string> = []

const createStore = async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "codex-auth-manager-"),
  )
  temporaryDirectories.push(directory)
  return createCodexCredentialStore({ directory })
}

/** Expires inside the 60s refresh window, so the default credential needs a refresh. */
const credential = (
  overrides: Partial<CodexCredential> = {},
): CodexCredential => ({
  accessToken: "expiring-access-token",
  accountId: "account-1",
  email: "user@example.com",
  expiresAt: NOW + 30_000,
  refreshToken: "refresh-token",
  revision: 1,
  updatedAt: NOW - 3_600_000,
  version: 1,
  ...overrides,
})

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => fs.rm(directory, { force: true, recursive: true })),
  )
})

describe("Codex auth manager refresh scheduling", () => {
  test("refreshes once for 20 concurrent requests and returns one revision", async () => {
    const store = await createStore()
    await store.write("default", credential())

    const gate = Promise.withResolvers<undefined>()
    let calls = 0
    const manager = createCodexAuthManager({
      now: () => NOW,
      refresh: async () => {
        calls += 1
        await gate.promise
        return {
          accessToken: "refreshed-access-token",
          expiresInSeconds: 900,
          refreshToken: "rotated-refresh-token",
        }
      },
      store,
    })

    const pending = Array.from({ length: 20 }, async () =>
      manager.getSnapshot("default"),
    )
    // Let every caller reach the refresh path before the request can complete.
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(calls).toBe(1)

    gate.resolve(undefined)
    const snapshots = await Promise.all(pending)

    expect(calls).toBe(1)
    for (const snapshot of snapshots) {
      expect(snapshot).toEqual({
        accessToken: "refreshed-access-token",
        accountId: "account-1",
        email: "user@example.com",
        expiresAt: NOW + 900_000,
        revision: 2,
      })
    }
  })

  test("does not spend the grant while the token is outside the refresh window", async () => {
    const store = await createStore()
    await store.write(
      "default",
      credential({ expiresAt: NOW + 60_001, accessToken: "still-good" }),
    )

    const manager = createCodexAuthManager({
      now: () => NOW,
      refresh: () => {
        throw new Error("refresh must not be called")
      },
      store,
    })

    expect(await manager.getSnapshot("default")).toEqual({
      accessToken: "still-good",
      accountId: "account-1",
      email: "user@example.com",
      expiresAt: NOW + 60_001,
      revision: 1,
    })
  })

  test("treats the window boundary as needing a refresh", async () => {
    const store = await createStore()
    await store.write("default", credential({ expiresAt: NOW + 60_000 }))

    let calls = 0
    const manager = createCodexAuthManager({
      now: () => NOW,
      refresh: () => {
        calls += 1
        return Promise.resolve({
          accessToken: "boundary",
          expiresInSeconds: 900,
        })
      },
      store,
    })

    await manager.getSnapshot("default")
    expect(calls).toBe(1)
  })

  test("fails with an actionable error when nothing is stored", async () => {
    const store = await createStore()
    const manager = createCodexAuthManager({ now: () => NOW, store })

    expect(await rejection(manager.getSnapshot("default"))).toBeInstanceOf(
      CodexAuthRequiredError,
    )
    expect((await rejection(manager.getSnapshot("default"))).message).toContain(
      "codex-auth login",
    )
  })
})

describe("Codex auth manager rotation and failures", () => {
  test("persists the rotated refresh token and the refreshed lifetime", async () => {
    const store = await createStore()
    await store.write("default", credential())

    const manager = createCodexAuthManager({
      now: () => NOW,
      refresh: () =>
        Promise.resolve({
          accessToken: "rotated-access-token",
          expiresInSeconds: 900,
          refreshToken: "rotated-refresh-token",
        }),
      store,
    })

    await manager.getSnapshot("default")

    const stored = await store.read("default")
    expect(stored).toEqual({
      accessToken: "rotated-access-token",
      accountId: "account-1",
      email: "user@example.com",
      expiresAt: NOW + 900_000,
      refreshToken: "rotated-refresh-token",
      revision: 2,
      updatedAt: NOW,
      version: 1,
    })
  })

  test("keeps the previous refresh token when the response omits one", async () => {
    const store = await createStore()
    await store.write("default", credential())

    const manager = createCodexAuthManager({
      now: () => NOW,
      refresh: () =>
        Promise.resolve({
          accessToken: "next-access-token",
          expiresInSeconds: 900,
          refreshToken: "",
        }),
      store,
    })

    await manager.getSnapshot("default")

    const stored = await store.read("default")
    expect(stored?.refreshToken).toBe("refresh-token")
    expect(stored?.accessToken).toBe("next-access-token")
  })

  test("keeps the previous identity unless the refresh response replaces it", async () => {
    const store = await createStore()
    await store.write("default", credential())

    const withoutIdentity = createCodexAuthManager({
      now: () => NOW,
      refresh: () =>
        Promise.resolve({
          accessToken: "no-identity",
          expiresInSeconds: 900,
        }),
      store,
    })

    await withoutIdentity.getSnapshot("default")
    expect((await store.read("default"))?.accountId).toBe("account-1")

    await store.write("default", credential({ accountId: "account-1" }))
    const withIdentity = createCodexAuthManager({
      now: () => NOW,
      refresh: () =>
        Promise.resolve({
          accessToken: "with-identity",
          expiresInSeconds: 900,
          idToken: idTokenWith({
            "https://api.openai.com/auth": { chatgpt_account_id: "account-2" },
          }),
        }),
      store,
    })

    await withIdentity.getSnapshot("default")
    const stored = await store.read("default")
    expect(stored?.accountId).toBe("account-2")
    expect(stored?.email).toBe("user@example.com")
  })

  test("keeps the stored credential and retries after a network failure", async () => {
    const store = await createStore()
    const original = credential()
    await store.write("default", original)

    let calls = 0
    const manager = createCodexAuthManager({
      now: () => NOW,
      refresh: () => {
        calls += 1
        if (calls === 1) return Promise.reject(new TypeError("fetch failed"))
        return Promise.resolve({
          accessToken: "second-attempt",
          expiresInSeconds: 900,
        })
      },
      store,
    })

    expect(await rejection(manager.getSnapshot("default"))).toBeInstanceOf(
      CodexAuthUnavailableError,
    )
    expect(await store.read("default")).toEqual(original)

    // A transient failure must not latch the profile into "needs login".
    expect((await manager.getSnapshot("default")).accessToken).toBe(
      "second-attempt",
    )
    expect(calls).toBe(2)
  })

  test("classifies a server error as temporarily unavailable", async () => {
    const store = await createStore()
    await store.write("default", credential())

    const manager = createCodexAuthManager({
      now: () => NOW,
      refresh: () =>
        Promise.reject(
          new CodexOAuthError("token endpoint failed", 503, "server_error"),
        ),
      store,
    })

    expect(await rejection(manager.getSnapshot("default"))).toBeInstanceOf(
      CodexAuthUnavailableError,
    )
  })

  test("asks for a new login when the grant was rejected, without retrying", async () => {
    const store = await createStore()
    const original = credential()
    await store.write("default", original)

    let calls = 0
    const manager = createCodexAuthManager({
      now: () => NOW,
      refresh: () => {
        calls += 1
        return Promise.reject(
          new CodexOAuthError("rejected", 400, "invalid_grant"),
        )
      },
      store,
    })

    expect(await rejection(manager.getSnapshot("default"))).toBeInstanceOf(
      CodexAuthRequiredError,
    )
    // The credential stays on disk so status can still describe it...
    expect(await store.read("default")).toEqual(original)
    // ...but a repeated request fails fast instead of re-spending the grant.
    expect(await rejection(manager.getSnapshot("default"))).toBeInstanceOf(
      CodexAuthRequiredError,
    )
    expect(calls).toBe(1)

    // A fresh login produces a different credential and clears the marker.
    await store.write(
      "default",
      credential({ accessToken: "re-login", expiresAt: NOW + 3_600_000 }),
    )
    expect((await manager.getSnapshot("default")).accessToken).toBe("re-login")
    expect(calls).toBe(1)
  })
})

describe("Codex auth manager consistency with the CLI", () => {
  test("does not overwrite a credential that changed while refreshing", async () => {
    const store = await createStore()
    await store.write("default", credential())

    const gate = Promise.withResolvers<undefined>()
    const manager = createCodexAuthManager({
      now: () => NOW,
      refresh: async () => {
        await gate.promise
        return { accessToken: "from-refresh", expiresInSeconds: 900 }
      },
      store,
    })

    const pending = manager.getSnapshot("default")
    await new Promise((resolve) => setTimeout(resolve, 20))

    // Stands in for `codex-auth login` running in another process.
    const loggedIn = credential({
      accessToken: "from-cli-login",
      expiresAt: NOW + 3_600_000,
      revision: 1,
      updatedAt: NOW,
    })
    await store.withLock("default", async () => {
      await store.write("default", loggedIn)
    })

    gate.resolve(undefined)
    expect((await pending).accessToken).toBe("from-cli-login")
    expect(await store.read("default")).toEqual(loggedIn)
  })

  test("does not resurrect credentials removed while refreshing", async () => {
    const store = await createStore()
    await store.write("default", credential())

    const gate = Promise.withResolvers<undefined>()
    const manager = createCodexAuthManager({
      now: () => NOW,
      refresh: async () => {
        await gate.promise
        return { accessToken: "from-refresh", expiresInSeconds: 900 }
      },
      store,
    })

    const pending = manager.getSnapshot("default")
    await new Promise((resolve) => setTimeout(resolve, 20))

    await store.withLock("default", async () => {
      await store.remove("default")
    })

    gate.resolve(undefined)
    expect(await rejection(pending)).toBeInstanceOf(CodexAuthRequiredError)
    expect(await store.read("default")).toBeUndefined()
  })

  test("cannot serve an in-memory token after logout", async () => {
    const store = await createStore()
    await store.write(
      "default",
      credential({ accessToken: "before-logout", expiresAt: NOW + 3_600_000 }),
    )

    const manager = createCodexAuthManager({ now: () => NOW, store })
    expect((await manager.getSnapshot("default")).accessToken).toBe(
      "before-logout",
    )

    await store.withLock("default", async () => {
      await store.remove("default")
    })

    expect(await rejection(manager.getSnapshot("default"))).toBeInstanceOf(
      CodexAuthRequiredError,
    )
  })

  test("serialises read-modify-write across processes", async () => {
    const store = await createStore()
    await store.write("default", credential({ revision: 1 }))

    const writerSource = `
      const { createCodexCredentialStore } = await import(process.env.CODEX_STORE_MODULE)
      const store = createCodexCredentialStore({ directory: process.env.CODEX_STORE_DIR })
      await store.withLock("default", async () => {
        const current = await store.read("default")
        await new Promise((resolve) => setTimeout(resolve, 80))
        await store.write("default", {
          ...current,
          accessToken: process.env.CODEX_WRITER,
          revision: current.revision + 1,
        })
      })
    `

    const spawnWriter = (writer: string) =>
      Bun.spawn({
        cmd: [process.execPath, "-e", writerSource],
        env: {
          ...process.env,
          CODEX_STORE_DIR: store.directory,
          CODEX_STORE_MODULE: STORE_MODULE_URL,
          CODEX_WRITER: writer,
        },
        stderr: "pipe",
        stdout: "pipe",
      })

    const first = spawnWriter("writer-one")
    const second = spawnWriter("writer-two")
    const exits = await Promise.all([first.exited, second.exited])

    const stderr = [
      await new Response(first.stderr).text(),
      await new Response(second.stderr).text(),
    ].join("\n")
    expect(stderr.trim()).toBe("")
    expect(exits).toEqual([0, 0])

    // Both writers read before writing, so a lost update would leave revision 2.
    const stored = await store.read("default")
    expect(stored?.revision).toBe(3)
    const writer = stored?.accessToken ?? ""
    expect(["writer-one", "writer-two"]).toContain(writer)
  })
})

describe("Codex credential lock", () => {
  test("removes the lock file after the critical section", async () => {
    const store = await createStore()
    await store.withLock("default", async () => {
      expect(await fs.readdir(store.directory)).toEqual(["default.json.lock"])
    })

    expect(await fs.readdir(store.directory)).toEqual([])
  })

  test("releases the lock when the critical section throws", async () => {
    const store = await createStore()

    const error = await rejection(
      store.withLock("default", () => {
        return Promise.reject(new Error("boom"))
      }),
    )
    expect(error.message).toContain("boom")

    expect(await fs.readdir(store.directory)).toEqual([])
  })

  test("reports a diagnosable timeout when another process holds the lock", async () => {
    const store = await createStore()
    await fs.writeFile(
      `${store.pathFor("default")}.lock`,
      JSON.stringify({ acquiredAt: Date.now(), pid: 4242, token: "other" }),
    )

    let ran = false
    const attempt = store.withLock(
      "default",
      () => {
        ran = true
        return Promise.resolve()
      },
      { retryDelayMs: 10, timeoutMs: 120 },
    )

    const error = await attempt.then(
      () => undefined,
      (caught: unknown) => caught,
    )
    expect(error).toBeInstanceOf(CodexProfileLockError)
    expect((error as CodexProfileLockError).lockPath).toBe(
      `${store.pathFor("default")}.lock`,
    )
    expect((error as CodexProfileLockError).holderPid).toBe(4242)
    expect((error as CodexProfileLockError).waitedMs).toBeGreaterThanOrEqual(
      100,
    )
    expect(ran).toBeFalse()
  })

  test("reclaims a lock abandoned by a crashed process", async () => {
    const store = await createStore()
    const lockPath = `${store.pathFor("default")}.lock`
    await fs.writeFile(
      lockPath,
      JSON.stringify({ acquiredAt: 0, pid: 999_999, token: "dead" }),
    )
    const longAgo = new Date(Date.now() - 600_000)
    await fs.utimes(lockPath, longAgo, longAgo)

    let ran = false
    await store.withLock(
      "default",
      () => {
        ran = true
        return Promise.resolve()
      },
      { staleMs: 1_000, timeoutMs: 500 },
    )

    expect(ran).toBeTrue()
    expect(await fs.readdir(store.directory)).toEqual([])
  })
})

function idTokenWith(claims: Record<string, unknown>): string {
  return [
    Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url"),
    Buffer.from(JSON.stringify(claims)).toString("base64url"),
    "signature",
  ].join(".")
}
