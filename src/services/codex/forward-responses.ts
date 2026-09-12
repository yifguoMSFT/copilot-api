import consola from "consola"

import { CODEX_UPSTREAM_ORIGIN, type RuntimeConfig } from "~/lib/runtime-config"
import {
  getCodexAuthManager,
  type CodexAuthManager,
  type CodexAuthSnapshot,
} from "~/services/codex/auth-manager"

type CodexProviderConfig = RuntimeConfig["providers"]["codex"]

export interface CodexForwardOptions {
  authManager?: Pick<CodexAuthManager, "getSnapshot">
  fetchImpl?: typeof fetch
  /** Inbound request headers; credentials in them are replaced, never trusted. */
  headers: Headers
  signal?: AbortSignal
}

/**
 * Headers the proxy owns. Everything else is forwarded so the Codex session
 * metadata the client sends survives, which is what "same forwarding path as
 * Copilot" means here: no protocol translation and no header spoofing.
 */
const replacedRequestHeaders = new Set([
  // Credentials: only the local credential store may authenticate upstream.
  "authorization",
  "chatgpt-account-id",
  "cookie",
  "proxy-authorization",
  "x-api-key",
  // Transport and framing headers are recomputed by the fetch implementation.
  "accept-encoding",
  "connection",
  "content-length",
  "host",
  "keep-alive",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
])

export async function createCodexResponses(
  body: RequestInit["body"],
  config: CodexProviderConfig,
  options: CodexForwardOptions,
): Promise<Response> {
  const bodyBytes = getBodySize(body)
  consola.info(
    `Codex forward: profile=${config.authProfile} baseUrl=${config.baseUrl} bodyBytes=${bodyBytes ?? "unknown"}`,
  )

  const authManager = options.authManager ?? (await getCodexAuthManager())
  let snapshot: CodexAuthSnapshot
  try {
    snapshot = await authManager.getSnapshot(config.authProfile)
  } catch (error) {
    consola.warn(
      `Codex forward: authentication failed for profile "${config.authProfile}":`,
      error instanceof Error ? error.message : String(error),
    )
    throw error
  }
  consola.info(
    `Codex forward: credentials ready account=${snapshot.accountId ?? "none"} revision=${snapshot.revision} expiresAt=${new Date(snapshot.expiresAt).toISOString()}`,
  )

  const fetchImpl = options.fetchImpl ?? fetch
  const url = codexResponsesUrl(config.baseUrl)
  const headers = buildCodexRequestHeaders(options.headers, snapshot)
  const startedAt = Date.now()

  consola.debug("Sending Codex Responses request", {
    accountIdPresent: snapshot.accountId !== undefined,
    bodyBytes,
    profile: config.authProfile,
    signalAborted: options.signal?.aborted ?? false,
    url,
  })

  try {
    const response = await fetchImpl(url, {
      body,
      headers,
      method: "POST",
      redirect: "manual",
      signal: options.signal,
    })

    consola.info(
      `Codex forward: upstream responded ${response.status} in ${Date.now() - startedAt}ms`,
    )
    consola.debug("Codex Responses request completed", {
      contentType: response.headers.get("content-type"),
      elapsedMs: Date.now() - startedAt,
      requestId: response.headers.get("x-request-id"),
      status: response.status,
    })

    return response
  } catch (error) {
    consola.warn(
      `Codex forward: request to ${url} failed after ${Date.now() - startedAt}ms:`,
      error instanceof Error ? error.message : String(error),
    )
    consola.debug("Codex Responses request failed", {
      elapsedMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
      signalAborted: options.signal?.aborted ?? false,
    })
    throw error
  }
}

export function buildCodexRequestHeaders(
  inbound: Headers,
  snapshot: CodexAuthSnapshot,
): Headers {
  const replaced = new Set(replacedRequestHeaders)
  const connection = inbound.get("connection")
  if (connection !== null) {
    for (const token of connection.split(",")) {
      const name = token.trim().toLowerCase()
      if (name.length > 0) replaced.add(name)
    }
  }

  const headers = new Headers()
  for (const [name, value] of inbound.entries()) {
    const key = name.toLowerCase()
    if (replaced.has(key) || key.startsWith("proxy-")) continue
    headers.set(key, value)
  }

  headers.set("authorization", `Bearer ${snapshot.accessToken}`)
  if (snapshot.accountId === undefined) {
    headers.delete("chatgpt-account-id")
  } else {
    headers.set("chatgpt-account-id", snapshot.accountId)
  }

  // Bun's fetch decompresses an upstream entity but keeps `content-encoding`
  // and the compressed `content-length`, so a decompressed body could be
  // labelled as gzip. Asking for identity keeps the forwarded bytes and the
  // framing headers consistent before the response header whitelist applies.
  headers.set("accept-encoding", "identity")
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json")
  }

  return headers
}

export function codexResponsesUrl(baseUrl: string): string {
  const url = new URL(baseUrl)
  if (url.origin !== CODEX_UPSTREAM_ORIGIN) {
    throw new Error(
      `Codex base URL must stay on ${CODEX_UPSTREAM_ORIGIN}: ${baseUrl}`,
    )
  }
  return `${url.toString().replace(/\/+$/, "")}/responses`
}

const getBodySize = (body: RequestInit["body"]): number | undefined => {
  if (typeof body === "string") return Buffer.byteLength(body)
  if (body instanceof ArrayBuffer) return body.byteLength
  if (ArrayBuffer.isView(body)) return body.byteLength
  if (body instanceof Blob) return body.size
  return undefined
}
