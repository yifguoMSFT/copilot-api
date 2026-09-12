import { describe, expect, mock, test } from "bun:test"
import { createHash } from "node:crypto"

import {
  buildAuthorizationUrl,
  CODEX_OAUTH,
  CodexOAuthError,
  createOAuthState,
  createPkceCodes,
  exchangeAuthorizationCode,
  readCodexIdentity,
  refreshAccessToken,
} from "../src/services/codex/oauth"
import { rejection } from "./support/async-errors"

const base64url = (value: string) =>
  createHash("sha256").update(value).digest("base64url")

const idTokenWith = (claims: Record<string, unknown>): string =>
  [
    Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url"),
    Buffer.from(JSON.stringify(claims)).toString("base64url"),
    "signature",
  ].join(".")

describe("Codex PKCE and authorization URL", () => {
  test("derives an S256 challenge from the verifier", () => {
    const codes = createPkceCodes()

    expect(codes.verifier).toMatch(/^[\w-]{43}$/)
    expect(codes.challenge).toBe(base64url(codes.verifier))
  })

  test("never leaks the verifier into the authorization URL", () => {
    const codes = createPkceCodes()
    const state = createOAuthState()
    const url = new URL(
      buildAuthorizationUrl({ challenge: codes.challenge, state }),
    )

    expect(url.origin + url.pathname).toBe(CODEX_OAUTH.authorizeUrl)
    expect(url.searchParams.get("client_id")).toBe(CODEX_OAUTH.clientId)
    expect(url.searchParams.get("response_type")).toBe("code")
    expect(url.searchParams.get("redirect_uri")).toBe(CODEX_OAUTH.redirectUri)
    expect(url.searchParams.get("scope")).toBe(CODEX_OAUTH.scope)
    expect(url.searchParams.get("state")).toBe(state)
    expect(url.searchParams.get("code_challenge")).toBe(codes.challenge)
    expect(url.searchParams.get("code_challenge_method")).toBe("S256")
    expect(url.searchParams.get("codex_cli_simplified_flow")).toBe("true")
    expect(url.toString()).not.toContain(codes.verifier)
  })

  test("generates distinct states", () => {
    expect(createOAuthState()).not.toBe(createOAuthState())
  })
})

describe("Codex token requests", () => {
  test("exchanges the authorization code exactly once with the verifier", async () => {
    const fetchMock = mock(
      (_input: string | URL | Request, _init?: RequestInit) =>
        Promise.resolve(
          Response.json({
            access_token: "access-1",
            expires_in: 900,
            id_token: "id-1",
            refresh_token: "refresh-1",
          }),
        ),
    )

    const tokens = await exchangeAuthorizationCode("the-code", "the-verifier", {
      fetchImpl: fetchMock as unknown as typeof fetch,
      redirectUri: "http://localhost:1455/auth/callback",
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(CODEX_OAUTH.tokenUrl)
    expect(init.method).toBe("POST")
    expect(init.redirect).toBe("manual")
    expect(init.body).toBeInstanceOf(URLSearchParams)
    const form = init.body as URLSearchParams
    expect(form.get("grant_type")).toBe("authorization_code")
    expect(form.get("code")).toBe("the-code")
    expect(form.get("code_verifier")).toBe("the-verifier")
    expect(form.get("client_id")).toBe(CODEX_OAUTH.clientId)

    expect(tokens).toEqual({
      accessToken: "access-1",
      expiresInSeconds: 900,
      idToken: "id-1",
      refreshToken: "refresh-1",
    })
  })

  test("refreshes with the refresh token grant and tolerates omission of a new refresh token", async () => {
    const fetchMock = mock(
      (_input: string | URL | Request, _init?: RequestInit) =>
        Promise.resolve(Response.json({ access_token: "access-2" })),
    )

    const tokens = await refreshAccessToken("refresh-1", {
      fetchImpl: fetchMock as unknown as typeof fetch,
    })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const form = init.body as URLSearchParams
    expect(form.get("grant_type")).toBe("refresh_token")
    expect(form.get("refresh_token")).toBe("refresh-1")
    expect(form.get("scope")).toBe(CODEX_OAUTH.scope)
    expect(tokens.accessToken).toBe("access-2")
    expect(tokens.refreshToken).toBeUndefined()
  })

  test("reports the status and only the documented error fields on failure", async () => {
    const fetchMock = mock(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            error: "invalid_grant",
            error_description: "refresh token expired",
            refresh_token: "should-not-be-logged",
          }),
          { status: 400 },
        ),
      ),
    )

    const error = await refreshAccessToken("refresh-1", {
      fetchImpl: fetchMock as unknown as typeof fetch,
    }).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(CodexOAuthError)
    expect((error as CodexOAuthError).status).toBe(400)
    expect((error as Error).message).toContain("invalid_grant")
    expect((error as Error).message).not.toContain("should-not-be-logged")
  })

  test("rejects a token response that is not JSON or is missing the access token", async () => {
    const notJson = mock(() =>
      Promise.resolve(new Response("<html>nope</html>")),
    )
    const notJsonError = await rejection(
      exchangeAuthorizationCode("code", "verifier", {
        fetchImpl: notJson as unknown as typeof fetch,
      }),
    )
    expect(notJsonError.message).toContain("not valid JSON")

    const missingAccessToken = mock(() =>
      Promise.resolve(Response.json({ refresh_token: "refresh" })),
    )
    const missingError = await rejection(
      exchangeAuthorizationCode("code", "verifier", {
        fetchImpl: missingAccessToken as unknown as typeof fetch,
      }),
    )
    expect(missingError.message).toContain("missing required fields")
  })
})

describe("Codex identity claims", () => {
  test("reads the account id and email from the ID token", () => {
    const idToken = idTokenWith({
      email: "user@example.com",
      "https://api.openai.com/auth": { chatgpt_account_id: "account-123" },
    })

    expect(readCodexIdentity(idToken)).toEqual({
      accountId: "account-123",
      email: "user@example.com",
    })
  })

  test("returns nothing for absent or malformed tokens", () => {
    expect(readCodexIdentity()).toEqual({})
    expect(readCodexIdentity("not-a-jwt")).toEqual({})
    expect(readCodexIdentity("a.!!!not-base64!!!.c")).toEqual({})
    expect(readCodexIdentity(idTokenWith({ email: 42 }))).toEqual({})
  })
})
