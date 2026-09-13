import type { Server } from "node:http"
import { mkdir, writeFile } from "node:fs/promises"
import { homedir, tmpdir } from "node:os"
import { join } from "node:path"
import { randomUUID } from "node:crypto"

import {
  ANTIGRAVITY_ENDPOINTS,
  AntigravityCredentialStore,
} from "../src/services/antigravity/auth"
import { createAntigravityProxyServer } from "../src/services/antigravity/proxy"
import { createAntigravityResponsesServer } from "./antigravity-responses"

export const DEFAULT_CREDENTIAL_PATH = join(
  homedir(),
  ".cli-proxy-api",
  "antigravity.json",
)
export const DEFAULT_UPSTREAM_ORIGIN = ANTIGRAVITY_ENDPOINTS.daily
export const DEFAULT_MODEL = "gemini-3.8-flash-medium"
export const DEFAULT_TIMEOUT_MS = 60_000

export interface LiveTestOptions {
  credentialPath?: string
  evidenceDir?: string
  model?: string
  upstreamOrigin?: string
}

export interface StepResult {
  id: string
  status: "pass" | "fail"
  detail: string
  evidence: string[]
}

export interface LiveTestReport {
  runId: string
  startedAt: string
  finishedAt: string
  upstreamOrigin: string
  model: string
  evidenceDir: string
  steps: StepResult[]
}

function parseSSE(raw: string): Array<{ event: string; data: Record<string, unknown> }> {
  const events: Array<{ event: string; data: Record<string, unknown> }> = []
  const frames = raw.split("\n\n").filter((f) => f.trim() !== "")
  for (const frame of frames) {
    const lines = frame.split("\n")
    let event = ""
    let data = ""
    for (const line of lines) {
      if (line.startsWith("event: ")) event = line.slice(7)
      else if (line.startsWith("data: ")) data = line.slice(6)
    }
    if (event !== "" && data !== "") {
      try {
        events.push({ event, data: JSON.parse(data) })
      } catch {
        // ignore
      }
    }
  }
  return events
}

export async function runAntigravityResponsesLiveTest(
  options: LiveTestOptions = {},
): Promise<LiveTestReport> {
  const runId = randomUUID().slice(0, 8)
  const startedAt = new Date().toISOString()
  const credentialPath = options.credentialPath ?? DEFAULT_CREDENTIAL_PATH
  const upstreamOrigin = options.upstreamOrigin ?? DEFAULT_UPSTREAM_ORIGIN
  const model = options.model ?? DEFAULT_MODEL
  const evidenceDir =
    options.evidenceDir ??
    join(tmpdir(), "antigravity-responses-live", `${new Date().toISOString().replace(/[:.]/g, "-")}_${runId}`)

  await mkdir(evidenceDir, { recursive: true })

  const steps: StepResult[] = []

  // 1. Start real Antigravity auth proxy
  const store = new AntigravityCredentialStore(credentialPath)
  const proxyServer = createAntigravityProxyServer({
    credentialStore: store,
    host: "127.0.0.1",
    upstreamOrigin,
  })

  await new Promise<void>((resolve, reject) => {
    proxyServer.once("error", reject)
    proxyServer.listen(0, "127.0.0.1", () => resolve())
  })
  const proxyAddress = proxyServer.address()
  const proxyPort = typeof proxyAddress === "object" && proxyAddress !== null ? proxyAddress.port : 0

  // 2. Start adapter pointing to local proxy
  const adapterServer = createAntigravityResponsesServer({
    proxyOrigin: `http://127.0.0.1:${proxyPort}`,
    defaultModel: model,
  })

  await new Promise<void>((resolve, reject) => {
    adapterServer.once("error", reject)
    adapterServer.listen(0, "127.0.0.1", () => resolve())
  })
  const adapterAddress = adapterServer.address()
  const adapterPort = typeof adapterAddress === "object" && adapterAddress !== null ? adapterAddress.port : 0

  let carriedState: Record<string, unknown> | null = null
  const marker = randomUUID().slice(0, 8)
  const sessionId = `-${Date.now()}`

  try {
    // Step 1: Converted Text Turn
    try {
      const reqBody = {
        model,
        input: [{ role: "user", content: `Remember this marker: ${marker}. Reply with exactly OK.` }],
      }
      await writeFile(join(evidenceDir, "step1-text.request.json"), JSON.stringify(reqBody, null, 2))

      const res = await fetch(`http://127.0.0.1:${adapterPort}/v1/responses`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-session-id": sessionId,
        },
        body: JSON.stringify(reqBody),
      })

      const sseText = await res.text()
      await writeFile(join(evidenceDir, "step1-text.sse.txt"), sseText)

      const events = parseSSE(sseText)
      const completed = events.find((e) => e.event === "response.completed")
      if (!res.ok || !completed) {
        throw new Error(`Status ${res.status}, completed event missing`)
      }

      const resp = completed.data.response as Record<string, unknown>
      const outputs = resp.output as Array<Record<string, unknown>>
      carriedState = outputs.find((o) => o.type === "reasoning") ?? null
      const message = outputs.find((o) => o.type === "message")
      const textContent = (message?.content as Array<Record<string, unknown>>)?.[0]?.text

      steps.push({
        id: "turn.text",
        status: "pass",
        detail: `Status ${res.status}, reply: "${textContent}", carried reasoning state: ${carriedState !== null}`,
        evidence: ["step1-text.request.json", "step1-text.sse.txt"],
      })
    } catch (err: unknown) {
      steps.push({
        id: "turn.text",
        status: "fail",
        detail: err instanceof Error ? err.message : String(err),
        evidence: ["step1-text.request.json"],
      })
    }

    // Step 2: Client-History Continuation Turn
    try {
      const history: Array<Record<string, unknown>> = [
        { role: "user", content: `Remember this marker: ${marker}. Reply with exactly OK.` },
      ]
      if (carriedState !== null) {
        history.push(carriedState)
      }
      history.push({
        role: "assistant",
        content: [{ type: "output_text", text: "OK", annotations: [] }],
      })
      history.push({
        role: "user",
        content: "What marker did I ask you to remember? Reply with only the marker.",
      })

      const reqBody = { model, input: history }
      await writeFile(join(evidenceDir, "step2-continuation.request.json"), JSON.stringify(reqBody, null, 2))

      const res = await fetch(`http://127.0.0.1:${adapterPort}/v1/responses`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-session-id": sessionId,
        },
        body: JSON.stringify(reqBody),
      })

      const sseText = await res.text()
      await writeFile(join(evidenceDir, "step2-continuation.sse.txt"), sseText)

      const events = parseSSE(sseText)
      const completed = events.find((e) => e.event === "response.completed")
      if (!res.ok || !completed) {
        throw new Error(`Status ${res.status}, completed event missing`)
      }

      const resp = completed.data.response as Record<string, unknown>
      const outputs = resp.output as Array<Record<string, unknown>>
      const message = outputs.find((o) => o.type === "message")
      const textContent = (message?.content as Array<Record<string, unknown>>)?.[0]?.text as string

      const recalled = typeof textContent === "string" && textContent.includes(marker)
      if (!recalled) {
        throw new Error(`Model did not recall marker ${marker}, got "${textContent}"`)
      }

      steps.push({
        id: "turn.continuation",
        status: "pass",
        detail: `Successfully recalled marker ${marker} in continuation turn: "${textContent}"`,
        evidence: ["step2-continuation.request.json", "step2-continuation.sse.txt"],
      })
    } catch (err: unknown) {
      steps.push({
        id: "turn.continuation",
        status: "fail",
        detail: err instanceof Error ? err.message : String(err),
        evidence: ["step2-continuation.request.json"],
      })
    }

    // Step 3: Minimal Function Loop Turn
    try {
      const toolReqBody = {
        model,
        input: [{ role: "user", content: "Call the get_weather tool for Tokyo." }],
        tools: [
          {
            type: "function",
            name: "get_weather",
            description: "Get current weather for location",
            parameters: {
              type: "object",
              properties: { location: { type: "string" } },
              required: ["location"],
            },
          },
        ],
      }
      await writeFile(join(evidenceDir, "step3-tool.request.json"), JSON.stringify(toolReqBody, null, 2))

      const res = await fetch(`http://127.0.0.1:${adapterPort}/v1/responses`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-session-id": sessionId,
        },
        body: JSON.stringify(toolReqBody),
      })

      const sseText = await res.text()
      await writeFile(join(evidenceDir, "step3-tool.sse.txt"), sseText)

      const events = parseSSE(sseText)
      const completed = events.find((e) => e.event === "response.completed")
      if (!res.ok || !completed) {
        throw new Error(`Status ${res.status}, completed event missing`)
      }

      const resp = completed.data.response as Record<string, unknown>
      const outputs = resp.output as Array<Record<string, unknown>>
      const funcCall = outputs.find((o) => o.type === "function_call")
      if (!funcCall || funcCall.name !== "get_weather") {
        throw new Error(`Expected function_call to get_weather, got ${JSON.stringify(outputs)}`)
      }

      steps.push({
        id: "turn.function_call",
        status: "pass",
        detail: `Model called ${funcCall.name} with args: ${funcCall.arguments}`,
        evidence: ["step3-tool.request.json", "step3-tool.sse.txt"],
      })
    } catch (err: unknown) {
      steps.push({
        id: "turn.function_call",
        status: "fail",
        detail: err instanceof Error ? err.message : String(err),
        evidence: ["step3-tool.request.json"],
      })
    }
  } finally {
    await new Promise<void>((resolve) => adapterServer.close(() => resolve()))
    await new Promise<void>((resolve) => proxyServer.close(() => resolve()))
  }

  const finishedAt = new Date().toISOString()
  const report: LiveTestReport = {
    runId,
    startedAt,
    finishedAt,
    upstreamOrigin,
    model,
    evidenceDir,
    steps,
  }

  await writeFile(join(evidenceDir, "report.json"), JSON.stringify(report, null, 2))
  return report
}

if (import.meta.main) {
  const report = await runAntigravityResponsesLiveTest()
  console.log(JSON.stringify(report, null, 2))
}
