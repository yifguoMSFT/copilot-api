import { afterEach, describe, expect, mock, test } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import {
  maskIdentifier,
  runCodexLogin,
  runCodexLogout,
  runCodexStatus,
  toCodexCredential,
} from "../src/codex-auth"
import { createCodexCredentialStore } from "../src/lib/codex-credentials"
import { rejection } from "./support/async-errors"

const temporaryDirectories: Array<string> = []

const createStore = async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "codex-auth-"))
  temporaryDirectories.push(directory)
  return createCodexCredentialStore({ directory })
}

const idTokenWith = (claims: Record<string, unknown>): string =>
  [
    Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url"),
    Buffer.from(JSON.stringify(claims)).toString("base64url"),
    "signature",
  ].join(".")

const tokensForLogin = () => ({
  access_token: "access-token",
  expires_in: 900,
  id_token: idTokenWith({
    email: "user@example.com",
    "https://api.openai.com/auth": { chatgpt_account_id: "account-123" },
  }),
  refresh_token: "refresh-token",
})

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => fs.rm(directory, { force: true, recursive: true })),
  )
})

describe("Codex login flow", () => {
  test("exchanges the callback code and stores the credential", async () => {
    const store = await createStore()
    const fetchMock = mock(() =>
      Promise.resolve(Response.json(tokensForLogin())),
    )
    const opened: Array<string> = []

    const result = await runCodexLogin("default", {
      now: () => 1_700_000_000_000,
      oauth: { fetchImpl: fetchMock as unknown as typeof fetch },
      openBrowser: (url) => {
        opened.push(url)
      },
      store,
      waitForCode: async ({ onListening }) => {
        await onListening("http://localhost:1455/auth/callback")
        return "the-code"
      },
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(opened).toHaveLength(1)
    expect(opened[0]).toContain("code_challenge=")
    expect(opened[0]).not.toContain("code_verifier")

    expect(result.profile).toBe("default")
    expect(result.credential).toEqual({
      accessToken: "access-token",
      accountId: "account-123",
      email: "user@example.com",
      expiresAt: 1_700_000_000_000 + 900_000,
      idToken: tokensForLogin().id_token,
      refreshToken: "refresh-token",
      revision: 1,
      updatedAt: 1_700_000_000_000,
      version: 1,
    })

    expect(await store.read("default")).toEqual(result.credential)
  })

  test("survives a browser that cannot be opened", async () => {
    const store = await createStore()
    const fetchMock = mock(() =>
      Promise.resolve(Response.json(tokensForLogin())),
    )

    const result = await runCodexLogin("default", {
      oauth: { fetchImpl: fetchMock as unknown as typeof fetch },
      openBrowser: () => {
        throw new Error("no display")
      },
      store,
      waitForCode: async ({ onListening }) => {
        await onListening("http://localhost:1455/auth/callback")
        return "the-code"
      },
    })

    expect(result.credential.accessToken).toBe("access-token")
  })

  test("refuses to store a credential without a refresh token", async () => {
    const store = await createStore()
    const fetchMock = mock(() =>
      Promise.resolve(Response.json({ access_token: "access-token" })),
    )

    const error = await rejection(
      runCodexLogin("default", {
        oauth: { fetchImpl: fetchMock as unknown as typeof fetch },
        openBrowser: () => undefined,
        store,
        waitForCode: () => Promise.resolve("the-code"),
      }),
    )

    expect(error.message).toContain("refresh token")
    expect(await store.read("default")).toBeUndefined()
  })

  test("assumes a one hour lifetime when the token response omits expires_in", () => {
    const credential = toCodexCredential(
      { accessToken: "a", refreshToken: "r" },
      1_000,
    )

    expect(credential.expiresAt).toBe(1_000 + 3_600_000)
    expect(credential.revision).toBe(1)
  })
})

describe("Codex status and logout", () => {
  test("reports a stored credential and flags expiry", async () => {
    const store = await createStore()
    await store.write("default", {
      accessToken: "a",
      accountId: "account-123456",
      email: "user@example.com",
      expiresAt: 2_000,
      refreshToken: "r",
      revision: 1,
      updatedAt: 1_000,
      version: 1,
    })

    expect(
      await runCodexStatus("default", { now: () => 1_500, store }),
    ).toEqual({
      accountId: "account-123456",
      email: "user@example.com",
      expired: false,
      expiresAt: 2_000,
      loggedIn: true,
    })

    expect(
      (await runCodexStatus("default", { now: () => 3_000, store }))?.expired,
    ).toBeTrue()
    expect(await runCodexStatus("missing", { store })).toBeUndefined()
  })

  test("removes the stored credential", async () => {
    const store = await createStore()
    await store.write("default", {
      accessToken: "a",
      expiresAt: 2_000,
      refreshToken: "r",
      revision: 1,
      updatedAt: 1_000,
      version: 1,
    })

    expect(await runCodexLogout("default", { store })).toBeTrue()
    expect(await runCodexLogout("default", { store })).toBeFalse()
  })

  test("masks identifiers for display", () => {
    expect(maskIdentifier("user@example.com")).toBe("us******")
    expect(maskIdentifier("ab")).toBe("**")
    expect(maskIdentifier("abc")).toBe("ab*")
    expect(maskIdentifier("account-123456")).toBe("ac******")
  })
})
