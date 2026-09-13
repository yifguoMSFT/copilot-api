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
import {
  convertResponsesRequestToGenerateContent,
  STATE_CARRIER_PREFIX,
} from "../src/services/generate-content/convert"

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
  let toolTurnState: Record<string, unknown> | null = null
  let toolTurnCall: Record<string, unknown> | null = null
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
      toolTurnState = outputs.find((o) => o.type === "reasoning") ?? null
      toolTurnCall = funcCall

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

    // Step 4: Replay the real tool turn the client received, so the carried
    // signature state and the separately reported call travel together.
    try {
      if (toolTurnCall === null || toolTurnState === null) {
        throw new Error("step 3 produced no replayable tool turn")
      }
      const callId = String(toolTurnCall.call_id)
      const reqBody = {
        model,
        input: [
          { role: "user", content: "Call the get_weather tool for Tokyo." },
          toolTurnState,
          toolTurnCall,
          {
            type: "function_call_output",
            call_id: callId,
            output: "sunny, 27C",
          },
          { role: "user", content: "Report the weather you were given. Reply in one short sentence." },
        ],
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
      await writeFile(join(evidenceDir, "step4-tool-history.request.json"), JSON.stringify(reqBody, null, 2))

      // The carried turn is the authoritative copy, so converting the replay
      // must reproduce the upstream model turn byte for byte, with no bare
      // duplicate of the function call the carrier already holds.
      const carried = String(toolTurnState.encrypted_content)
      const carriedParts = JSON.parse(
        Buffer.from(carried.slice(STATE_CARRIER_PREFIX.length), "base64url").toString("utf8"),
      ).parts
      const replayed = convertResponsesRequestToGenerateContent(reqBody as never)
      const modelTurn = (replayed.body.contents as Array<Record<string, unknown>>).find(
        (entry) => entry.role === "model",
      )
      if (JSON.stringify(modelTurn?.parts) !== JSON.stringify(carriedParts)) {
        throw new Error(
          `Converted model turn does not match the carrier: ${JSON.stringify(modelTurn?.parts)}`,
        )
      }

      const res = await fetch(`http://127.0.0.1:${adapterPort}/v1/responses`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-session-id": sessionId,
        },
        body: JSON.stringify(reqBody),
      })

      const sseText = await res.text()
      await writeFile(join(evidenceDir, "step4-tool-history.sse.txt"), sseText)

      const events = parseSSE(sseText)
      const completed = events.find((e) => e.event === "response.completed")
      if (!res.ok || !completed) {
        throw new Error(`Status ${res.status}, completed event missing`)
      }

      const resp = completed.data.response as Record<string, unknown>
      const outputs = resp.output as Array<Record<string, unknown>>
      const message = outputs.find((o) => o.type === "message")
      const textContent = (message?.content as Array<Record<string, unknown>>)?.[0]?.text
      if (typeof textContent !== "string" || textContent.trim() === "") {
        throw new Error(`Expected a text answer, got ${JSON.stringify(outputs)}`)
      }

      steps.push({
        id: "turn.tool_history",
        status: "pass",
        detail: `Replayed the signed tool turn without duplicating the call; answer: "${textContent}"`,
        evidence: ["step4-tool-history.request.json", "step4-tool-history.sse.txt"],
      })
    } catch (err: unknown) {
      steps.push({
        id: "turn.tool_history",
        status: "fail",
        detail: err instanceof Error ? err.message : String(err),
        evidence: ["step4-tool-history.request.json"],
      })
    }

    // Step 5: A second call, an instruction inside the call group, and results
    // reported out of order. The replay must keep the carried turn whole, keep
    // the instruction out of the call/result pair, and write both results as
    // one turn in call order.
    try {
      if (toolTurnCall === null || toolTurnState === null) {
        throw new Error("step 3 produced no replayable tool turn")
      }
      const weatherCallId = String(toolTurnCall.call_id)
      const toolDeclarations = [
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
        {
          type: "function",
          name: "get_time",
          description: "Get the local time for a location",
          parameters: {
            type: "object",
            properties: { location: { type: "string" } },
            required: ["location"],
          },
        },
      ]
      const timeCall = {
        type: "function_call",
        call_id: "call_time",
        name: "get_time",
        arguments: '{"location":"Tokyo"}',
      }
      const reqBody = {
        model,
        input: [
          { role: "user", content: "Call the get_weather tool and the get_time tool for Tokyo." },
          toolTurnState,
          toolTurnCall,
          { role: "developer", content: "Keep the final answer to one short sentence." },
          timeCall,
          { type: "function_call_output", call_id: "call_time", output: "09:30 JST" },
          { type: "function_call_output", call_id: weatherCallId, output: "sunny, 27C" },
          { role: "user", content: "Report both facts." },
        ],
        tools: toolDeclarations,
      }
      await writeFile(join(evidenceDir, "step5-tool-pairing.request.json"), JSON.stringify(reqBody, null, 2))

      const carried = String(toolTurnState.encrypted_content)
      const carriedParts = JSON.parse(
        Buffer.from(carried.slice(STATE_CARRIER_PREFIX.length), "base64url").toString("utf8"),
      ).parts as Array<Record<string, unknown>>
      const converted = convertResponsesRequestToGenerateContent(reqBody as never)
      const convertedTurns = converted.body.contents as Array<Record<string, unknown>>
      const modelIndex = convertedTurns.findIndex((entry) => entry.role === "model")
      const modelParts = convertedTurns[modelIndex]?.parts as Array<Record<string, unknown>>
      if (JSON.stringify(modelParts.slice(0, carriedParts.length)) !== JSON.stringify(carriedParts)) {
        throw new Error(`carried parts changed: ${JSON.stringify(modelParts)}`)
      }
      if (modelParts.length !== carriedParts.length + 1) {
        throw new Error(`expected one extra parallel call, got ${JSON.stringify(modelParts)}`)
      }
      const names = (convertedTurns[modelIndex + 1]?.parts as Array<Record<string, unknown>>).map(
        (part) => (part.functionResponse as Record<string, unknown>)?.name,
      )
      if (JSON.stringify(names) !== JSON.stringify(["get_weather", "get_time"])) {
        throw new Error(`results are not in call order: ${JSON.stringify(names)}`)
      }

      const res = await fetch(`http://127.0.0.1:${adapterPort}/v1/responses`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-session-id": sessionId,
        },
        body: JSON.stringify(reqBody),
      })

      const sseText = await res.text()
      await writeFile(join(evidenceDir, "step5-tool-pairing.sse.txt"), sseText)

      const events = parseSSE(sseText)
      const completed = events.find((e) => e.event === "response.completed")
      if (!res.ok || !completed) {
        throw new Error(`Status ${res.status}, completed event missing`)
      }
      const resp = completed.data.response as Record<string, unknown>
      const outputs = resp.output as Array<Record<string, unknown>>
      const textContent = (outputs.find((o) => o.type === "message")?.content as Array<
        Record<string, unknown>
      >)?.[0]?.text
      if (typeof textContent !== "string" || textContent.trim() === "") {
        throw new Error(`Expected a text answer, got ${JSON.stringify(outputs)}`)
      }

      steps.push({
        id: "turn.tool_pairing",
        status: "pass",
        detail: `Kept the carried turn whole, released the instruction after the results, and sent both results in call order; answer: "${textContent}"`,
        evidence: ["step5-tool-pairing.request.json", "step5-tool-pairing.sse.txt"],
      })
    } catch (err: unknown) {
      steps.push({
        id: "turn.tool_pairing",
        status: "fail",
        detail: err instanceof Error ? err.message : String(err),
        evidence: ["step5-tool-pairing.request.json"],
      })
    }

    // Step 6: A namespace declared only through additional_tools, so the
    // merged child has to survive into the declaration and the reverse
    // identity has to give the call back its namespace.
    try {
      const reqBody = {
        model,
        input: [
          { role: "user", content: "Use the demo ping tool." },
          {
            type: "additional_tools",
            id: "at_live",
            role: "developer",
            tools: [
              {
                type: "namespace",
                name: "demo",
                tools: [
                  {
                    type: "function",
                    name: "ping",
                    description: "Report that the tool was reached",
                    parameters: {
                      type: "object",
                      properties: { note: { type: "string" } },
                    },
                  },
                ],
              },
            ],
          },
        ],
        tool_choice: "required",
      }
      await writeFile(join(evidenceDir, "step6-namespace-tool.request.json"), JSON.stringify(reqBody, null, 2))

      const res = await fetch(`http://127.0.0.1:${adapterPort}/v1/responses`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-session-id": sessionId,
        },
        body: JSON.stringify(reqBody),
      })

      const sseText = await res.text()
      await writeFile(join(evidenceDir, "step6-namespace-tool.sse.txt"), sseText)

      const events = parseSSE(sseText)
      const completed = events.find((e) => e.event === "response.completed")
      if (!res.ok || !completed) {
        throw new Error(`Status ${res.status}, completed event missing`)
      }
      const resp = completed.data.response as Record<string, unknown>
      const call = (resp.output as Array<Record<string, unknown>>).find(
        (item) => item.type === "function_call",
      )
      if (call === undefined || call.name !== "ping" || call.namespace !== "demo") {
        throw new Error(`Expected demo.ping function_call, got ${JSON.stringify(call)}`)
      }

      steps.push({
        id: "tool.namespace_identity",
        status: "pass",
        detail: `Namespaced tool came back as ${String(call.namespace)}.${String(call.name)} from an additional_tools declaration`,
        evidence: ["step6-namespace-tool.request.json", "step6-namespace-tool.sse.txt"],
      })
    } catch (err: unknown) {
      steps.push({
        id: "tool.namespace_identity",
        status: "fail",
        detail: err instanceof Error ? err.message : String(err),
        evidence: ["step6-namespace-tool.request.json"],
      })
    }

    // Step 7: A declared JSON schema has to reach the upstream as structured
    // output, so the answer is JSON shaped the way the client declared.
    try {
      const schema = {
        type: "object",
        properties: {
          summary: { type: "string" },
          temperature_c: { type: "number" },
          conditions: { type: "string", enum: ["sunny", "cloudy", "rainy"] },
          humidity_pct: { anyOf: [{ type: "number" }, { type: "null" }] },
        },
        required: ["summary", "temperature_c", "conditions"],
        additionalProperties: false,
      }
      const reqBody = {
        model,
        input: [
          {
            role: "user",
            content: "Report the weather in Tokyo as 27C, sunny, in one short sentence.",
          },
        ],
        text: {
          format: { type: "json_schema", name: "weather_report", strict: true, schema },
        },
      }
      await writeFile(join(evidenceDir, "step7-json-schema.request.json"), JSON.stringify(reqBody, null, 2))

      const res = await fetch(`http://127.0.0.1:${adapterPort}/v1/responses`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-session-id": sessionId,
        },
        body: JSON.stringify(reqBody),
      })

      const sseText = await res.text()
      await writeFile(join(evidenceDir, "step7-json-schema.sse.txt"), sseText)

      const events = parseSSE(sseText)
      const completed = events.find((e) => e.event === "response.completed")
      if (!res.ok || !completed) {
        throw new Error(`Status ${res.status}, completed event missing`)
      }
      const resp = completed.data.response as Record<string, unknown>
      const outputs = resp.output as Array<Record<string, unknown>>
      const textContent = (outputs.find((o) => o.type === "message")?.content as Array<
        Record<string, unknown>
      >)?.[0]?.text
      if (typeof textContent !== "string") {
        throw new Error(`Expected text content, got ${JSON.stringify(outputs)}`)
      }
      let parsed: Record<string, unknown>
      try {
        parsed = JSON.parse(textContent) as Record<string, unknown>
      } catch {
        throw new Error(`Answer is not JSON: ${textContent}`)
      }
      if (
        typeof parsed.summary !== "string"
        || typeof parsed.temperature_c !== "number"
        || !["sunny", "cloudy", "rainy"].includes(String(parsed.conditions))
      ) {
        throw new Error(`Answer does not match the declared schema: ${textContent}`)
      }

      steps.push({
        id: "text.json_schema",
        status: "pass",
        detail: `Structured output matched the declaration: ${textContent}`,
        evidence: ["step7-json-schema.request.json", "step7-json-schema.sse.txt"],
      })
    } catch (err: unknown) {
      steps.push({
        id: "text.json_schema",
        status: "fail",
        detail: err instanceof Error ? err.message : String(err),
        evidence: ["step7-json-schema.request.json"],
      })
    }

    // Step 8: History that came from another provider, plus a tool schema
    // whose boolean enum the legacy parameters proto rejects. Neither may
    // stop the turn.
    try {
      const reqBody = {
        model,
        input: [
          { role: "user", content: "Reply with the word ok." },
          {
            type: "reasoning",
            id: "other-model",
            encrypted_content: "foreign-opaque-state",
            summary: [{ type: "summary_text", text: "The other provider reasoned here." }],
          },
          { role: "assistant", content: "ok" },
          { role: "user", content: "Say ok again." },
        ],
        tools: [
          {
            type: "function",
            name: "set_flag",
            description: "Set a flag",
            parameters: {
              type: "object",
              properties: {
                allow: { type: "boolean", const: true, enum: [true] },
                mode: { type: "string", enum: ["plan", "edit"] },
              },
            },
          },
        ],
      }
      await writeFile(join(evidenceDir, "step8-foreign-history.request.json"), JSON.stringify(reqBody, null, 2))

      const res = await fetch(`http://127.0.0.1:${adapterPort}/v1/responses`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-session-id": sessionId,
        },
        body: JSON.stringify(reqBody),
      })

      const sseText = await res.text()
      await writeFile(join(evidenceDir, "step8-foreign-history.sse.txt"), sseText)

      const events = parseSSE(sseText)
      const completed = events.find((e) => e.event === "response.completed")
      if (!res.ok || !completed) {
        throw new Error(`Status ${res.status}, completed event missing`)
      }
      const resp = completed.data.response as Record<string, unknown>
      const outputs = resp.output as Array<Record<string, unknown>>
      const textContent = (outputs.find((o) => o.type === "message")?.content as Array<
        Record<string, unknown>
      >)?.[0]?.text
      if (typeof textContent !== "string" || textContent.trim() === "") {
        throw new Error(`Expected a text answer, got ${JSON.stringify(outputs)}`)
      }

      steps.push({
        id: "history.foreign_provider",
        status: "pass",
        detail: `Foreign reasoning history and a boolean-enum tool schema both accepted; answer: "${textContent}"`,
        evidence: ["step8-foreign-history.request.json", "step8-foreign-history.sse.txt"],
      })
    } catch (err: unknown) {
      steps.push({
        id: "history.foreign_provider",
        status: "fail",
        detail: err instanceof Error ? err.message : String(err),
        evidence: ["step8-foreign-history.request.json"],
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
