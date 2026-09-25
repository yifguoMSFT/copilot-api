import consola from "consola"

import { copilotBaseUrl, copilotHeaders } from "~/lib/api-config"
import { forwardHeaders } from "~/lib/proxy-headers"
import { fetchWithRequestDump } from "~/lib/request-dump"
import {
  logResponsesDiagnostic,
  logResponsesError,
  summarizeResponsesBody,
  summarizeResponsesHeaders,
} from "~/lib/responses-diagnostics"
import { state } from "~/lib/state"

// eslint-disable-next-line complexity
export const createResponses = async (
  body: RequestInit["body"],
  signal?: AbortSignal,
  options?: { requestHeaders?: Headers; originalBody?: ArrayBuffer },
): Promise<Response> => {
  if (!state.copilotToken) throw new Error("Copilot token not found")

  const url = `${copilotBaseUrl(state)}/responses`
  const startedAt = Date.now()
  const requestHeaders = options?.requestHeaders
  const headers = forwardHeaders(requestHeaders ?? new Headers(), [
    "authorization",
    "cookie",
    "host",
  ])
  for (const [name, value] of Object.entries(copilotHeaders(state))) {
    if (name === "x-request-id" && headers.has(name)) continue
    headers.set(name, value)
  }

  const diagnostics = state.verbose
  const requestId = headers.get("x-request-id")
  if (diagnostics) {
    void logResponsesDiagnostic({
      stage: "request",
      requestId,
      url,
      incoming: summarizeResponsesBody(options?.originalBody ?? body),
      upstream: summarizeResponsesBody(body),
      incomingHeaders: summarizeResponsesHeaders(
        requestHeaders ?? new Headers(),
      ),
      upstreamHeaders: summarizeResponsesHeaders(headers),
    })
  }

  consola.debug("Sending native Responses request to Copilot", {
    url,
    accountType: state.accountType,
    bodyBytes: getBodySize(body),
    signalAborted: signal?.aborted ?? false,
  })

  try {
    const response = await fetchWithRequestDump(url, {
      method: "POST",
      headers,
      body,
      signal,
    })

    if (diagnostics) {
      void logResponsesDiagnostic({
        stage: "upstream-response",
        requestId,
        upstreamRequestId: response.headers.get("x-request-id"),
        copilotRequestId: response.headers.get("x-copilot-service-request-id"),
        status: response.status,
        elapsedMs: Date.now() - startedAt,
        headers: summarizeResponsesHeaders(response.headers),
      })
      if (!response.ok) {
        void logResponsesError(response, requestId).catch(() =>
          consola.debug("Responses diagnostic error body unavailable", {
            requestId,
          }),
        )
      }
    }

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
