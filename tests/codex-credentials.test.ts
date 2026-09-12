import { afterEach, describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import {
  assertCodexProfileName,
  CodexCredentialError,
  createCodexCredentialStore,
  type CodexCredential,
} from "../src/lib/codex-credentials"
import { rejection } from "./support/async-errors"

const temporaryDirectories: Array<string> = []

const createStore = async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "codex-credentials-"),
  )
  temporaryDirectories.push(directory)
  return createCodexCredentialStore({ directory })
}

const credential = (
  overrides: Partial<CodexCredential> = {},
): CodexCredential => ({
  accessToken: "access-token",
  accountId: "account-id",
  email: "user@example.com",
  expiresAt: 1_800_000_000_000,
  idToken: "id-token",
  refreshToken: "refresh-token",
  revision: 1,
  updatedAt: 1_700_000_000_000,
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

describe("Codex profile names", () => {
  test("accepts safe names and rejects anything that could escape the directory", () => {
    expect(assertCodexProfileName("default")).toBe("default")
    expect(assertCodexProfileName("work.2-a_b")).toBe("work.2-a_b")

    for (const profile of [
      "",
      "..",
      "../escape",
      "nested/name",
      String.raw`nested\name`,
      ".hidden",
      "space name",
      "a".repeat(65),
    ]) {
      expect(() => assertCodexProfileName(profile)).toThrow(
        CodexCredentialError,
      )
    }
  })
})

describe("Codex credential store", () => {
  test("round trips a credential and resolves the profile inside the directory", async () => {
    const store = await createStore()
    const stored = credential()

    await store.write("default", stored)

    expect(store.pathFor("default")).toBe(
      path.join(store.directory, "default.json"),
    )
    expect(await store.read("default")).toEqual(stored)
    expect(await store.read("other")).toBeUndefined()
  })

  test("omits optional fields instead of writing nulls", async () => {
    const store = await createStore()
    await store.write(
      "default",
      credential({
        accountId: undefined,
        email: undefined,
        idToken: undefined,
      }),
    )

    const raw = await fs.readFile(store.pathFor("default"), "utf8")
    expect(raw).not.toContain("null")
    expect(raw).toContain("access_token")
    expect(JSON.parse(raw)).not.toHaveProperty("account_id")
  })

  test("leaves no temporary files behind and keeps the previous file on failure", async () => {
    const store = await createStore()
    await store.write("default", credential())

    const entries = await fs.readdir(store.directory)
    expect(entries).toEqual(["default.json"])

    const failing = createCodexCredentialStore({
      directory: path.join(store.directory, "default.json"),
    })
    expect(
      await rejection(failing.write("default", credential())),
    ).toBeDefined()
    expect(await store.read("default")).toEqual(credential())
  })

  test.skipIf(process.platform === "win32")(
    "stores the credential with owner-only permissions",
    async () => {
      const store = await createStore()
      await store.write("default", credential())

      const stats = await fs.stat(store.pathFor("default"))
      expect(stats.mode & 0o777).toBe(0o600)
    },
  )

  test("reports an unsupported file shape instead of guessing", async () => {
    const store = await createStore()
    await fs.writeFile(store.pathFor("default"), JSON.stringify({ version: 1 }))

    expect((await rejection(store.read("default"))).message).toContain(
      "unsupported shape",
    )
  })

  test("reports invalid JSON", async () => {
    const store = await createStore()
    await fs.writeFile(store.pathFor("default"), "not json")

    expect((await rejection(store.read("default"))).message).toContain(
      "not valid JSON",
    )
  })

  test("removes a credential and reports whether anything was removed", async () => {
    const store = await createStore()
    await store.write("default", credential())

    expect(await store.remove("default")).toBeTrue()
    expect(await store.remove("default")).toBeFalse()
    expect(await store.read("default")).toBeUndefined()
  })

  test("rejects an unsafe profile on every operation", async () => {
    const store = await createStore()

    expect(await rejection(store.read("../escape"))).toBeInstanceOf(
      CodexCredentialError,
    )
    expect(
      await rejection(store.write("../escape", credential())),
    ).toBeInstanceOf(CodexCredentialError)
    expect(await rejection(store.remove("../escape"))).toBeInstanceOf(
      CodexCredentialError,
    )
  })
})
