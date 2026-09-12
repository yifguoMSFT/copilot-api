/**
 * Standalone loopback bridge: Responses in, Google Interactions v1 out.
 *
 * Test-only by design. It reuses the offline converters, is never imported by
 * copilot-api routing, and keeps no session or credential state beyond the
 * process environment. See [[GEMINI_INTERACTIONS_V1_CODEX_CLI_TEST_PLAN_CN.md]].
 */
import { appendFile, mkdir } from "node:fs/promises"
import { dirname } from "node:path"

import {
  convertInteractionsResponseToResponses,
  convertResponsesRequestToInteractions,
  type JsonObject,
  type ToolIdentity,
} from "../src/services/interactions/convert"
import { createInteractionsEventStream } from "../src/services/interactions/stream"

const GOOGLE_INTERACTIONS_URL =
  "https://generativelanguage.googleapis.com/v1/interactions"
const PLACEHOLDER = /^<.*>$/
const DEFAULT_MODEL = "gemini-3.8-flash"
const DEFAULT_BODY_LIMIT = 4 * 1024 * 1024
const DEFAULT_HEADER_TIMEOUT_MS = 120_000
const DEFAULT_IDLE_TIMEOUT_MS = 60_000
const SAMPLE_TEXT =
  "[bridge sample mode] no upstream call was made; this is not a Gemini result"

/** Minimal fetch surface so tests can stub upstream calls without Bun extras. */
export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>

export interface BridgeOptions {
  /** `sample` never calls upstream and needs no key; `live` calls Google. */
  mode: "sample" | "live"
  /** Local bearer token the CLI sends; unrelated to the upstream credential. */
  token: string
  upstreamModel?: string
  upstreamUrl?: string
  apiKey?: string
  recordPath?: string
  fetchImpl?: FetchLike
  bodyLimit?: number
  headerTimeoutMs?: number
  idleTimeoutMs?: number
}

type Recorder = (entry: JsonObject) => void

function headersOf(headers: Headers): JsonObject {
  const result: JsonObject = {}
  for (const [key, value] of headers) result[key] = value
  return result
}

/**
 * Local single-user logging. Every value is written exactly as it was received
 * or sent, including credentials, signatures and replay data; the file is kept
 * outside version control. Writes stay on one chain so the caller can await the
 * log before answering, and shutdown can drain it, instead of dropping a final
 * record when the process exits.
 */
let recordQueue: Promise<void> = Promise.resolve()

function createRecorder(path: string | undefined): Recorder {
  if (path === undefined) return () => {}
  const ready = mkdir(dirname(path), { recursive: true }).then(() => {})
  return (entry) => {
    const line = `${JSON.stringify(entry)}\n`
    recordQueue = recordQueue
      .then(() => ready)
      .then(() => appendFile(path, line))
      .catch((error: unknown) => {
        process.stderr.write(`bridge record failed: ${String(error)}\n`)
      })
  }
}

/** Waits for queued record writes; used before answering and on shutdown. */
export async function flushRecords(): Promise<void> {
  await recordQueue
}

function fail(status: number, code: string, message: string): Response {
  return Response.json(
    { error: { code, message, type: "invalid_request_error" } },
    { status },
  )
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function messageOf(value: unknown): string {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return ""
  const message = (value as JsonObject).message
  return typeof message === "string" ? message : ""
}

function codeOf(value: unknown, fallback: string): string {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return fallback
  const code = (value as JsonObject).code
  return typeof code === "string" && code !== "" ? code : fallback
}

function sessionId(request: Request): string | undefined {
  // Codex sends `session-id`; accept the underscore spelling used by earlier
  // drafts so either client is observed. It stays metadata and never reaches
  // the upstream body.
  const value =
    request.headers.get("session-id") ?? request.headers.get("session_id")
  return value === null || value === "" ? undefined : value
}

function sampleUpstream(stream: boolean, model: string, id: string): Response {
  const content = [{ type: "text", text: SAMPLE_TEXT }]
  const interaction = {
    id,
    model,
    object: "interaction",
    status: "completed",
    steps: [{ type: "model_output", content }],
  }
  if (!stream) return Response.json(interaction)
  const frames = [
    {
      event_type: "interaction.created",
      interaction: { id, model, status: "in_progress" },
    },
    { event_type: "step.start", index: 0, step: { type: "model_output" } },
    {
      event_type: "step.delta",
      index: 0,
      delta: { type: "text", text: SAMPLE_TEXT },
    },
    { event_type: "step.stop", index: 0 },
    { event_type: "interaction.completed", interaction },
  ]
  return new Response(
    frames.map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join(""),
    { headers: { "content-type": "text/event-stream" } },
  )
}

interface BridgeRuntime {
  mode: "sample" | "live"
  apiKey?: string
  record: Recorder
  fetchImpl: FetchLike
  upstreamModel: string
  upstreamUrl: string
  headerTimeoutMs: number
  idleTimeoutMs: number
  nextSampleId: () => string
  nextRequestId: () => string
}

interface UpstreamCall {
  id: string
  body: JsonObject
  stream: boolean
  signal: AbortSignal
}

interface ConverterOptions {
  requestedModel: string
  tools: ReadonlyMap<string, ToolIdentity>
}

interface JsonContext {
  id: string
  converterOptions: ConverterOptions
}

interface StreamContext {
  runtime: BridgeRuntime
  id: string
  request: Request
  upstream: Response
  converterOptions: ConverterOptions
  abort: AbortController
  onAbort: () => void
}

interface Attempt {
  id: string
  request: Request
  payload: unknown
  stream: boolean
  requestedModel: string
}

async function callUpstream(
  runtime: BridgeRuntime,
  call: UpstreamCall,
): Promise<Response> {
  if (runtime.mode === "sample")
    return sampleUpstream(
      call.stream,
      runtime.upstreamModel,
      runtime.nextSampleId(),
    )
  if (runtime.apiKey === undefined)
    throw new Error("live mode requires a Gemini API key")
  const headers = {
    "content-type": "application/json",
    accept: call.stream ? "text/event-stream" : "application/json",
    "x-goog-api-key": runtime.apiKey,
  }
  runtime.record({
    phase: "upstream_request",
    id: call.id,
    url: runtime.upstreamUrl,
    headers,
    body: call.body,
  })
  return runtime.fetchImpl(runtime.upstreamUrl, {
    method: "POST",
    // Never copy client credentials, and never follow a redirect that could
    // carry the upstream key to another host.
    redirect: "error",
    signal: call.signal,
    headers,
    body: JSON.stringify(call.body),
  })
}

async function upstreamError(
  runtime: BridgeRuntime,
  upstream: Response,
  id: string,
): Promise<Response> {
  const text = await upstream.text().catch(() => "")
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    parsed = undefined
  }
  const detail = (parsed as JsonObject | undefined)?.error
  const code = codeOf(detail, `upstream_${upstream.status}`)
  runtime.record({
    phase: "upstream_error",
    id,
    status: upstream.status,
    headers: headersOf(upstream.headers),
    body: text,
  })
  return fail(
    upstream.status,
    code,
    messageOf(detail) || "Upstream Interactions request failed",
  )
}

async function jsonResponse(
  runtime: BridgeRuntime,
  upstream: Response,
  context: JsonContext,
): Promise<Response> {
  const { id, converterOptions } = context
  const text = await upstream.text().catch(() => "")
  runtime.record({
    phase: "upstream_json",
    id,
    status: upstream.status,
    headers: headersOf(upstream.headers),
    body: text,
  })
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch (error) {
    return fail(502, "upstream_invalid_json", describe(error))
  }
  try {
    return Response.json(
      convertInteractionsResponseToResponses(json, converterOptions),
    )
  } catch (error) {
    return fail(502, "conversion_error", describe(error))
  }
}

function streamResponse(context: StreamContext): Response {
  const { runtime, id, request, upstream, converterOptions, abort, onAbort } =
    context
  const cleanup = () => request.signal.removeEventListener("abort", onAbort)
  const body = upstream.body as ReadableStream<Uint8Array> | null
  if (body === null) {
    cleanup()
    return fail(502, "upstream_empty_stream", "Upstream returned no stream")
  }
  const encoder = new TextEncoder()
  // Records what the converter is fed, so a stream that ends in failure is
  // still reconstructible from the log.
  const upstreamDecoder = new TextDecoder()
  const streamConverter = createInteractionsEventStream({
    ...converterOptions,
    createdAt: Math.floor(Date.now() / 1000),
  })
  const reader = body.getReader()
  let finished = false
  let cancelled = false
  let idleTimer: ReturnType<typeof setTimeout> | undefined
  const clearIdle = () => {
    if (idleTimer !== undefined) clearTimeout(idleTimer)
    idleTimer = undefined
  }
  const wire = new ReadableStream<Uint8Array>({
    start(controller) {
      const enqueue = (text: string) => {
        if (text === "") return
        runtime.record({ phase: "downstream_sse", id, text })
        controller.enqueue(encoder.encode(text))
      }
      const finish = async () => {
        if (finished) return
        finished = true
        clearIdle()
        enqueue(streamConverter.flush())
        runtime.record({
          phase: "stream_end",
          id,
          aborted: abort.signal.aborted,
        })
        cleanup()
        await flushRecords()
        if (!cancelled) controller.close()
      }
      const pump = async () => {
        try {
          for (;;) {
            clearIdle()
            idleTimer = setTimeout(() => abort.abort(), runtime.idleTimeoutMs)
            const { done, value } = await reader.read()
            if (done) break
            runtime.record({
              phase: "upstream_sse",
              id,
              text: upstreamDecoder.decode(value, { stream: true }),
            })
            enqueue(streamConverter.push(value))
          }
        } catch {
          // Exhausted or aborted streams fall through to finish(), which emits
          // response.failed unless a terminal event already arrived.
        }
        await finish()
      }
      void pump()
    },
    async cancel() {
      // The consumer is gone: stop the pump from closing an already-cancelled
      // controller and release the upstream reader.
      finished = true
      cancelled = true
      clearIdle()
      streamConverter.cancel()
      abort.abort()
      cleanup()
      await reader.cancel().catch(() => {})
    },
  })
  return new Response(wire, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-store",
    },
  })
}

async function respond(
  runtime: BridgeRuntime,
  attempt: Attempt,
): Promise<Response> {
  const { id, request, payload, stream, requestedModel } = attempt
  // Record before conversion so a rejected request is still diagnosable.
  runtime.record({
    phase: "inbound",
    id,
    mode: runtime.mode,
    stream,
    model: requestedModel,
    method: request.method,
    url: request.url,
    headers: headersOf(request.headers),
    body: payload,
  })
  let converted
  try {
    converted = convertResponsesRequestToInteractions(payload, {
      upstreamModel: runtime.upstreamModel,
      requestedModel,
      metadata:
        sessionId(request) === undefined ? undefined : (
          { "session-id": sessionId(request) as string }
        ),
    })
  } catch (error) {
    runtime.record({
      phase: "unsupported_request",
      id,
      message: describe(error),
    })
    return fail(400, "unsupported_request", describe(error))
  }
  runtime.record({
    phase: "converted",
    id,
    stream,
    metadata: converted.metadata,
    body: converted.body,
  })

  const abort = new AbortController()
  const onAbort = () => abort.abort()
  request.signal.addEventListener("abort", onAbort)
  const cleanup = () => request.signal.removeEventListener("abort", onAbort)
  const headerTimer = setTimeout(() => abort.abort(), runtime.headerTimeoutMs)
  let upstream: Response
  try {
    upstream = await callUpstream(runtime, {
      id,
      body: converted.body,
      stream,
      signal: abort.signal,
    })
  } catch (error) {
    clearTimeout(headerTimer)
    cleanup()
    runtime.record({
      phase: "upstream_unreachable",
      id,
      error: describe(error),
    })
    return fail(502, "upstream_unreachable", describe(error))
  }
  clearTimeout(headerTimer)

  if (!upstream.ok) {
    cleanup()
    return await upstreamError(runtime, upstream, id)
  }
  const converterOptions: ConverterOptions = {
    requestedModel,
    tools: converted.tools,
  }
  if (!stream) {
    cleanup()
    return await jsonResponse(runtime, upstream, { id, converterOptions })
  }
  return streamResponse({
    runtime,
    id,
    request,
    upstream,
    converterOptions,
    abort,
    onAbort,
  })
}

export function createBridgeHandler(
  options: BridgeOptions,
): (request: Request) => Promise<Response> {
  let counter = 0
  const runtime: BridgeRuntime = {
    mode: options.mode,
    apiKey: options.apiKey,
    record: createRecorder(options.recordPath),
    fetchImpl: options.fetchImpl ?? fetch,
    upstreamModel: options.upstreamModel ?? DEFAULT_MODEL,
    upstreamUrl: options.upstreamUrl ?? GOOGLE_INTERACTIONS_URL,
    headerTimeoutMs: options.headerTimeoutMs ?? DEFAULT_HEADER_TIMEOUT_MS,
    idleTimeoutMs: options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS,
    nextSampleId: () => `sample_${++counter}`,
    nextRequestId: () => `req_${++counter}`,
  }
  const bodyLimit = options.bodyLimit ?? DEFAULT_BODY_LIMIT

  return async (request) => {
    const id = runtime.nextRequestId()
    const url = new URL(request.url)
    if (request.method === "GET" && url.pathname === "/health")
      return Response.json({
        ok: true,
        mode: options.mode,
        upstreamModel: runtime.upstreamModel,
      })
    if (url.pathname !== "/v1/responses")
      return fail(404, "not_found", "Only POST /v1/responses is served")
    if (request.method !== "POST")
      return fail(405, "method_not_allowed", "Use POST /v1/responses")
    if (request.headers.get("upgrade") !== null)
      return fail(
        400,
        "websocket_unsupported",
        "WebSocket upgrades are not supported",
      )
    if (request.headers.get("authorization") !== `Bearer ${options.token}`)
      return fail(401, "invalid_token", "Missing or invalid local token")
    const declared = Number(request.headers.get("content-length") ?? "0")
    if (Number.isFinite(declared) && declared > bodyLimit)
      return fail(413, "request_too_large", "Request body exceeds limit")
    const text = await request.text()
    if (Buffer.byteLength(text) > bodyLimit)
      return fail(413, "request_too_large", "Request body exceeds limit")
    let payload: unknown
    try {
      payload = JSON.parse(text)
    } catch {
      runtime.record({ phase: "invalid_json", id, body: text })
      await flushRecords()
      return fail(400, "invalid_json", "Request body must be JSON")
    }
    const model =
      (
        payload !== null
        && typeof payload === "object"
        && !Array.isArray(payload)
        && typeof (payload as JsonObject).model === "string"
      ) ?
        ((payload as JsonObject).model as string)
      : runtime.upstreamModel
    const response = await respond(runtime, {
      id,
      request,
      payload,
      stream: (payload as JsonObject).stream === true,
      requestedModel: model,
    })
    // The records for this request are the debugging contract; do not answer
    // while they are still queued.
    await flushRecords()
    return response
  }
}

async function readJsonFile(path: string, label: string): Promise<unknown> {
  let raw: string
  try {
    raw = await Bun.file(path).text()
  } catch {
    throw new Error(`Cannot read ${label}: ${path}`)
  }
  try {
    return JSON.parse(raw)
  } catch {
    throw new Error(`${label} is not JSON: ${path}`)
  }
}

function requireSetting(value: unknown, label: string): string {
  if (typeof value !== "string" || value === "" || PLACEHOLDER.test(value))
    throw new Error(`${label} is missing or still a placeholder`)
  return value
}

export async function readApiKey(keyFilePath: string): Promise<string> {
  const parsed = await readJsonFile(keyFilePath, "key file")
  const key =
    parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ?
      (parsed as JsonObject).gemini_api_key
    : undefined
  return requireSetting(key, `gemini_api_key in ${keyFilePath}`)
}

async function main(): Promise<void> {
  const mode =
    process.env.INTERACTIONS_BRIDGE_MODE === "live" ? "live" : "sample"
  const token = process.env.INTERACTIONS_TEST_TOKEN
  if (token === undefined || token.length < 16)
    throw new Error(
      "Set INTERACTIONS_TEST_TOKEN to a local throwaway token (16+ chars)",
    )
  const port = Number(process.env.INTERACTIONS_BRIDGE_PORT ?? "4830")
  const keyFile =
    process.env.INTERACTIONS_KEY_FILE ?? "scripts/interactions-codex-live.local"
  // Resolve the credential before listening so a placeholder fails first.
  const apiKey = mode === "live" ? await readApiKey(keyFile) : undefined
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port,
    fetch: createBridgeHandler({
      mode,
      token,
      apiKey,
      upstreamModel: process.env.INTERACTIONS_UPSTREAM_MODEL,
      recordPath: process.env.INTERACTIONS_RECORD_PATH,
    }),
  })
  process.stdout.write(
    `interactions bridge: http://127.0.0.1:${server.port}/v1/responses mode=${mode}\n`,
  )
  // Drain queued records on a normal stop instead of losing the last request.
  for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.on(signal, () => {
      void flushRecords().finally(() => process.exit(0))
    })
}

if (import.meta.main) await main()
