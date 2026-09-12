import { describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import {
  flushRequestLog,
  formatRequestLogLine,
  recordIncomingRequest,
  REQUEST_LOG_BODY_HEAD_LENGTH,
  setRequestLogFile,
  summarizeRequestBody,
} from "../src/lib/request-log"
import { server } from "../src/server"

const at = new Date("2026-09-12T07:30:12.345Z")

describe("incoming request log", () => {
  test("keeps the request identity and the body head on one line", () => {
    const line = formatRequestLogLine(
      {
        bodyText:
          '{"model":"codex-auto-review",\n  "input":[{"type":"message"}]}',
        method: "POST",
        path: "/v1/responses",
      },
      at,
    )

    expect(line).toStartWith(
      "2026-09-12T07:30:12.345Z | POST /v1/responses | model=codex-auto-review | ",
    )
    expect(line).toEndWith(
      '{"model":"codex-auto-review", "input":[{"type":"message"}]}',
    )
  })

  test("reports a body without a model and truncates long content", () => {
    const line = formatRequestLogLine(
      {
        bodyText: "x".repeat(REQUEST_LOG_BODY_HEAD_LENGTH + 25),
        method: "PUT",
        path: "/v1/messages",
      },
      at,
    )

    expect(line).toContain("PUT /v1/messages | model=- | ")
    expect(line).toEndWith(`${"x".repeat(REQUEST_LOG_BODY_HEAD_LENGTH)}…`)
  })

  test("records a bodyless request", () => {
    const line = formatRequestLogLine({ method: "GET", path: "/usage" }, at)

    expect(line).toBe("2026-09-12T07:30:12.345Z | GET /usage | model=- | 0B")
  })

  test("collapses whitespace so one request stays on one line", () => {
    expect(summarizeRequestBody('{"a":\n\t1}\n')).toBe('{"a": 1}')
  })

  test("appends records to the configured file in arrival order", async () => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "copilot-api-request-log-"),
    )
    const file = path.join(directory, "nested", "requests.log")

    try {
      recordIncomingRequest(
        {
          bodyText: '{"model":"gpt-5.6-luna"}',
          method: "POST",
          path: "/v1/responses",
        },
        file,
      )
      recordIncomingRequest({ method: "GET", path: "/usage" }, file)
      await flushRequestLog()

      const lines = (await fs.readFile(file, "utf8")).trimEnd().split("\n")
      expect(lines).toHaveLength(2)
      expect(lines[0]).toContain("POST /v1/responses | model=gpt-5.6-luna | ")
      expect(lines[0]).toEndWith('{"model":"gpt-5.6-luna"}')
      expect(lines[1]).toContain("GET /usage | model=- | 0B")
    } finally {
      await fs.rm(directory, { force: true, recursive: true })
    }
  })

  test("records every request the server receives and keeps its body", async () => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "copilot-api-request-log-server-"),
    )
    const file = path.join(directory, "requests.log")

    try {
      setRequestLogFile(file)

      const ping = await server.request(
        new Request("http://localhost/", { method: "GET" }),
      )
      // The route still reads its own body after the log consumed a copy.
      const rejected = await server.request(
        new Request("http://localhost/v1/responses", {
          body: JSON.stringify({ input: [] }),
          headers: { "content-type": "application/json" },
          method: "POST",
        }),
      )
      await flushRequestLog()

      expect(ping.status).toBe(200)
      expect(rejected.status).toBe(400)

      const lines = (await fs.readFile(file, "utf8")).trimEnd().split("\n")
      expect(lines[0]).toEndWith("GET / | model=- | 0B")
      expect(lines[1]).toContain("POST /v1/responses | model=- | ")
      expect(lines[1]).toEndWith('{"input":[]}')
    } finally {
      setRequestLogFile(undefined)
      await fs.rm(directory, { force: true, recursive: true })
    }
  })
})
