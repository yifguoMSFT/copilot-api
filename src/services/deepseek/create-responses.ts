import type { RuntimeConfig } from "~/lib/runtime-config"

import { fetchWithRequestDump } from "~/lib/request-dump"

export interface CreateDeepSeekResponsesOptions {
  signal?: AbortSignal
  headers?: Headers
}

const copyHeader = (
  source: Headers | undefined,
  name: string,
  target: Record<string, string>,
): void => {
  const value = source?.get(name)
  if (value) target[name] = value
}

export async function createDeepSeekResponses(
  body: RequestInit["body"],
  config: RuntimeConfig["providers"]["deepseek"],
  optionsOrSignal?: CreateDeepSeekResponsesOptions | AbortSignal,
): Promise<Response> {
  const options =
    optionsOrSignal instanceof AbortSignal ?
      { signal: optionsOrSignal }
    : (optionsOrSignal ?? {})
  const apiKey = config.apiKey.trim()
  if (!apiKey) throw new Error("Missing DeepSeek API key")

  const baseUrl = new URL(config.baseUrl)
  if (baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash) {
    throw new Error(
      "DeepSeek base URL cannot contain credentials, query, or fragment",
    )
  }
  if (
    baseUrl.protocol !== "https:"
    && baseUrl.hostname !== "localhost"
    && baseUrl.hostname !== "127.0.0.1"
  ) {
    throw new Error("DeepSeek base URL must use HTTPS")
  }
  // A base URL may already name the Responses endpoint; anything else gets it appended.
  const normalized = baseUrl.toString().replace(/\/+$/, "")
  const url =
    normalized.endsWith("/responses") ? normalized : `${normalized}/responses`

  const requestHeaders: Record<string, string> = {
    authorization: `Bearer ${apiKey}`,
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  }

  const sessionId =
    options.headers?.get("session-id") ?? options.headers?.get("x-session-id")
  if (sessionId) requestHeaders["session-id"] = sessionId
  copyHeader(options.headers, "x-opencode-session", requestHeaders)

  return await fetchWithRequestDump(url, {
    method: "POST",
    headers: requestHeaders,
    body,
    signal: options.signal,
    redirect: "manual",
  })
}
