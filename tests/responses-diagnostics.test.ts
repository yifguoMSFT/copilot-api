import { describe, expect, mock, test } from "bun:test"
import consola from "consola"
import { mkdtemp, readFile, rm, rmdir } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import {
  createResponsesDiagnosticLogger,
  logResponsesError,
  summarizeResponsesBody,
  summarizeResponsesHeaders,
} from "../src/lib/responses-diagnostics"

describe("Responses diagnostic file", () => {
  test("appends complete timestamped records in order to a JSONL file", async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), "responses-diagnostics-"),
    )
    const filePath = path.join(directory, "logs", "responses.jsonl")
    const logger = createResponsesDiagnosticLogger(filePath)
    try {
      await Promise.all([
        logger({ stage: "request", requestId: "file-probe" }),
        logger({
          stage: "upstream-response",
          requestId: "file-probe",
          status: 400,
        }),
      ])
      const records = (await readFile(filePath, "utf8"))
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line) as Record<string, unknown>)
      expect(records.map((entry) => entry.stage)).toEqual([
        "request",
        "upstream-response",
      ])
      expect(records.every((entry) => entry.requestId === "file-probe")).toBe(
        true,
      )
      expect(
        records.every((entry) => typeof entry.timestamp === "string"),
      ).toBe(true)
    } finally {
      await rm(filePath, { force: true })
      await rmdir(path.dirname(filePath))
      await rmdir(directory)
    }
  })
})

describe("Responses diagnostics", () => {
  test("fingerprints nested encrypted fields without logging content", () => {
    const body = JSON.stringify({
      model: "gpt-6-sol",
      previous_response_id: "private-response",
      input: [
        { type: "message", content: "private-prompt" },
        {
          type: "function_call_output",
          output: [
            { type: "encrypted_content", encrypted_content: "ciphertext" },
          ],
        },
        { type: "reasoning", encrypted_content: "reasoning-secret" },
      ],
    })
    const summary = summarizeResponsesBody(body)
    expect(summary).toMatchObject({
      validJson: true,
      model: "gpt-6-sol",
      inputItems: 3,
      encrypted: {
        truncated: false,
        fields: expect.arrayContaining([
          expect.objectContaining({
            path: "$.input[1].output[0].encrypted_content",
            bytes: 10,
            sha256: expect.stringMatching(/^[\da-f]{64}$/) as unknown,
          }),
          expect.objectContaining({ path: "$.input[2].encrypted_content" }),
        ]) as unknown,
      },
    })
    for (const secret of [
      "private-response",
      "private-prompt",
      "ciphertext",
      "reasoning-secret",
    ]) {
      expect(JSON.stringify(summary)).not.toContain(secret)
    }
    expect(summarizeResponsesBody(new TextEncoder().encode(body))).toEqual(
      summary,
    )
  })

  test("does not consume streams and limits encrypted field output", () => {
    const stream = new ReadableStream()
    expect(summarizeResponsesBody(stream)).toEqual({ inspected: false })
    expect(stream.locked).toBe(false)
    expect(
      summarizeResponsesBody(
        JSON.stringify({
          input: Array.from({ length: 40 }, () => ({
            encrypted_content: "secret",
          })),
        }),
      ),
    ).toMatchObject({
      encrypted: { truncated: true },
    })
    expect(summarizeResponsesBody("private malformed body")).toMatchObject({
      validJson: false,
    })
    expect(
      JSON.stringify(summarizeResponsesBody("private malformed body")),
    ).not.toContain("private malformed body")
  })

  test("compares session state without exposing credentials or header values", () => {
    const headers = new Headers({
      authorization: "Bearer credential",
      cookie: "cookie-secret",
      session_id: "session-secret",
      "x-codex-turn-state": "state-secret",
    })
    const summary = summarizeResponsesHeaders(headers)
    expect(summary).toHaveProperty("session_id")
    expect(summary).toHaveProperty("x-codex-turn-state")
    for (const secret of [
      "credential",
      "cookie-secret",
      "session-secret",
      "state-secret",
    ]) {
      expect(JSON.stringify(summary)).not.toContain(secret)
    }
    expect(summary).toEqual(summarizeResponsesHeaders(new Headers(headers)))
    headers.set("session_id", "different-state")
    expect(summary).not.toEqual(summarizeResponsesHeaders(headers))
  })

  test("classifies errors while preserving the original response body", async () => {
    const originalInfo = consola.info
    const info = mock(() => undefined)
    consola.info = info as unknown as typeof consola.info
    const body = JSON.stringify({
      error: {
        code: "invalid_request_body",
        message:
          "Encrypted function output content could not be decrypted or decoded.",
        private: "never-log-this",
      },
    })
    const response = new Response(body, { status: 400 })
    try {
      await logResponsesError(response, "request-test")
      expect(response.bodyUsed).toBe(false)
      expect(await response.text()).toBe(body)
      expect(info).toHaveBeenCalledWith(
        "Responses diagnostic",
        expect.stringContaining('"encryptedFunctionOutputRejected":true'),
      )
      expect(JSON.stringify(info.mock.calls)).not.toContain("never-log-this")
    } finally {
      restoreInfo(originalInfo)
    }
  })

  test("bounds large error bodies and does not log arbitrary errors", async () => {
    const originalInfo = consola.info
    const info = mock(() => undefined)
    consola.info = info as unknown as typeof consola.info
    const body = "private-error".repeat(1000)
    const response = new Response(body, { status: 400 })
    try {
      await logResponsesError(response, "request-test")
      expect(await response.text()).toBe(body)
      expect(info).toHaveBeenCalledWith(
        "Responses diagnostic",
        expect.stringContaining('"truncated":true'),
      )
      expect(JSON.stringify(info.mock.calls)).not.toContain("private-error")
    } finally {
      restoreInfo(originalInfo)
    }
  })

  test("times out inspecting stalled errors without cancelling the client", async () => {
    const originalInfo = consola.info
    const info = mock(() => undefined)
    consola.info = info as unknown as typeof consola.info
    let upstreamCancelled = false
    const stream = new TransformStream<Uint8Array, Uint8Array>()
    const source = new ReadableStream<Uint8Array>({
      async start(controller) {
        const reader = stream.readable.getReader()
        const chunk = await reader.read()
        if (!chunk.done) controller.enqueue(chunk.value)
        controller.close()
      },
      cancel() {
        upstreamCancelled = true
      },
    })
    const response = new Response(source, { status: 400 })
    try {
      await logResponsesError(response, "request-timeout")
      expect(upstreamCancelled).toBe(false)
      expect(response.bodyUsed).toBe(false)
      expect(info).toHaveBeenCalledWith(
        "Responses diagnostic",
        expect.stringContaining('"truncated":true'),
      )
      const writer = stream.writable.getWriter()
      await writer.write(new TextEncoder().encode("original-error"))
      await writer.close()
      expect(await response.text()).toBe("original-error")
    } finally {
      restoreInfo(originalInfo)
    }
  })
})

const restoreInfo = (original: typeof consola.info): void => {
  consola.info = original
}
