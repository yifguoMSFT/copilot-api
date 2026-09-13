import { describe, expect, spyOn, test } from "bun:test"

import {
  DEFAULT_CREDENTIAL_PATH,
  DEFAULT_LISTEN_HOST,
  DEFAULT_LISTEN_PORT,
  DEFAULT_UPSTREAM_ORIGIN,
  AntigravityProxyUsageError,
  formatUsage,
  parseAntigravityProxyArgs,
  runAntigravityProxyCli,
} from "../scripts/antigravity-proxy"
import { AntigravityProxyError } from "../src/services/antigravity/proxy"

function usageErrorOf(argv: ReadonlyArray<string>): Error {
  try {
    parseAntigravityProxyArgs(argv)
  } catch (error) {
    if (error instanceof Error) return error
  }
  throw new Error(`Expected ${argv.join(" ")} to be rejected`)
}

describe("parseAntigravityProxyArgs", () => {
  test("requires an explicit login or serve operation", () => {
    expect(usageErrorOf([])).toBeInstanceOf(AntigravityProxyUsageError)
    expect(usageErrorOf(["--help"]).message).toContain("login or serve")
    expect(usageErrorOf(["start"]).message).toContain("login or serve")
  })

  test("defaults login to the CLIProxyAPI credential path and callback port", () => {
    const command = parseAntigravityProxyArgs(["login"])
    expect(command).toEqual({
      credentialPath: DEFAULT_CREDENTIAL_PATH,
      kind: "login",
      port: 51_121,
    })
    expect(DEFAULT_CREDENTIAL_PATH.endsWith("antigravity.json")).toBe(true)
    expect(DEFAULT_CREDENTIAL_PATH).toContain(".cli-proxy-api")
  })

  test("defaults serve to loopback, a fixed port, and the HTTPS Interactions origin", () => {
    const command = parseAntigravityProxyArgs(["serve"])
    expect(command).toEqual({
      credentialPath: DEFAULT_CREDENTIAL_PATH,
      host: DEFAULT_LISTEN_HOST,
      kind: "serve",
      port: DEFAULT_LISTEN_PORT,
      upstreamOrigin: DEFAULT_UPSTREAM_ORIGIN,
    })
  })

  test("accepts --flag value and --flag=value for every serve option", () => {
    const spaced = parseAntigravityProxyArgs([
      "serve",
      "--credential-file",
      "C:/creds/antigravity.json",
      "--upstream",
      "https://generativelanguage.googleapis.com",
      "--host",
      "localhost",
      "--port",
      "51235",
    ])
    const inline = parseAntigravityProxyArgs([
      "serve",
      "--credential-file=C:/creds/antigravity.json",
      "--upstream=https://generativelanguage.googleapis.com",
      "--host=localhost",
      "--port=51235",
    ])
    expect(spaced).toEqual(inline)
    expect(spaced).toEqual({
      credentialPath: "C:/creds/antigravity.json",
      host: "localhost",
      kind: "serve",
      port: 51_235,
      upstreamOrigin: "https://generativelanguage.googleapis.com",
    })
  })

  test("rejects a non-loopback listen address", () => {
    let thrown: unknown
    try {
      parseAntigravityProxyArgs(["serve", "--host", "0.0.0.0"])
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBeInstanceOf(AntigravityProxyError)
    expect((thrown as AntigravityProxyError).code).toBe("listen_invalid")
  })

  test("rejects an upstream origin carrying a path, query, or userinfo", () => {
    for (const upstream of [
      "https://generativelanguage.googleapis.com/v1beta",
      "https://generativelanguage.googleapis.com?alt=sse",
      "https://user:secret@generativelanguage.googleapis.com",
      "http://generativelanguage.googleapis.com",
    ]) {
      let thrown: unknown
      try {
        parseAntigravityProxyArgs(["serve", "--upstream", upstream])
      } catch (error) {
        thrown = error
      }
      expect(thrown).toBeInstanceOf(AntigravityProxyError)
      expect((thrown as AntigravityProxyError).code).toBe("upstream_invalid")
    }
  })

  test("rejects unknown options and malformed values", () => {
    expect(
      usageErrorOf(["serve", "--upstream-url", "https://x.test"]).message,
    ).toContain("not a serve option")
    expect(usageErrorOf(["login", "--host", "127.0.0.1"]).message).toContain(
      "not a login option",
    )
    expect(usageErrorOf(["serve", "--port", "not-a-port"]).message).toContain(
      "--port",
    )
    expect(usageErrorOf(["serve", "--port", "70000"]).message).toContain(
      "--port",
    )
    expect(usageErrorOf(["serve", "--port"]).message).toContain("needs a value")
    expect(usageErrorOf(["serve", "extra"]).message).toContain(
      "Unexpected argument",
    )
  })
})

describe("runAntigravityProxyCli", () => {
  test("prints usage, returns a non-zero code, and leaks no credential value", async () => {
    const chunks: Array<string> = []
    const write = spyOn(process.stderr, "write").mockImplementation(
      (chunk: string | Uint8Array): boolean => {
        chunks.push(
          typeof chunk === "string" ? chunk : Buffer.from(chunk).toString(),
        )
        return true
      },
    )
    let code: number
    try {
      code = await runAntigravityProxyCli([])
    } finally {
      write.mockRestore()
    }

    const output = chunks.join("")
    expect(code).toBe(2)
    expect(output).toContain("Usage:")
    expect(output).toContain("login")
    expect(output).toContain("serve")
    expect(output).not.toContain("access_token")
    expect(output).not.toContain("refresh_token")
    expect(output).not.toContain("Bearer ")
  })

  test("usage text documents both operations without a token", () => {
    const usage = formatUsage()
    expect(usage).toContain("bun scripts/antigravity-proxy.ts login")
    expect(usage).toContain("bun scripts/antigravity-proxy.ts serve")
    expect(usage).not.toContain("Bearer ")
  })
})
