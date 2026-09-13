import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "bun:test"

import {
  createGenerateContentEventStream,
  GenerateContentEventStream,
  responsesUsage,
} from "../src/services/generate-content/stream"
import { STATE_CARRIER_PREFIX } from "../src/services/generate-content/convert"

const FIXTURES = join(import.meta.dir, "fixtures", "antigravity-generate-content")

function parseSSEEvents(raw: string): Array<{ event: string; data: Record<string, unknown> }> {
  const events: Array<{ event: string; data: Record<string, unknown> }> = []
  const frames = raw.split("\n\n").filter((f) => f.trim() !== "")
  for (const frame of frames) {
    const lines = frame.split("\n")
    let eventType = ""
    let dataStr = ""
    for (const line of lines) {
      if (line.startsWith("event: ")) {
        eventType = line.slice(7)
      } else if (line.startsWith("data: ")) {
        dataStr = line.slice(6)
      }
    }
    if (eventType !== "" && dataStr !== "") {
      events.push({ event: eventType, data: JSON.parse(dataStr) })
    }
  }
  return events
}

describe("GenerateContent SSE to Responses converter", () => {
  it("converts byte-exact live fixture stream-text.sse into Responses events", () => {
    const sseBytes = readFileSync(join(FIXTURES, "stream-text.sse"))
    const stream = createGenerateContentEventStream({
      requestedModel: "gemini-3.8-flash-medium",
      createdAt: 1726000000,
    })

    // Push in two slices to verify chunking
    const half = Math.floor(sseBytes.length / 2)
    const out1 = stream.push(sseBytes.subarray(0, half))
    const out2 = stream.push(sseBytes.subarray(half))
    const out3 = stream.flush()

    const allOutput = out1 + out2 + out3
    const events = parseSSEEvents(allOutput)

    expect(events.length).toBeGreaterThan(0)
    const types = events.map((e) => e.event)

    expect(types).toContain("response.created")
    expect(types).toContain("response.in_progress")
    expect(types).toContain("response.output_item.added")
    expect(types).toContain("response.content_part.added")
    expect(types).toContain("response.output_text.delta")
    expect(types).toContain("response.output_text.done")
    expect(types).toContain("response.content_part.done")
    expect(types).toContain("response.output_item.done")
    expect(types).toContain("response.completed")

    // Check delta content
    const deltaEvent = events.find((e) => e.event === "response.output_text.delta")
    expect(deltaEvent?.data.delta).toBe("pong")

    // Check terminal completed response
    const completedEvent = events.find((e) => e.event === "response.completed")
    expect(completedEvent).toBeDefined()
    const resp = completedEvent?.data.response as Record<string, unknown>
    expect(resp.status).toBe("completed")
    expect(resp.model).toBe("gemini-3.8-flash-medium")
    expect(resp.id).toBe("ofSlao-vIrm-vr0P_orkkQY")

    // Output items must contain the reasoning item (carrying thoughtSignature) and message item
    const outputs = resp.output as Array<Record<string, unknown>>
    expect(outputs.length).toBe(2)
    expect(outputs[0].type).toBe("message")
    expect(outputs[0].status).toBe("completed")
    expect(outputs[1].type).toBe("reasoning")
    expect(String(outputs[1].encrypted_content).startsWith(STATE_CARRIER_PREFIX)).toBe(true)

    // Usage check
    const usage = resp.usage as Record<string, unknown>
    expect(usage.input_tokens).toBe(6)
    expect(usage.output_tokens).toBe(103) // 1 candidate + 102 thoughts
    expect(usage.total_tokens).toBe(109)
    expect((usage.output_tokens_details as Record<string, unknown>)?.reasoning_tokens).toBe(102)
  })

  it("handles arbitrary byte splits including byte-by-byte feed", () => {
    const sseBytes = readFileSync(join(FIXTURES, "stream-text.sse"))
    const stream = createGenerateContentEventStream({
      requestedModel: "gemini-3.8-flash-medium",
    })

    let collected = ""
    for (let i = 0; i < sseBytes.length; i++) {
      collected += stream.push(sseBytes.subarray(i, i + 1))
    }
    collected += stream.flush()

    const events = parseSSEEvents(collected)
    expect(events.map((e) => e.event)).toContain("response.completed")
    const delta = events.find((e) => e.event === "response.output_text.delta")
    expect(delta?.data.delta).toBe("pong")
  })

  it("handles function calls and namespaces correctly", () => {
    const toolMap = new Map([
      ["_6_githubsearch_repos", { name: "search_repos", namespace: "github", custom: false }],
    ])
    const stream = createGenerateContentEventStream({
      requestedModel: "gemini-3.8-flash-medium",
      tools: toolMap,
    })

    const sse = [
      `data: {"response":{"responseId":"resp_123","candidates":[{"content":{"role":"model","parts":[{"functionCall":{"name":"_6_githubsearch_repos","args":{"query":"antigravity"}}}]},"finishReason":"STOP"}]}}\n\n`,
    ].join("")

    const out = stream.push(Buffer.from(sse, "utf-8")) + stream.flush()
    const events = parseSSEEvents(out)

    const completed = events.find((e) => e.event === "response.completed")
    expect(completed).toBeDefined()
    const resp = completed?.data.response as Record<string, unknown>
    const output = resp.output as Array<Record<string, unknown>>
    expect(output.length).toBe(1)
    expect(output[0].type).toBe("function_call")
    expect(output[0].name).toBe("search_repos")
    expect(output[0].namespace).toBe("github")
    expect(JSON.parse(output[0].arguments as string)).toEqual({ query: "antigravity" })
  })

  it("handles custom tool calls", () => {
    const toolMap = new Map([
      ["bash", { name: "bash", custom: true }],
    ])
    const stream = createGenerateContentEventStream({
      requestedModel: "gemini-3.8-flash-medium",
      tools: toolMap,
    })

    const sse = [
      `data: {"response":{"responseId":"resp_custom","candidates":[{"content":{"role":"model","parts":[{"functionCall":{"name":"bash","args":{"input":"echo hi"}}}]},"finishReason":"STOP"}]}}\n\n`,
    ].join("")

    const out = stream.push(Buffer.from(sse, "utf-8")) + stream.flush()
    const events = parseSSEEvents(out)

    const completed = events.find((e) => e.event === "response.completed")
    expect(completed).toBeDefined()
    const resp = completed?.data.response as Record<string, unknown>
    const output = resp.output as Array<Record<string, unknown>>
    expect(output.length).toBe(1)
    expect(output[0].type).toBe("custom_tool_call")
    expect(output[0].name).toBe("bash")
    expect(output[0].input).toBe("echo hi")
  })

  it("handles finishReason: MAX_TOKENS as response.incomplete", () => {
    const stream = createGenerateContentEventStream({
      requestedModel: "gemini-3.8-flash-medium",
    })
    const sse = `data: {"response":{"responseId":"resp_max","candidates":[{"content":{"role":"model","parts":[{"text":"cut off"}]},"finishReason":"MAX_TOKENS"}]}}\n\n`
    const out = stream.push(Buffer.from(sse, "utf-8")) + stream.flush()
    const events = parseSSEEvents(out)

    expect(events.map((e) => e.event)).toContain("response.incomplete")
    expect(events.map((e) => e.event)).not.toContain("response.completed")
  })

  it("handles upstream error and emits response.failed", () => {
    const stream = createGenerateContentEventStream({
      requestedModel: "gemini-3.8-flash-medium",
    })
    const sse = `data: {"error":{"code":"RESOURCE_EXHAUSTED","message":"Quota exceeded"}}\n\n`
    const out = stream.push(Buffer.from(sse, "utf-8"))
    const events = parseSSEEvents(out)

    const failed = events.find((e) => e.event === "response.failed")
    expect(failed).toBeDefined()
    const resp = failed?.data.response as Record<string, unknown>
    expect(resp.status).toBe("failed")
    expect((resp.error as Record<string, unknown>).code).toBe("RESOURCE_EXHAUSTED")
  })

  it("fails on unexpected EOF before terminal finishReason", () => {
    const stream = createGenerateContentEventStream({
      requestedModel: "gemini-3.8-flash-medium",
    })
    const sse = `data: {"response":{"responseId":"resp_incomp","candidates":[{"content":{"role":"model","parts":[{"text":"in progress"}]}}]}}\n\n`
    stream.push(Buffer.from(sse, "utf-8"))
    const out = stream.flush()
    const events = parseSSEEvents(out)

    const failed = events.find((e) => e.event === "response.failed")
    expect(failed).toBeDefined()
  })

  it("verifies responsesUsage arithmetic", () => {
    expect(responsesUsage(null)).toBeNull()
    expect(responsesUsage(undefined)).toBeNull()
    const usage = responsesUsage({
      promptTokenCount: 16,
      candidatesTokenCount: 1,
      thoughtsTokenCount: 106,
      totalTokenCount: 123,
    })
    expect(usage).toEqual({
      input_tokens: 16,
      output_tokens: 107,
      output_tokens_details: { reasoning_tokens: 106 },
      total_tokens: 123,
    })
  })
})
