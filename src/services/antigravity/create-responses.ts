import { HttpStatusError } from "~/lib/error"
import type { JsonObject } from "~/services/generate-content/convert"
import { convertResponsesRequestToGenerateContent } from "~/services/generate-content/convert"
import { createGenerateContentEventStream } from "~/services/generate-content/stream"
import type { AntigravityCredentialStore } from "./auth"
import { ANTIGRAVITY_ENDPOINTS, ANTIGRAVITY_USER_AGENT } from "./auth"
import { buildCloudCodeEnvelope } from "./envelope"
import { resolveAntigravityUpstreamModel } from "./models"

export interface AntigravityResponsesOptions {
  credentialStore: AntigravityCredentialStore
  headers?: Headers
  signal?: AbortSignal
  fetchImpl?: typeof fetch
  upstreamOrigin?: string
}

export async function createAntigravityResponses(
  body: ArrayBuffer | string,
  options: AntigravityResponsesOptions,
): Promise<Response> {
  const fetchFn = options.fetchImpl ?? fetch
  const origin = options.upstreamOrigin ?? ANTIGRAVITY_ENDPOINTS.daily
  const upstreamUrl = `${origin}/v1internal:streamGenerateContent?alt=sse`

  const text = typeof body === "string" ? body : new TextDecoder().decode(body)
  let responsesReq: JsonObject
  try {
    responsesReq = JSON.parse(text) as JsonObject
  } catch {
    throw new HttpStatusError(400, "Responses request must be valid JSON", "invalid_request_error")
  }

  // Only streaming is supported for this release contract
  if (responsesReq.stream === false) {
    throw new HttpStatusError(400, "Antigravity provider currently only supports streaming requests (stream: true)", "unsupported_stream_mode")
  }

  const requestedModel = typeof responsesReq.model === "string" ? responsesReq.model : ""
  const effort =
    responsesReq.reasoning && typeof responsesReq.reasoning === "object"
      ? (responsesReq.reasoning as { effort?: string }).effort
      : undefined
  const upstreamModel = resolveAntigravityUpstreamModel(effort)

  let converted
  try {
    converted = convertResponsesRequestToGenerateContent(responsesReq, { cleanSchema: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    throw new HttpStatusError(400, message, "conversion_error")
  }

  // Get current active credential
  let credential
  try {
    credential = await options.credentialStore.current()
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Credential unavailable"
    throw new HttpStatusError(503, `Antigravity credentials unavailable: ${message}`, "antigravity_auth_unavailable")
  }

  const projectId = credential.project_id
  if (!projectId || typeof projectId !== "string" || projectId.trim() === "") {
    throw new HttpStatusError(
      503,
      "Antigravity credential has no valid project_id; run login or onboard to configure project",
      "antigravity_missing_project",
    )
  }

  // Derive stable session ID: check session-id, x-session-id, prompt_cache_key, or fallback
  const headerSessionId =
    options.headers?.get("session-id")
    ?? options.headers?.get("x-session-id")
    ?? (typeof responsesReq.prompt_cache_key === "string" && responsesReq.prompt_cache_key.trim() !== ""
      ? responsesReq.prompt_cache_key.trim()
      : undefined)
    ?? (responsesReq.client_metadata && typeof responsesReq.client_metadata === "object" && typeof (responsesReq.client_metadata as Record<string, unknown>).session_id === "string"
      ? (responsesReq.client_metadata as Record<string, string>).session_id.trim()
      : undefined)
  const sessionId = headerSessionId && headerSessionId.trim() !== "" ? headerSessionId.trim() : `-${Date.now()}`

  const envelope = buildCloudCodeEnvelope({
    model: upstreamModel,
    project: projectId.trim(),
    requestBody: converted.body,
    sessionId,
  })

  let upstreamResp: Response
  try {
    upstreamResp = await fetchFn(upstreamUrl, {
      method: "POST",
      headers: {
        authorization: `Bearer ${credential.access_token}`,
        "user-agent": ANTIGRAVITY_USER_AGENT,
        "content-type": "application/json",
        accept: "text/event-stream",
      },
      body: JSON.stringify(envelope),
      signal: options.signal,
    })
  } catch (err: unknown) {
    if (options.signal?.aborted) {
      throw err
    }
    const message = err instanceof Error ? err.message : String(err)
    throw new HttpStatusError(502, `Antigravity upstream unavailable: ${message}`, "upstream_unavailable")
  }

  if (!upstreamResp.ok) {
    const errText = await upstreamResp.text().catch(() => "")
    return new Response(errText, {
      status: upstreamResp.status,
      headers: { "content-type": "application/json" },
    })
  }

  if (!upstreamResp.body) {
    throw new HttpStatusError(502, "Antigravity upstream returned no body", "upstream_no_body")
  }

  const stream = createGenerateContentEventStream({
    requestedModel,
    tools: converted.tools,
  })

  const upstreamReader = upstreamResp.body.getReader()
  const encoder = new TextEncoder()

  const sseReadable = new ReadableStream({
    async start(controller) {
      try {
        while (true) {
          const { done, value } = await upstreamReader.read()
          if (done) break
          if (value) {
            const out = stream.push(value)
            if (out !== "") controller.enqueue(encoder.encode(out))
          }
        }
        const finalOut = stream.flush()
        if (finalOut !== "") controller.enqueue(encoder.encode(finalOut))
        controller.close()
      } catch (err: unknown) {
        stream.cancel()
        if ((err as any)?.name !== "AbortError") {
          controller.error(err)
        }
      }
    },
    cancel() {
      stream.cancel()
      void upstreamReader.cancel().catch(() => {})
    },
  })

  return new Response(sseReadable, {
    status: 200,
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache",
      connection: "keep-alive",
    },
  })
}
