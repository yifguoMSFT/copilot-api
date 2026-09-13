/**
 * Explicit opt-in live test for the Antigravity auth proxy.
 *
 * The runner starts the same server the `serve` command starts
 * (`createAntigravityProxyServer`) against the real Cloud Code origin, drives
 * native `v1internal:*` requests through it, and writes the raw request and
 * response bytes next to a report. The request envelopes below belong to the
 * test client: this file performs no protocol conversion and is never imported
 * by copilot-api routing. See [[ANTIGRAVITY_ENDPOINT_LIVE_TEST_PLAN_CN.md]].
 */
import type { IncomingHttpHeaders, Server } from "node:http"

import { randomUUID } from "node:crypto"
import { mkdir, writeFile } from "node:fs/promises"
import { request as httpRequest } from "node:http"
import { homedir, tmpdir } from "node:os"
import { join } from "node:path"

import {
  ANTIGRAVITY_ENDPOINTS,
  type AntigravityFetch,
  AntigravityCredentialStore,
} from "../src/services/antigravity/auth"
import { createAntigravityProxyServer } from "../src/services/antigravity/proxy"

export const DEFAULT_CREDENTIAL_PATH = join(
  homedir(),
  ".cli-proxy-api",
  "antigravity.json",
)
export const DEFAULT_UPSTREAM_ORIGIN = ANTIGRAVITY_ENDPOINTS.daily
export const DEFAULT_TIMEOUT_MS = 120_000
/** Preferred model for the text checks, in order. */
export const PREFERRED_MODELS = ["gemini-3.8-flash-medium"]

const LOAD_CODE_ASSIST_PATH = "/v1internal:loadCodeAssist"
const FETCH_MODELS_PATH = "/v1internal:fetchAvailableModels"
const GENERATE_PATH = "/v1internal:generateContent"
const STREAM_PATH = "/v1internal:streamGenerateContent?alt=sse"

type JsonValue =
  | boolean
  | null
  | number
  | string
  | Array<JsonValue>
  | { [key: string]: JsonValue }

type JsonObject = { [key: string]: JsonValue }

export type StepStatus = "fail" | "pass"

export interface StepResult {
  id: string
  status: StepStatus
  detail: string
  evidence: Array<string>
}

export interface LiveTestReport {
  credentialPath: string
  evidenceDir: string
  finishedAt: string
  model: null | string
  projectId: null | string
  runId: string
  startedAt: string
  steps: Array<StepResult>
  upstreamOrigin: string
}

export interface LiveTestOptions {
  credentialPath?: string
  evidenceDir?: string
  model?: string
  timeoutMs?: number
  /** Token endpoint transport; tests inject their own, production uses fetch. */
  tokenFetch?: AntigravityFetch
  upstreamOrigin?: string
}

class StepFailure extends Error {
  constructor(message: string) {
    super(message)
    this.name = "StepFailure"
  }
}

interface ProxyResponse {
  bytes: Buffer
  evidence: Array<string>
  headers: IncomingHttpHeaders
  status: number
}

interface ProxyClient {
  post(name: string, path: string, body: JsonObject): Promise<ProxyResponse>
}

interface StepOutcome {
  detail: string
  evidence: Array<string>
}

interface StepContext {
  availableModels: Array<string>
  client: ProxyClient
  contents: Array<JsonValue>
  credentialPath: string
  evidenceDir: string
  makeClient: (port: number) => ProxyClient
  marker: string
  model: string
  optionsModel: string | undefined
  projectId: string
  sessionId: string
  tokenFetch: AntigravityFetch | undefined
  upstreamOrigin: string
}

type Step = (context: StepContext) => Promise<StepOutcome>

interface RecordedExchange {
  body: JsonObject
  name: string
  path: string
  response: {
    bytes: Buffer
    durationMs: number
    headers: IncomingHttpHeaders
    status: number
  }
}

type Recorder = (exchange: RecordedExchange) => Promise<Array<string>>

function asObject(value: JsonValue | undefined): JsonObject | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return undefined
  return value
}

function descriptionOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function headerOf(headers: IncomingHttpHeaders, name: string): string {
  const value = headers[name]
  if (value === undefined) return ""
  return Array.isArray(value) ? value.join(", ") : value
}

function headerRecord(headers: IncomingHttpHeaders): JsonObject {
  const record: JsonObject = {}
  for (const name of Object.keys(headers))
    record[name] = headerOf(headers, name)
  return record
}

function tryParse(text: string): JsonObject | undefined {
  try {
    return asObject(JSON.parse(text) as JsonValue)
  } catch {
    return undefined
  }
}

/** Cloud Code wraps the generation payload in `response`. */
function unwrap(value: JsonObject): JsonObject {
  return asObject(value.response) ?? value
}

/** Accepts the bare JSON the Cloud Code origin returns as well as SSE frames. */
function jsonFrames(bytes: Buffer): Array<JsonObject> {
  const text = bytes.toString("utf8").trim()
  if (text === "") return []
  const whole = tryParse(text)
  if (whole !== undefined) return [unwrap(whole)]
  const frames: Array<JsonObject> = []
  for (const line of text.split("\n")) {
    const trimmed = line.trim()
    if (trimmed === "") continue
    const payload =
      trimmed.startsWith("data:") ? trimmed.slice(5).trim() : trimmed
    if (payload === "" || payload === "[DONE]") continue
    const parsed = tryParse(payload)
    if (parsed !== undefined) frames.push(unwrap(parsed))
  }
  return frames
}

function candidateContents(payload: JsonObject): Array<JsonValue> {
  const candidates = payload.candidates
  if (!Array.isArray(candidates)) return []
  const contents: Array<JsonValue> = []
  for (const candidate of candidates) {
    const content = asObject(candidate)?.content
    if (content !== undefined) contents.push(content)
  }
  return contents
}

function textOf(payload: JsonObject): string {
  const candidates = payload.candidates
  if (!Array.isArray(candidates)) return ""
  const out: Array<string> = []
  for (const candidate of candidates) {
    const parts = asObject(asObject(candidate)?.content)?.parts
    if (!Array.isArray(parts)) continue
    for (const part of parts) {
      const text = asObject(part)?.text
      if (typeof text === "string") out.push(text)
    }
  }
  return out.join("")
}

function collectText(frames: Array<JsonObject>): string {
  return frames.map((frame) => textOf(frame)).join("")
}

function requireStatus(response: ProxyResponse, name: string): void {
  if (response.status < 200 || response.status >= 300)
    throw new StepFailure(
      `${name} returned ${response.status}: ${response.bytes.toString("utf8").slice(0, 400)}`,
    )
}

/** Keeps every byte the client sent and received, with no redaction. */
function createRecorder(directory: string): Recorder {
  return async ({ body, name, path, response }) => {
    const requestFile = `${name}.request.json`
    const responseFile = `${name}.response.bin`
    const metaFile = `${name}.meta.json`
    const meta: JsonObject = {
      contentType: headerOf(response.headers, "content-type"),
      durationMs: response.durationMs,
      headers: headerRecord(response.headers),
      path,
      status: response.status,
    }
    await writeFile(
      join(directory, requestFile),
      `${JSON.stringify({ body, path }, null, 2)}\n`,
    )
    await writeFile(join(directory, responseFile), response.bytes)
    await writeFile(
      join(directory, metaFile),
      `${JSON.stringify(meta, null, 2)}\n`,
    )
    return [requestFile, responseFile, metaFile]
  }
}

function createClient(options: {
  port: number
  record: Recorder
  timeoutMs: number
}): ProxyClient {
  const { port, record, timeoutMs } = options
  const post: ProxyClient["post"] = (name, path, body) => {
    const payload = Buffer.from(JSON.stringify(body))
    const startedAt = Date.now()
    return new Promise<ProxyResponse>((resolve, reject) => {
      const request = httpRequest(
        {
          agent: false,
          headers: {
            "content-length": payload.length,
            "content-type": "application/json",
          },
          host: "127.0.0.1",
          method: "POST",
          path,
          port,
        },
        (response) => {
          const chunks: Array<Buffer> = []
          response.on("data", (chunk: Buffer) => chunks.push(chunk))
          response.on("error", reject)
          response.on("end", () => {
            const received = {
              bytes: Buffer.concat(chunks),
              durationMs: Date.now() - startedAt,
              headers: response.headers,
              status: response.statusCode ?? 0,
            }
            void record({ body, name, path, response: received })
              .then((evidence) => resolve({ ...received, evidence }))
              .catch(reject)
          })
        },
      )
      request.setTimeout(timeoutMs, () => {
        request.destroy(new Error(`no response within ${timeoutMs} ms`))
      })
      request.on("error", reject)
      request.end(payload)
    })
  }
  return { post }
}

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => resolve())
  })
  const address = server.address()
  if (address === null || typeof address === "string")
    throw new StepFailure("proxy did not report a TCP port")
  return address.port
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve) => {
    server.close(() => resolve())
  })
}

function createStore(
  credentialPath: string,
  tokenFetch: AntigravityFetch | undefined,
): AntigravityCredentialStore {
  return new AntigravityCredentialStore(
    credentialPath,
    tokenFetch === undefined ? {} : { fetchImpl: tokenFetch },
  )
}

function generationBody(options: {
  contents: Array<JsonValue>
  model: string
  projectId: string
  sessionId: string
}): JsonObject {
  return {
    model: options.model,
    project: options.projectId,
    request: { contents: options.contents, sessionId: options.sessionId },
    requestId: `agent-${randomUUID()}`,
    requestType: "agent",
    userAgent: "antigravity",
  }
}

function projectIdOf(payload: JsonObject): string {
  for (const key of ["cloudaicompanionProject", "projectId", "project"]) {
    const value = payload[key]
    if (typeof value === "string" && value.trim() !== "") return value.trim()
    const nested = asObject(value)?.id
    if (typeof nested === "string" && nested.trim() !== "") return nested.trim()
  }
  return ""
}

function modelIdsOf(payload: JsonObject): Array<string> {
  const models = asObject(payload.models)
  return models === undefined ? [] : Object.keys(models)
}

function selectModel(
  requested: string | undefined,
  available: Array<string>,
): string {
  if (requested !== undefined && requested.trim() !== "") {
    if (!available.includes(requested))
      throw new StepFailure(
        `requested model ${requested} is not in the account model list`,
      )
    return requested
  }
  for (const candidate of PREFERRED_MODELS)
    if (available.includes(candidate)) return candidate
  throw new StepFailure(
    `none of the preferred models (${PREFERRED_MODELS.join(", ")}) is in the account model list; pass --model explicitly`,
  )
}

function lastChecked(text: string): string {
  return JSON.stringify(text.slice(0, 80))
}

const stepLoadCodeAssist: Step = async (context) => {
  const response = await context.client.post(
    "load-code-assist",
    LOAD_CODE_ASSIST_PATH,
    { metadata: { ideType: "ANTIGRAVITY" } },
  )
  requireStatus(response, "loadCodeAssist")
  const projectId = projectIdOf(jsonFrames(response.bytes)[0] ?? {})
  Object.assign(context, { projectId })
  return {
    detail:
      projectId === "" ?
        `status ${response.status}; no project in the response`
      : `status ${response.status}; project ${projectId}`,
    evidence: response.evidence,
  }
}

const stepFetchModels: Step = async (context) => {
  const response = await context.client.post(
    "fetch-available-models",
    FETCH_MODELS_PATH,
    context.projectId === "" ? {} : { project: context.projectId },
  )
  requireStatus(response, "fetchAvailableModels")
  const availableModels = modelIdsOf(jsonFrames(response.bytes)[0] ?? {})
  if (availableModels.length === 0)
    throw new StepFailure("fetchAvailableModels returned no models")
  Object.assign(context, { availableModels })
  return {
    detail: `status ${response.status}; ${availableModels.length} models`,
    evidence: response.evidence,
  }
}

const stepNonStreaming: Step = async (context) => {
  context.model = selectModel(context.optionsModel, context.availableModels)
  const response = await context.client.post(
    "generate-content",
    GENERATE_PATH,
    generationBody(context),
  )
  requireStatus(response, "generateContent")
  const payload = jsonFrames(response.bytes)[0] ?? {}
  const text = textOf(payload)
  if (text.trim() === "")
    throw new StepFailure("generateContent returned no candidate text")
  context.contents = [...context.contents, ...candidateContents(payload)]
  return {
    detail: `status ${response.status}; model ${context.model}; text ${lastChecked(text)}`,
    evidence: response.evidence,
  }
}

const simpleTurn = [
  { parts: [{ text: "Reply with exactly pong." }], role: "user" },
]

const stepStreaming: Step = async (context) => {
  if (context.model === "") throw new StepFailure("no model was selected")
  const response = await context.client.post(
    "stream-generate-content",
    STREAM_PATH,
    generationBody({ ...context, contents: simpleTurn }),
  )
  requireStatus(response, "streamGenerateContent")
  const contentType = headerOf(response.headers, "content-type")
  if (!contentType.includes("event-stream"))
    throw new StepFailure(
      `streamGenerateContent did not answer with event-stream (content-type: ${contentType})`,
    )
  const frames = jsonFrames(response.bytes)
  if (frames.length === 0)
    throw new StepFailure("streamGenerateContent returned no parseable frames")
  return {
    detail: `status ${response.status}; ${frames.length} frames; text ${lastChecked(collectText(frames))}`,
    evidence: response.evidence,
  }
}

const stepContinuation: Step = async (context) => {
  if (context.model === "") throw new StepFailure("no model was selected")
  const ask =
    "Which marker did I ask you to remember? Reply with only the marker."
  const response = await context.client.post(
    "generate-continuation",
    GENERATE_PATH,
    generationBody({
      ...context,
      contents: [...context.contents, { parts: [{ text: ask }], role: "user" }],
    }),
  )
  requireStatus(response, "continuation generateContent")
  const text = textOf(jsonFrames(response.bytes)[0] ?? {})
  if (!text.includes(context.marker))
    throw new StepFailure(
      `continuation did not reuse the earlier turn; marker ${context.marker} missing from ${lastChecked(text)}`,
    )
  return {
    detail: `status ${response.status}; marker ${context.marker} reused`,
    evidence: response.evidence,
  }
}

const stepRefresh: Step = async (context) => {
  const raw = JSON.parse(
    await Bun.file(context.credentialPath).text(),
  ) as JsonObject
  if (typeof raw.refresh_token !== "string" || raw.refresh_token === "")
    throw new StepFailure("credential has no refresh_token to exchange")
  const copyPath = join(context.evidenceDir, "refresh-credential.json")
  await writeFile(
    copyPath,
    `${JSON.stringify({ ...raw, expired: "2020-01-01T00:00:00.000Z" }, null, 2)}\n`,
  )
  const copyServer = createAntigravityProxyServer({
    credentialStore: createStore(copyPath, context.tokenFetch),
    host: "127.0.0.1",
    upstreamOrigin: context.upstreamOrigin,
  })
  const copyPort = await listen(copyServer)
  try {
    const response = await context.makeClient(copyPort).post(
      "refresh-generate-content",
      GENERATE_PATH,
      generationBody({
        ...context,
        contents: simpleTurn,
        model: context.model === "" ? PREFERRED_MODELS[0] : context.model,
      }),
    )
    requireStatus(response, "refreshed generateContent")
    const refreshed = JSON.parse(await Bun.file(copyPath).text()) as JsonObject
    const expired = refreshed.expired
    if (typeof expired !== "string" || Date.parse(expired) <= Date.now())
      throw new StepFailure(
        `the credential copy was not refreshed (expired: ${JSON.stringify(expired)})`,
      )
    return {
      detail: `status ${response.status}; refreshed expiry ${expired}`,
      evidence: [...response.evidence, "refresh-credential.json"],
    }
  } finally {
    await closeServer(copyServer)
  }
}

const stepInvalidRequest: Step = async (context) => {
  const response = await context.client.post(
    "invalid-request",
    GENERATE_PATH,
    {},
  )
  if (response.status < 400 || response.status >= 500)
    throw new StepFailure(
      `an empty generation body answered ${response.status}; expected the upstream client error to pass through`,
    )
  return {
    detail: `status ${response.status}; upstream error kept as is`,
    evidence: response.evidence,
  }
}

async function runStep(
  context: StepContext,
  id: string,
  step: Step,
): Promise<StepResult> {
  try {
    const outcome = await step(context)
    return { ...outcome, id, status: "pass" }
  } catch (error) {
    return { detail: descriptionOf(error), evidence: [], id, status: "fail" }
  }
}

/**
 * Runs every live check against one proxy instance and returns the report.
 * Nothing is thrown for a failed step, so the report always describes all the
 * checks that ran.
 */
export async function runAntigravityLiveTest(
  options: LiveTestOptions = {},
): Promise<LiveTestReport> {
  const upstreamOrigin = options.upstreamOrigin ?? DEFAULT_UPSTREAM_ORIGIN
  const credentialPath = options.credentialPath ?? DEFAULT_CREDENTIAL_PATH
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const startedAt = new Date().toISOString()
  const runId = startedAt.replaceAll(/[:.]/g, "-")
  const evidenceDir =
    options.evidenceDir ?? join(tmpdir(), "antigravity-proxy-live", runId)
  await mkdir(evidenceDir, { recursive: true })

  const record = createRecorder(evidenceDir)
  const makeClient = (port: number): ProxyClient =>
    createClient({ port, record, timeoutMs })
  const server = createAntigravityProxyServer({
    credentialStore: createStore(credentialPath, options.tokenFetch),
    host: "127.0.0.1",
    upstreamOrigin,
  })
  const port = await listen(server)
  const marker = randomUUID().slice(0, 8)
  const context: StepContext = {
    availableModels: [],
    client: makeClient(port),
    contents: [
      {
        parts: [{ text: `Remember this marker: ${marker}. Reply with OK.` }],
        role: "user",
      },
    ],
    credentialPath,
    evidenceDir,
    makeClient,
    marker,
    model: "",
    optionsModel: options.model,
    projectId: "",
    sessionId: `-${Date.now()}`,
    tokenFetch: options.tokenFetch,
    upstreamOrigin,
  }

  const steps: Array<StepResult> = []
  const plan: Array<[string, Step]> = [
    ["metadata.loadCodeAssist", stepLoadCodeAssist],
    ["metadata.fetchAvailableModels", stepFetchModels],
    ["generate.nonStreaming", stepNonStreaming],
    ["generate.streaming", stepStreaming],
    ["generate.continuation", stepContinuation],
    ["credential.refresh", stepRefresh],
    ["error.invalidRequest", stepInvalidRequest],
  ]
  try {
    for (const [id, step] of plan) steps.push(await runStep(context, id, step))
  } finally {
    await closeServer(server)
  }

  const report: LiveTestReport = {
    credentialPath,
    evidenceDir,
    finishedAt: new Date().toISOString(),
    model: context.model === "" ? null : context.model,
    projectId: context.projectId === "" ? null : context.projectId,
    runId,
    startedAt,
    steps,
    upstreamOrigin,
  }
  await writeFile(
    join(evidenceDir, "report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  )
  return report
}

export function formatReport(report: LiveTestReport): string {
  const lines = [
    `Antigravity endpoint live test ${report.runId}`,
    `upstream   ${report.upstreamOrigin}`,
    `credential ${report.credentialPath}`,
    `evidence   ${report.evidenceDir}`,
    `project    ${report.projectId ?? "<none>"}`,
    `model      ${report.model ?? "<none>"}`,
    "",
  ]
  for (const step of report.steps)
    lines.push(`${step.status.padEnd(4)} ${step.id}: ${step.detail}`)
  const failed = report.steps.filter((step) => step.status === "fail").length
  lines.push("", failed === 0 ? "result: pass" : `result: fail (${failed})`)
  return `${lines.join("\n")}\n`
}

export function parseLiveTestArgs(
  argv: ReadonlyArray<string>,
): LiveTestOptions {
  if (argv.length % 2 !== 0)
    throw new StepFailure(`${argv.at(-1) ?? "the last option"} needs a value.`)
  const options: LiveTestOptions = {}
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index]
    const value = argv[index + 1]
    switch (flag) {
      case "--credential-file": {
        options.credentialPath = value
        break
      }
      case "--evidence-dir": {
        options.evidenceDir = value
        break
      }
      case "--model": {
        options.model = value
        break
      }
      case "--timeout-ms": {
        options.timeoutMs = Number(value)
        break
      }
      case "--upstream": {
        options.upstreamOrigin = value
        break
      }
      default: {
        throw new StepFailure(`unknown option ${flag}.`)
      }
    }
  }
  return options
}

export function liveTestExitCode(report: LiveTestReport): number {
  return report.steps.some((step) => step.status === "fail") ? 1 : 0
}

if (import.meta.main) {
  try {
    const report = await runAntigravityLiveTest(
      parseLiveTestArgs(process.argv.slice(2)),
    )
    process.stdout.write(formatReport(report))
    process.exitCode = liveTestExitCode(report)
  } catch (error) {
    process.stderr.write(`live test failed to start: ${descriptionOf(error)}\n`)
    process.exitCode = 1
  }
}
