import consola from "consola"

import { copilotBaseUrl, copilotHeaders } from "~/lib/api-config"
import { forwardHeaders } from "~/lib/proxy-headers"
import { state } from "~/lib/state"

export const createResponses = async (
  body: RequestInit["body"],
  signal?: AbortSignal,
  requestHeaders?: Headers,
): Promise<Response> => {
  if (!state.copilotToken) throw new Error("Copilot token not found")

  const url = `${copilotBaseUrl(state)}/responses`
  const startedAt = Date.now()
  const headers = forwardHeaders(requestHeaders ?? new Headers(), [
    "authorization",
    "cookie",
    "host",
  ])
  for (const [name, value] of Object.entries(copilotHeaders(state))) {
    if (name === "x-request-id" && headers.has(name)) continue
    headers.set(name, value)
  }

  consola.debug("Sending native Responses request to Copilot", {
    url,
    accountType: state.accountType,
    bodyBytes: getBodySize(body),
    signalAborted: signal?.aborted ?? false,
  })

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body,
      signal,
    })

    consola.debug("Native Responses request completed", {
      status: response.status,
      contentType: response.headers.get("content-type"),
      requestId: response.headers.get("x-request-id"),
      elapsedMs: Date.now() - startedAt,
    })

    return response
  } catch (error) {
    consola.debug("Native Responses request failed", {
      error: formatError(error),
      elapsedMs: Date.now() - startedAt,
      signalAborted: signal?.aborted ?? false,
      signalReason: formatAbortReason(signal),
    })
    throw error
  }
}

const getBodySize = (body: RequestInit["body"]): number | undefined => {
  if (typeof body === "string") return Buffer.byteLength(body)
  if (body instanceof ArrayBuffer) return body.byteLength
  if (ArrayBuffer.isView(body)) return body.byteLength
  if (body instanceof Blob) return body.size
  return undefined
}

const formatAbortReason = (signal?: AbortSignal): string | undefined => {
  if (!signal?.aborted) return undefined

  return formatError(signal.reason)
}

const formatError = (error: unknown): string => {
  if (error instanceof Error) return `${error.name}: ${error.message}`
  return String(error)
}
