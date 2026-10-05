import type { Context } from "hono"

import consola from "consola"
import { homedir } from "node:os"
import { join } from "node:path"

import { awaitApproval } from "~/lib/approval"
import { compactionMetadataSource } from "~/lib/compaction-routing"
import { HttpStatusError } from "~/lib/error"
import { isModelAlias, resolveModelAlias } from "~/lib/model-aliases"
import { resolveModelRoute, type ModelProvider } from "~/lib/model-routing"
import { forwardHeaders } from "~/lib/proxy-headers"
import { checkRateLimit } from "~/lib/rate-limit"
import { defaultProviderConfig, type RuntimeConfig } from "~/lib/runtime-config"
import { state } from "~/lib/state"
import { AntigravityCredentialStore } from "~/services/antigravity/auth"
import { createAntigravityResponses } from "~/services/antigravity/create-responses"
import { createCodexResponses } from "~/services/codex/forward-responses"
import { createResponses } from "~/services/copilot/create-responses"
import { createDeepSeekResponses } from "~/services/deepseek/create-responses"

import { toCodexAuthErrorResponse } from "./codex-passthrough"
import { stripReasoningContent } from "./gpt-reasoning-content"
import { normalizeFunctionSchemaRoots } from "./normalize-function-schema-roots"
import { sanitizeInputItemIds } from "./sanitize-input-ids"
import { normalizeResponsesItemIds } from "./sse-item-id-normalizer"
import { stripRejectedToolCalls } from "./strip-rejected-tool-calls"

const forwardedResponseHeaders = [
  "cache-control",
  "content-type",
  "openai-processing-ms",
  "x-request-id",
]

// eslint-disable-next-line complexity
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
  const {
    body: upstreamBody,
    requestedModel,
    upstreamModel,
    provider,
    isCompaction,
  } = resolveResponseModel(body, c.req.raw.headers)
  const shouldLogContent =
    requestedModel !== undefined && isModelAlias(requestedModel)
  if (shouldLogContent) {
    consola.info(
      `${requestedModel} input:`,
      sanitizeLoggedContent(new TextDecoder().decode(body)),
    )
  }
  logBodyRead(body.byteLength, startedAt, requestSignal)

  const upstreamSignal = requestSignal.aborted ? undefined : requestSignal
  if (upstreamSignal === undefined) {
    consola.debug(
      "Ignoring request signal aborted during Responses body consumption",
      { signalReason: formatAbortReason(requestSignal) },
    )
  }

  const modelLabel = formatModelLabel(requestedModel, upstreamModel)
  consola.info(
    `${isCompaction ? "Compaction request" : "Request"} sent to ${modelLabel}`,
  )
  if (state.publishedModels?.suffixMode === true) {
    consola.info(
      `Model routed: ${requestedModel ?? "unknown"} → ${provider} (${upstreamModel ?? "unknown"})`,
    )
  }
  let upstream: Response
  switch (provider) {
    case "codex": {
      const codexConfig = state.runtimeConfig?.providers.codex
      if (codexConfig === undefined) {
        throw new Error("Codex runtime configuration is not loaded")
      }
      const forwarded = await forwardCodexRequest({
        headers: c.req.raw.headers,
        body: upstreamBody,
        codexConfig,
        signal: upstreamSignal,
      })
      // A login failure is answered locally, but it is still a response for the
      // model label and content logs, exactly like the Copilot and DeepSeek paths.
      upstream = "error" in forwarded ? forwarded.error : forwarded.upstream

      break
    }
    case "antigravity": {
      const antigravityConfig = state.runtimeConfig?.providers.antigravity
      if (antigravityConfig === undefined || !antigravityConfig.enabled) {
        throw new HttpStatusError(
          400,
          "Antigravity runtime configuration is not loaded or disabled",
          "model_provider_disabled",
        )
      }
      if (!state.antigravityCredentialStore) {
        const defaultPath = join(
          homedir(),
          ".cli-proxy-api",
          "antigravity.json",
        )
        const credPath = antigravityConfig.credentialPath ?? defaultPath
        state.antigravityCredentialStore = new AntigravityCredentialStore(
          credPath,
        )
      }
      upstream = await createAntigravityResponses(upstreamBody, {
        credentialStore: state.antigravityCredentialStore,
        headers: c.req.raw.headers,
        signal: upstreamSignal,
      })

      break
    }
    case "deepseek": {
      const deepSeekConfig = state.runtimeConfig?.providers.deepseek
      if (deepSeekConfig === undefined) {
        throw new Error("DeepSeek runtime configuration is not loaded")
      }
      upstream = await createDeepSeekResponses(upstreamBody, deepSeekConfig, {
        signal: upstreamSignal,
        headers: c.req.raw.headers,
      })

      break
    }
    default: {
      upstream = await createResponses(upstreamBody, upstreamSignal, {
        requestHeaders: c.req.raw.headers,
        originalBody: body,
      })
    }
  }
  consola.info(
    `${isCompaction ? "Compaction response" : "Response"} received from ${modelLabel}: ${upstream.status} in ${Date.now() - startedAt}ms`,
  )
  if (shouldLogContent) logResponseOutput(requestedModel, upstream.clone())
  // Fetch decodes compressed bodies; streaming normalization can change their size.
  const headers =
    provider === "copilot" ?
      forwardHeaders(upstream.headers, ["content-encoding", "set-cookie"])
    : buildForwardedHeaders(upstream)
  logUpstreamReady(upstream, startedAt, requestSignal)

  let responseBody = upstream.body
  if (
    provider === "copilot"
    && state.responsesStableItemIds
    && responseBody !== null
    && upstream.headers.get("content-type")?.includes("text/event-stream")
  ) {
    responseBody = normalizeResponsesItemIds(responseBody)
  }

  return new Response(responseBody, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  })
}

type CodexForwardResult = { upstream: Response } | { error: Response }

/**
 * Codex requests authenticate with the local credential store, so a login
 * failure is answered with the local error envelope instead of falling back
 * to another provider.
 */
const forwardCodexRequest = async (request: {
  headers: Headers
  body: ArrayBuffer | string
  codexConfig: RuntimeConfig["providers"]["codex"]
  signal: AbortSignal | undefined
}): Promise<CodexForwardResult> => {
  const { body, codexConfig, headers, signal } = request

  try {
    return {
      upstream: await createCodexResponses(body, codexConfig, {
        headers,
        signal,
      }),
    }
  } catch (error) {
    const authFailure = toCodexAuthErrorResponse(error, codexConfig.authProfile)
    if (authFailure !== undefined) return { error: authFailure }
    throw error
  }
}

const buildForwardedHeaders = (upstream: Response): Headers => {
  const headers = new Headers()
  for (const name of forwardedResponseHeaders) {
    const value = upstream.headers.get(name)
    if (value !== null) headers.set(name, value)
  }
  return headers
}

const logBodyRead = (
  bodyBytes: number,
  startedAt: number,
  requestSignal: AbortSignal,
): void => {
  consola.debug("Responses request body read", {
    bodyBytes,
    elapsedMs: Date.now() - startedAt,
    signalAborted: requestSignal.aborted,
    signalReason: formatAbortReason(requestSignal),
  })
}

const logUpstreamReady = (
  upstream: Response,
  startedAt: number,
  requestSignal: AbortSignal,
): void => {
  consola.debug("Responses upstream response ready", {
    status: upstream.status,
    contentType: upstream.headers.get("content-type"),
    requestId: upstream.headers.get("x-request-id"),
    elapsedMs: Date.now() - startedAt,
    signalAborted: requestSignal.aborted,
  })
}

const formatModelLabel = (
  requestedModel?: string,
  upstreamModel?: string,
): string => {
  if (requestedModel === undefined) return "unknown model"

  const resolvedModel = upstreamModel ?? resolveModelAlias(requestedModel)
  if (resolvedModel === requestedModel) return requestedModel

  return `${requestedModel} (${resolvedModel})`
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/**
 * Header turns run on the cheap Copilot reviewer, so the tier is pinned there
 * whatever the client asked for; every other reasoning field is preserved.
 */
const withReasoningEffort = (
  payload: Record<string, unknown>,
  effort: string,
): Record<string, unknown> => {
  const reasoning = isRecord(payload.reasoning) ? payload.reasoning : {}
  return { ...payload, reasoning: { ...reasoning, effort } }
}

const resolveResponseModel = (
  body: ArrayBuffer,
  headers: Headers,
): {
  body: ArrayBuffer | string
  requestedModel?: string
  provider: ModelProvider
  upstreamModel?: string
  isCompaction: boolean
} => {
  const text = new TextDecoder().decode(body)

  try {
    const payload = JSON.parse(text) as Record<string, unknown>
    const metadataSource = compactionMetadataSource(headers, payload)
    const isCompaction = metadataSource !== undefined
    if (payload.model === undefined) {
      throw new HttpStatusError(
        400,
        "Responses request must include a model",
        "invalid_model",
      )
    }
    if (typeof payload.model !== "string" || payload.model.length === 0) {
      throw new HttpStatusError(
        400,
        "Responses model must be a non-empty string",
        "invalid_model",
      )
    }
    const config: RuntimeConfig = state.runtimeConfig ?? {
      environment: "legacy",
      ...defaultProviderConfig(),
    }
    const target =
      config.compaction.enabled && isCompaction ?
        config.compaction.model
      : payload.model
    if (target === undefined) {
      throw new Error("compaction.model is required when compaction is enabled")
    }
    const route = resolveModelRoute(target, config, state.publishedModels)
    if (config.compaction.enabled && isCompaction) {
      consola.info("Compaction model routing", {
        requestedModel: payload.model,
        configuredModel: target,
        upstreamModel: route.upstreamModel,
        provider: route.provider,
        metadataSource,
      })
    }

    let nextPayload: Record<string, unknown> = payload
    let changed = false

    if (Array.isArray(nextPayload.input)) {
      const rejectedCalls = stripRejectedToolCalls(nextPayload.input)
      if (rejectedCalls.changed) {
        nextPayload = { ...nextPayload, input: rejectedCalls.input }
        changed = true
        consola.info(
          `Dropped ${rejectedCalls.removed.length} call(s) the client answered with "unsupported call": ${rejectedCalls.removed
            .map((entry) => entry.name)
            .join(", ")}`,
        )
      }
    }

    if (route.provider !== "deepseek" && Array.isArray(nextPayload.input)) {
      const sanitizedIds = sanitizeInputItemIds(nextPayload.input)
      if (sanitizedIds.changed) {
        nextPayload = { ...nextPayload, input: sanitizedIds.input }
        changed = true
        consola.info(
          `Sanitized ${sanitizedIds.renamedCount} input item IDs to conform with Responses protocol`,
        )
      }
    }

    if (route.provider === "deepseek") {
      const normalizedSchemas = normalizeFunctionSchemaRoots(nextPayload)
      if (normalizedSchemas.changed) {
        nextPayload = normalizedSchemas.payload
        changed = true
        consola.info(
          `Declared object root on ${normalizedSchemas.normalizedCount} function schema(s) for DeepSeek`,
        )
      }
    }

    if (route.upstreamModel !== payload.model) {
      nextPayload = { ...nextPayload, model: route.upstreamModel }
      changed = true
    }

    if (route.reasoningEffort !== undefined) {
      nextPayload = withReasoningEffort(nextPayload, route.reasoningEffort)
      changed = true
    }

    if (
      (route.provider === "copilot" || route.provider === "codex")
      && (route.provider === "codex" || route.upstreamModel.startsWith("gpt-"))
      && config.providers.copilot.stripReasoningContentForGpt
      && Array.isArray(nextPayload.input)
    ) {
      const stripped = stripReasoningContent(nextPayload.input)
      if (stripped.changed) {
        nextPayload = { ...nextPayload, input: stripped.input }
        changed = true
        consola.info(
          `GPT reasoning sanitized: model=${route.upstreamModel} indices=[${stripped.indices.join(",")}] items=${stripped.indices.length} contentParts=${stripped.contentParts} encryptedContent=${stripped.encryptedContent}`,
        )
      }
    }

    if (!changed) {
      return {
        body,
        provider: route.provider,
        requestedModel: payload.model,
        upstreamModel: route.upstreamModel,
        isCompaction,
      }
    }

    return {
      body: JSON.stringify(nextPayload),
      isCompaction,
      provider: route.provider,
      requestedModel: payload.model,
      upstreamModel: route.upstreamModel,
    }
  } catch (error) {
    if (error instanceof SyntaxError)
      throw new HttpStatusError(
        400,
        "Responses request must be valid JSON",
        "invalid_model",
      )
    throw error
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
