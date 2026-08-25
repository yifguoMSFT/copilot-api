import type { Context } from "hono"

import consola from "consola"

import { awaitApproval } from "~/lib/approval"
import { isModelAlias, resolveModelAlias } from "~/lib/model-aliases"
import { checkRateLimit } from "~/lib/rate-limit"
import { state } from "~/lib/state"
import { createResponses } from "~/services/copilot/create-responses"

const forwardedResponseHeaders = [
  "cache-control",
  "content-type",
  "openai-processing-ms",
  "x-request-id",
]

export async function handleResponse(c: Context): Promise<Response> {
  const startedAt = Date.now()
  const requestSignal = c.req.raw.signal

  consola.debug("Responses request received", {
    path: c.req.path,
    contentType: c.req.header("content-type"),
    contentLength: c.req.header("content-length"),
    signalAborted: requestSignal.aborted,
  })

  await checkRateLimit(state)

  if (state.manualApprove) await awaitApproval()

  const body = await c.req.arrayBuffer()
  const { body: upstreamBody, requestedModel } = resolveResponseModelAlias(body)
  const shouldLogContent =
    requestedModel !== undefined && isModelAlias(requestedModel)
  if (shouldLogContent) {
    consola.info(
      `${requestedModel} input:`,
      sanitizeLoggedContent(new TextDecoder().decode(body)),
    )
  }
  consola.debug("Responses request body read", {
    bodyBytes: body.byteLength,
    elapsedMs: Date.now() - startedAt,
    signalAborted: requestSignal.aborted,
    signalReason: formatAbortReason(requestSignal),
  })

  const upstreamSignal = requestSignal.aborted ? undefined : requestSignal
  if (upstreamSignal === undefined) {
    consola.debug(
      "Ignoring request signal aborted during Responses body consumption",
      { signalReason: formatAbortReason(requestSignal) },
    )
  }

  const modelLabel = formatModelLabel(requestedModel)
  consola.info(`Request sent to ${modelLabel}`)
  const upstream = await createResponses(upstreamBody, upstreamSignal)
  consola.info(
    `Response received from ${modelLabel}: ${upstream.status} in ${Date.now() - startedAt}ms`,
  )
  if (shouldLogContent) logResponseOutput(requestedModel, upstream.clone())
  const headers = new Headers()

  for (const name of forwardedResponseHeaders) {
    const value = upstream.headers.get(name)
    if (value !== null) headers.set(name, value)
  }

  consola.debug("Responses upstream response ready", {
    status: upstream.status,
    contentType: upstream.headers.get("content-type"),
    requestId: upstream.headers.get("x-request-id"),
    elapsedMs: Date.now() - startedAt,
    signalAborted: requestSignal.aborted,
  })

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  })
}

const formatModelLabel = (requestedModel?: string): string => {
  if (requestedModel === undefined) return "unknown model"

  const resolvedModel = resolveModelAlias(requestedModel)
  if (resolvedModel === requestedModel) return requestedModel

  return `${requestedModel} (${resolvedModel})`
}

const resolveResponseModelAlias = (
  body: ArrayBuffer,
): { body: ArrayBuffer | string; requestedModel?: string } => {
  const text = new TextDecoder().decode(body)

  try {
    const payload = JSON.parse(text) as { model?: unknown }
    if (typeof payload.model !== "string") return { body }

    const model = resolveModelAlias(payload.model)
    if (model === payload.model) return { body, requestedModel: payload.model }

    return {
      body: JSON.stringify({ ...payload, model }),
      requestedModel: payload.model,
    }
  } catch {
    return { body }
  }
}

const logResponseOutput = (
  model: string,
  response: { text: () => Promise<string> },
): void => {
  void response
    .text()
    .then((output) =>
      consola.info(`${model} output:`, summarizeLoggedOutput(output)),
    )
    .catch((error: unknown) =>
      consola.warn(`${model} output logging failed:`, error),
    )
}

const summarizeLoggedOutput = (content: string): string => {
  const completedResponse = parseCompletedResponse(content)
  if (completedResponse === undefined) return sanitizeLoggedContent(content)

  const response = asRecord(completedResponse.response) ?? completedResponse
  if (
    !Object.hasOwn(response, "status")
    && !Object.hasOwn(response, "output")
    && !Object.hasOwn(response, "error")
    && !Object.hasOwn(response, "incomplete_details")
  ) {
    return sanitizeLoggedContent(content)
  }

  const outputText = findOutputText(response.output)

  return JSON.stringify(
    removeUndefinedValues({
      model: response.model,
      status: response.status,
      output: parseJsonValue(outputText),
      usage: summarizeUsage(response.usage),
      copilot_usage: summarizeCopilotUsage(completedResponse.copilot_usage),
      error: response.error,
      incomplete_details: response.incomplete_details,
    }),
  )
}

const parseCompletedResponse = (
  content: string,
): Record<string, unknown> | undefined => {
  try {
    return asRecord(JSON.parse(content))
  } catch {
    const blocks = content.split("\n\n")
    for (let index = blocks.length - 1; index >= 0; index -= 1) {
      const lines = blocks[index].split("\n")
      if (!lines.includes("event: response.completed")) continue

      const data = lines.find((line) => line.startsWith("data: "))
      if (data === undefined) continue

      try {
        return asRecord(JSON.parse(data.slice(6)))
      } catch {
        return undefined
      }
    }
  }

  return undefined
}

const findOutputText = (output: unknown): string | undefined => {
  if (!Array.isArray(output)) return undefined

  for (const item of output.toReversed()) {
    const content = asRecord(item)?.content
    if (!Array.isArray(content)) continue

    for (const part of content.toReversed()) {
      const text = asRecord(part)?.text
      if (typeof text === "string" && text.length > 0) return text
    }
  }

  return undefined
}

const parseJsonValue = (value?: string): unknown => {
  if (value === undefined) return undefined

  try {
    return JSON.parse(value) as unknown
  } catch {
    return value
  }
}

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value) ?
    (value as Record<string, unknown>)
  : undefined

const summarizeUsage = (
  value: unknown,
): Record<string, unknown> | undefined => {
  const usage = asRecord(value)
  if (usage === undefined) return undefined

  const inputDetails = asRecord(usage.input_tokens_details)
  const outputDetails = asRecord(usage.output_tokens_details)

  return removeUndefinedValues({
    input_tokens: usage.input_tokens,
    cache_read_tokens: inputDetails?.cached_tokens,
    cache_write_tokens: inputDetails?.cache_write_tokens,
    output_tokens: usage.output_tokens,
    reasoning_tokens: outputDetails?.reasoning_tokens,
    total_tokens: usage.total_tokens,
  })
}

const summarizeCopilotUsage = (
  value: unknown,
): Record<string, unknown> | undefined => {
  const usage = asRecord(value)
  if (usage === undefined) return undefined

  return removeUndefinedValues({ total_nano_aiu: usage.total_nano_aiu })
}

const removeUndefinedValues = (
  value: Record<string, unknown>,
): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(value).filter(
      ([, entry]) => entry !== null && entry !== undefined,
    ),
  )

const sanitizeLoggedContent = (content: string): string => {
  try {
    return JSON.stringify(removeEncryptedContent(JSON.parse(content)))
  } catch {
    return content
      .split("\n")
      .map((line) => sanitizeSseLine(line))
      .join("\n")
  }
}

const sanitizeSseLine = (line: string): string => {
  if (!line.startsWith("data: ")) return line

  try {
    const data = JSON.parse(line.slice(6)) as unknown
    return `data: ${JSON.stringify(removeEncryptedContent(data))}`
  } catch {
    return line
  }
}

const removeEncryptedContent = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((entry) => removeEncryptedContent(entry))
  }
  if (value === null || typeof value !== "object") return value

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== "encrypted_content")
      .map(([key, entry]) => [key, removeEncryptedContent(entry)]),
  )
}

const formatAbortReason = (signal: AbortSignal): string | undefined => {
  if (!signal.aborted) return undefined

  const reason = signal.reason as unknown
  if (reason instanceof Error) return `${reason.name}: ${reason.message}`
  return String(reason)
}
