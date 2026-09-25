import type { RuntimeConfig } from "~/lib/runtime-config"

import { fetchWithRequestDump } from "~/lib/request-dump"

export async function createDeepSeekResponses(
  body: RequestInit["body"],
  config: RuntimeConfig["providers"]["deepseek"],
  signal?: AbortSignal,
): Promise<Response> {
  const apiKey = process.env[config.apiKeyEnv]?.trim()
  if (!apiKey) throw new Error(`Missing DeepSeek API key: ${config.apiKeyEnv}`)

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
  const url = `${baseUrl.toString().replace(/\/$/, "")}/responses`
  return await fetchWithRequestDump(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body,
    signal,
    redirect: "manual",
  })
}
