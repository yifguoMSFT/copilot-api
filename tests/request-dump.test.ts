import { Database } from "bun:sqlite"
import { afterEach, beforeEach, expect, mock, test } from "bun:test"
import { Hono } from "hono"
import { mkdtemp, rm, rmdir } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import {
  fetchWithRequestDump,
  openRequestDump,
  RequestDump,
  requestDumpMiddleware,
  setRequestDump,
} from "../src/lib/request-dump"
import { loadRuntimeConfig } from "../src/lib/runtime-config"
import { state } from "../src/lib/state"
import { server } from "../src/server"

interface DumpRow {
  trace_id: string
  stage: string
  model: string | null
  headers_json: string
  body: Uint8Array | null
  body_bytes: number | null
  body_sha256: string | null
  status: number | null
  response_headers_json: string | null
  error: string | null
  capture_error: string | null
}

const originalFetch = globalThis.fetch
const originalState = { ...state }
let database: Database
let dump: RequestDump
const fetchMock = mock((_url: string | URL, _init?: RequestInit) =>
  Promise.resolve(Response.json({ ok: true })),
)

beforeEach(() => {
  database = new Database(":memory:")
  dump = new RequestDump(database)
  setRequestDump(dump)
  fetchMock.mockReset()
  fetchMock.mockImplementation(() =>
    Promise.resolve(Response.json({ ok: true })),
  )
  globalThis.fetch = fetchMock as unknown as typeof fetch
  state.copilotToken = "private-upstream-token"
  state.accountType = "individual"
  state.manualApprove = false
  state.verbose = false
  state.rateLimitSeconds = undefined
  state.runtimeConfig = undefined
})

afterEach(() => {
  setRequestDump(undefined)
  dump.close()
  globalThis.fetch = originalFetch
  Object.assign(state, originalState)
})

const rows = () => database.query<DumpRow, []>("SELECT * FROM requests").all()
const requestHeaders = (row: DumpRow) =>
  JSON.parse(row.headers_json) as Record<string, string>
const bodyText = (row: DumpRow) =>
  new TextDecoder().decode(row.body ?? undefined)
const post = (url: string, body: string) =>
  server.request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer private-client-token",
      cookie: "private-cookie",
      "x-api-key": "private-api-key",
      "user-agent": "original-client",
      "x-custom-state": "state-to-compare",
    },
    body,
  })

test.each([false, true])(
  "dumps original and effective compaction models (enabled: %s)",
  async (enabled) => {
    state.runtimeConfig = await loadRuntimeConfig({
      cwd: import.meta.dir,
      env: {},
    })
    state.runtimeConfig.compaction = { enabled, model: "gpt-6-luna" }
    const payload = {
      model: "gpt-6-sol",
      client_metadata: {
        "x-codex-turn-metadata": '{"request_kind":"compaction"}',
      },
      input: [{ encrypted_content: "synthetic-ciphertext" }],
      unknown: { model: "nested" },
    }
    const body = JSON.stringify(payload)
    await post("/v1/responses", body)
    const [incoming, upstream] = rows()
    expect(rows()).toHaveLength(2)
    expect(incoming.trace_id).toBe(upstream.trace_id)
    expect(incoming.model).toBe("gpt-6-sol")
    expect(upstream.model).toBe(enabled ? "gpt-6-luna" : "gpt-6-sol")
    expect(bodyText(incoming)).toBe(body)
    expect(JSON.parse(bodyText(upstream))).toEqual({
      ...payload,
      model: enabled ? "gpt-6-luna" : "gpt-6-sol",
    })
    expect(incoming.body_sha256 === upstream.body_sha256).toBe(!enabled)
    expect(requestHeaders(upstream)["x-custom-state"]).toBe("state-to-compare")
  },
)

test("captures complete encrypted bodies and headers on both Responses boundaries", async () => {
  const body =
    '{ "model":"gpt-6-sol", "input":[{"content":[{"type":"encrypted_content","encrypted_content":"full-ciphertext"}]}], "metadata":{"note":"日本語"} }'
  fetchMock.mockImplementation(() =>
    Promise.resolve(
      Response.json(
        { error: "rejected" },
        {
          status: 400,
          headers: {
            "x-copilot-service-request-id": "service-id",
            "set-cookie": "secret",
          },
        },
      ),
    ),
  )
  const response = await post("/v1/responses", body)
  expect(response.status).toBe(400)
  const [incoming, upstream] = rows()
  expect(rows()).toHaveLength(2)
  expect(incoming.stage).toBe("incoming")
  expect(upstream.stage).toBe("upstream")
  expect(incoming.trace_id).toBe(upstream.trace_id)
  expect(bodyText(incoming)).toBe(body)
  expect(bodyText(upstream)).toBe(body)
  expect(incoming.body_sha256).toBe(upstream.body_sha256)
  expect(incoming.body_bytes).toBe(Buffer.byteLength(body))
  expect(incoming.model).toBe("gpt-6-sol")
  expect(upstream.status).toBe(400)
  expect(upstream.response_headers_json).toContain("service-id")
  expect(requestHeaders(incoming)["user-agent"]).toBe("original-client")
  expect(requestHeaders(upstream)["user-agent"]).toStartWith(
    "GitHubCopilotChat/",
  )
  expect(requestHeaders(upstream)["x-custom-state"]).toBe("state-to-compare")
  expect(JSON.stringify(rows())).not.toContain("private-")
  expect(upstream.response_headers_json).not.toContain("secret")
})

test("captures model alias changes without stripping encrypted fields", async () => {
  await post(
    "/responses",
    '{"model":"codex-auto-review","input":[{"encrypted_content":"keep-me"}]}',
  )
  const [incoming, upstream] = rows()
  expect(incoming.model).toBe("codex-auto-review")
  expect(upstream.model).not.toBe(incoming.model)
  expect(upstream.body_sha256).not.toBe(incoming.body_sha256)
  expect(bodyText(upstream)).toContain("keep-me")
})

test("captures GET, unknown routes, and malformed JSON even without upstream requests", async () => {
  await server.request("/")
  await server.request("/missing")
  await post("/responses", "{bad-json")
  expect(rows()).toHaveLength(3)
  expect(rows().map((row) => row.stage)).toEqual([
    "incoming",
    "incoming",
    "incoming",
  ])
  expect(rows().map((row) => row.status)).toEqual([200, 404, 400])
  expect(bodyText(rows()[0])).toBe("")
  expect(bodyText(rows()[2])).toBe("{bad-json")
  expect(fetchMock).not.toHaveBeenCalled()
})

test("keeps concurrent request traces separate and records upstream transport errors", async () => {
  const app = new Hono()
  app.use(requestDumpMiddleware)
  app.post("/", async (c) => {
    const body = await c.req.text()
    await Promise.resolve()
    try {
      return await fetchWithRequestDump("https://example.test/api", {
        method: "POST",
        body,
      })
    } catch {
      return c.text("upstream failed", 502)
    }
  })
  fetchMock.mockImplementation(async (_url, init) => {
    await Promise.resolve()
    if (init?.body === "bad") throw new Error("connection failed")
    return Response.json({ ok: true })
  })
  await Promise.all(
    ["good", "bad"].map(async (body) =>
      app.request("/", { method: "POST", body }),
    ),
  )
  expect(rows()).toHaveLength(4)
  for (const incoming of rows().filter((row) => row.stage === "incoming")) {
    const upstream = rows().find(
      (row) => row.stage === "upstream" && row.trace_id === incoming.trace_id,
    )
    if (upstream === undefined) throw new Error("Missing upstream capture")
    expect(bodyText(upstream)).toBe(bodyText(incoming))
    if (bodyText(incoming) === "bad") {
      expect(upstream.error).toBe("connection failed")
      expect(upstream.status).toBeNull()
      expect(incoming.status).toBe(502)
    }
  }
})

test("does not consume a response stream and works independently of verbose logging", async () => {
  const stream = new TransformStream<Uint8Array, Uint8Array>()
  fetchMock.mockImplementation(() =>
    Promise.resolve(
      new Response(stream.readable, {
        headers: { "content-type": "text/event-stream" },
      }),
    ),
  )
  const response = await post("/responses", '{"model":"gpt-6-sol"}')
  expect(rows().map((row) => row.status)).toEqual([200, 200])
  const output = response.text()
  const writer = stream.writable.getWriter()
  const frame = "event: response.completed\ndata: {}\n\n"
  await writer.write(new TextEncoder().encode(frame))
  await writer.close()
  expect(await output).toBe(frame)
})

test("disabled dumping leaves no records and preserves fetch arguments", async () => {
  setRequestDump(undefined)
  const body = '{"model":"gpt-6-sol"}'
  await post("/responses", body)
  expect(rows()).toEqual([])
  const [, init] = fetchMock.mock.calls[0]
  expect(new TextDecoder().decode(init?.body as ArrayBuffer)).toBe(body)
})

test("database write failure does not fail the API request", async () => {
  database.run("DROP TABLE requests")
  const response = await post("/responses", '{"model":"gpt-6-sol"}')
  expect(response.status).toBe(200)
  expect(fetchMock).toHaveBeenCalledTimes(1)
})

test("SQLite file supports live queries and survives reopening", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "request-dump-"))
  const file = path.join(directory, "requests.sqlite")
  const fileDump = await openRequestDump(file)
  try {
    const id = await fileDump.start(
      new Request("https://example.test", {
        method: "POST",
        body: '{"model":"test"}',
      }),
      "trace",
      "incoming",
    )
    fileDump.finish(id, new Response(null, { status: 204 }))
    const reader = new Database(file, { readonly: true })
    try {
      expect(
        reader
          .query(
            "SELECT json_extract(CAST(body AS TEXT), '$.model') AS model, status FROM requests",
          )
          .get(),
      ).toEqual({ model: "test", status: 204 })
    } finally {
      reader.close()
    }
  } finally {
    fileDump.close()
  }
  const reopened = new Database(file, { readonly: true })
  try {
    expect(reopened.query("SELECT count(*) AS n FROM requests").get()).toEqual({
      n: 1,
    })
  } finally {
    reopened.close()
    for (const suffix of ["", "-wal", "-shm"])
      await rm(file + suffix, { force: true })
    await rmdir(directory)
  }
})
