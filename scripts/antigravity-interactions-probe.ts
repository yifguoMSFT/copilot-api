import { randomUUID } from "node:crypto"
/**
 * Probe whether the Antigravity Cloud Code upstream exposes an `interactions`
 * RPC under `v1internal`, the same way it exposes `generateContent`.
 *
 * The probe is read-only: every candidate is called with a tiny payload and the
 * response is recorded verbatim. Two control calls calibrate the upstream's
 * 404 semantics:
 *
 * - `v1internal:generateContent` is known to exist, so a 400 here means
 *   "method routed, payload rejected".
 * - `v1internal:thisMethodDoesNotExist` is known to be absent, so its status
 *   and body define what a missing method looks like on this host.
 */
import { mkdir, writeFile } from "node:fs/promises"
import { homedir, tmpdir } from "node:os"
import { join } from "node:path"

import {
  ANTIGRAVITY_ENDPOINTS,
  ANTIGRAVITY_USER_AGENT,
  AntigravityCredentialStore,
  type AntigravityCredential,
} from "../src/services/antigravity/auth"

export const DEFAULT_CREDENTIAL_PATH = join(
  homedir(),
  ".cli-proxy-api",
  "antigravity.json",
)
export const DEFAULT_ORIGIN = ANTIGRAVITY_ENDPOINTS.daily
export const PROBE_TIMEOUT_MS = 30_000

export interface ProbeCandidate {
  /** Short id used in the report. */
  id: string
  method: "GET" | "POST"
  /** Path appended to the origin, e.g. `/v1internal:interactions`. */
  path: string
  /** Overrides the probe origin, used to test the prod host from the same run. */
  origin?: string
  /** Body shape to send; `none` sends no body. */
  payload: "envelope" | "interactions" | "empty" | "none"
  /** Why this candidate is worth probing. */
  rationale: string
}

const PRIMARY: Array<ProbeCandidate> = [
  {
    id: "control.generateContent",
    method: "POST",
    path: `/v1internal:generateContent`,
    payload: "envelope",
    rationale:
      "Known-present control: calibrates what a routed method returns.",
  },
  {
    id: "control.loadCodeAssist",
    method: "POST",
    path: `/v1internal:loadCodeAssist`,
    payload: "envelope",
    rationale:
      "Second known-present control (used by the login flow), so one 404 is not mistaken for a routing rule.",
  },
  {
    id: "control.absentMethod",
    method: "POST",
    path: `/v1internal:thisMethodDoesNotExist`,
    payload: "envelope",
    rationale: "Known-absent control: calibrates the missing-method response.",
  },
  {
    id: "control.fetchAvailableModels",
    method: "POST",
    path: `/v1internal:fetchAvailableModels`,
    payload: "empty",
    rationale:
      "Known-present control used by CLIProxyAPI; its catalog also shows which upstream capabilities exist.",
  },
  {
    id: "rpc.interactions",
    method: "POST",
    path: `/v1internal:interactions`,
    payload: "interactions",
    rationale:
      "CLIProxyAPI's Gemini executor posts native Interactions requests to `<base>/<version>/interactions`.",
  },
  {
    id: "rpc.interactions.altSse",
    method: "POST",
    path: `/v1internal:interactions?alt=sse`,
    payload: "interactions",
    rationale:
      "The known live endpoint is `streamGenerateContent?alt=sse`; the same query may select a streaming variant.",
  },
  {
    id: "rpc.streamInteractions",
    method: "POST",
    path: `/v1internal:streamInteractions`,
    payload: "interactions",
    rationale:
      "Mirrors the `streamGenerateContent` naming pattern for a streaming Interactions variant.",
  },
  {
    id: "rpc.createInteraction",
    method: "POST",
    path: `/v1internal:createInteraction`,
    payload: "interactions",
    rationale: "Interactions API create-call naming under the RPC style.",
  },
  {
    id: "rpc.createInteractions",
    method: "POST",
    path: `/v1internal:createInteractions`,
    payload: "interactions",
    rationale:
      "Plural create-call naming, mirroring how method names are registered.",
  },
  {
    id: "rpc.generateInteraction",
    method: "POST",
    path: `/v1internal:generateInteraction`,
    payload: "interactions",
    rationale: "Singular generate-call naming.",
  },
  {
    id: "rpc.streamInteraction",
    method: "POST",
    path: `/v1internal:streamInteraction`,
    payload: "interactions",
    rationale: "Singular streaming naming.",
  },
  {
    id: "path.interactions",
    method: "POST",
    path: `/v1internal/interactions`,
    payload: "interactions",
    rationale:
      "Path style used by the public Gemini API (`/v1beta/interactions`) rather than the colon RPC style.",
  },
  {
    id: "path.interactions.v1beta",
    method: "POST",
    path: `/v1beta/interactions`,
    payload: "interactions",
    rationale: "Public Gemini Interactions path, in case the host mirrors it.",
  },
  {
    id: "get.rpc.interactions",
    method: "GET",
    path: `/v1internal:interactions`,
    payload: "none",
    rationale:
      "Probes for a GET/list-shaped Interactions RPC in case the verb is not POST.",
  },
]

const prodInteractions: ProbeCandidate = {
  id: "prod.rpc.interactions",
  method: "POST",
  path: `/v1internal:interactions`,
  origin: ANTIGRAVITY_ENDPOINTS.prod,
  payload: "interactions",
  rationale:
    "The daily host may lag the prod host, which the login flow also touches.",
}

const discovery: Array<ProbeCandidate> = [
  {
    id: "discovery.rest.v1internal",
    method: "GET",
    path: `/$discovery/rest?version=v1internal`,
    payload: "none",
    rationale:
      "A Google discovery document would list every registered method authoritatively.",
  },
  {
    id: "discovery.list",
    method: "GET",
    path: `/$discovery/list`,
    payload: "none",
    rationale: "Directory of discovery documents for this host, if exposed.",
  },
]

export const PROBE_CANDIDATES: Array<ProbeCandidate> = [
  ...PRIMARY,
  prodInteractions,
  ...discovery,
]

export interface ProbeResult {
  id: string
  method: string
  url: string
  rationale: string
  status: number | null
  contentType: string | null
  /** `present`, `absent`, `auth`, `error`, or `unreachable`. */
  verdict: ProbeVerdict
  /** Full response body, unredacted; local single-user diagnostics. */
  body: string
  error?: string
}

export type ProbeVerdict =
  | "present"
  | "absent"
  | "auth"
  | "error"
  | "unreachable"

export interface ProbeReport {
  runId: string
  startedAt: string
  finishedAt: string
  origin: string
  projectId: string
  email: string
  evidenceDir: string
  results: Array<ProbeResult>
}

function buildBody(
  payload: ProbeCandidate["payload"],
  model: string,
  projectId: string,
): string | undefined {
  if (payload === "none") return undefined
  if (payload === "empty") return "{}"
  if (payload === "interactions") {
    return JSON.stringify({
      model,
      input: [
        { type: "user_input", content: [{ type: "text", text: "ping" }] },
      ],
      store: false,
      stream: false,
    })
  }
  return JSON.stringify({
    model,
    project: projectId,
    request: {
      contents: [{ role: "user", parts: [{ text: "ping" }] }],
    },
    requestId: `probe-${randomUUID()}`,
    requestType: "agent",
    userAgent: "antigravity",
  })
}

/**
 * Classifies a probe response. A routed-but-rejected payload (usually 400) is
 * evidence the method exists, while the control call's body defines how this
 * host reports a missing method.
 */
export function classifyProbe(
  status: number | null,
  body: string,
  absentMethodBody: string,
): ProbeVerdict {
  if (status === null) return "unreachable"
  if (status >= 200 && status < 300) return "present"
  if (status === 401 || status === 403 || status === 407) return "auth"

  const normalized = body.toLowerCase()
  if (!looksLikeMissingMethod(normalized)) {
    // Routed methods report payload problems as structured JSON, so show the
    // remaining non-missing statuses before falling back to `error`.
    if (status === 400 || status === 422) return "present"
    return status === 404 ? "absent" : "error"
  }
  // A body identical to the known-absent control means the host answered both
  // calls the same way.
  if (
    absentMethodBody !== ""
    && normalized === absentMethodBody.toLowerCase()
  ) {
    return "absent"
  }
  return "absent"
}

const MISSING_METHOD_MARKERS = [
  "method not found",
  "unknown method",
  "is not found",
  '"not found"',
] as const

function looksLikeMissingMethod(lowercasedBody: string): boolean {
  return MISSING_METHOD_MARKERS.some((marker) =>
    lowercasedBody.includes(marker),
  )
}

interface ProbeContext {
  origin: string
  model: string
  projectId: string
  accessToken: string
  fetchImpl: (input: string, init: RequestInit) => Promise<Response>
}

async function executeProbe(
  candidate: ProbeCandidate,
  context: ProbeContext,
  absentMethodBody: string,
): Promise<ProbeResult> {
  const url = `${(candidate.origin ?? context.origin).replace(/\/+$/u, "")}${candidate.path}`
  const body = buildBody(candidate.payload, context.model, context.projectId)
  const init: RequestInit = {
    method: candidate.method,
    headers: {
      authorization: `Bearer ${context.accessToken}`,
      "content-type": "application/json",
      "user-agent": ANTIGRAVITY_USER_AGENT,
      "x-goog-api-client": "gl-node/22.21.1",
    },
    signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    ...(body === undefined ? {} : { body }),
  }

  try {
    const response = await context.fetchImpl(url, init)
    const text = await response.text()
    return {
      id: candidate.id,
      method: candidate.method,
      url,
      rationale: candidate.rationale,
      status: response.status,
      contentType: response.headers.get("content-type"),
      verdict: classifyProbe(response.status, text, absentMethodBody),
      body: text,
    }
  } catch (error: unknown) {
    return {
      id: candidate.id,
      method: candidate.method,
      url,
      rationale: candidate.rationale,
      status: null,
      contentType: null,
      verdict: "unreachable",
      body: "",
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export interface ProbeOptions {
  credentialPath?: string
  origin?: string
  model?: string
  evidenceDir?: string
  fetchImpl?: (input: string, init: RequestInit) => Promise<Response>
}

export async function runAntigravityInteractionsProbe(
  options: ProbeOptions = {},
): Promise<ProbeReport> {
  const runId = randomUUID().slice(0, 8)
  const startedAt = new Date().toISOString()
  const evidenceDir =
    options.evidenceDir
    ?? join(
      tmpdir(),
      "antigravity-interactions-probe",
      `${new Date().toISOString().replaceAll(/[:.]/gu, "-")}_${runId}`,
    )

  await mkdir(evidenceDir, { recursive: true })

  const store = new AntigravityCredentialStore(
    options.credentialPath ?? DEFAULT_CREDENTIAL_PATH,
  )
  const credential: AntigravityCredential = await store.current()
  const context: ProbeContext = {
    origin: (options.origin ?? DEFAULT_ORIGIN).replace(/\/+$/u, ""),
    model: options.model ?? "gemini-3.8-flash-medium",
    projectId: credential.project_id ?? "",
    accessToken: credential.access_token,
    fetchImpl: options.fetchImpl ?? fetch,
  }

  const results: Array<ProbeResult> = []
  let absentMethodBody = ""

  for (const candidate of orderCandidates(PROBE_CANDIDATES)) {
    const result = await executeProbe(candidate, context, absentMethodBody)
    if (candidate.id === ABSENT_METHOD_CONTROL_ID)
      absentMethodBody = result.body
    results.push(result)
    await writeFile(
      join(evidenceDir, `${candidate.id}.json`),
      JSON.stringify(result, null, 2),
    )
  }

  // The absent-method control runs first, so re-run classification now that the
  // baseline body is known.
  for (const result of results) {
    if (result.id === ABSENT_METHOD_CONTROL_ID) continue
    result.verdict = classifyProbe(result.status, result.body, absentMethodBody)
  }

  const report: ProbeReport = {
    runId,
    startedAt,
    finishedAt: new Date().toISOString(),
    origin: context.origin,
    projectId: context.projectId,
    email: credential.email ?? "",
    evidenceDir,
    results,
  }

  await writeFile(
    join(evidenceDir, "report.json"),
    JSON.stringify(report, null, 2),
  )
  return report
}

const ABSENT_METHOD_CONTROL_ID = "control.absentMethod"

function orderCandidates(
  candidates: Array<ProbeCandidate>,
): Array<ProbeCandidate> {
  return [
    ...candidates.filter((c) => c.id === ABSENT_METHOD_CONTROL_ID),
    ...candidates.filter((c) => c.id !== ABSENT_METHOD_CONTROL_ID),
  ]
}

if (import.meta.main) {
  const report = await runAntigravityInteractionsProbe()
  for (const result of report.results) {
    const body = result.body.replaceAll(/\s+/gu, " ").slice(0, 240)
    console.log(
      `${result.verdict.padEnd(11)} ${String(result.status ?? "-").padStart(3)} ${result.method.padEnd(4)} ${result.url}`,
    )
    console.log(`            ${body}`)
  }
  console.log(`\nevidence: ${report.evidenceDir}`)
}
