import { afterAll, describe, expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import type { JsonObject } from "../src/services/interactions/convert"

import {
  type BridgeOptions,
  createBridgeHandler,
  readApiKey,
} from "../scripts/interactions-codex-live"

const TOKEN = "local-test-token-1234567890"
const ORIGIN = "http://127.0.0.1:4830"
const temporaryDirectories: Array<string> = []

afterAll(async () => {
  for (const directory of temporaryDirectories)
    await rm(directory, { recursive: true, force: true })
})

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "interactions-bridge-"))
  temporaryDirectories.push(directory)
  return directory
}

function bridge(overrides: Partial<BridgeOptions> = {}) {
  return createBridgeHandler({ mode: "sample", token: TOKEN, ...overrides })
}

interface PostOptions {
  token?: string | null
  path?: string
  headers?: Record<string, string>
  signal?: AbortSignal
}

function post(body: unknown, options: PostOptions = {}): Request {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...options.headers,
  }
  if (options.token !== null)
    headers.authorization = `Bearer ${options.token ?? TOKEN}`
  return new Request(`${ORIGIN}${options.path ?? "/v1/responses"}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: options.signal,
  })
}

function textRequest(extra: JsonObject = {}): JsonObject {
  return {
    model: "client-alias",
    store: false,
    input: [{ role: "user", content: "ping" }],
    ...extra,
  }
}

function frame(event: JsonObject): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`)
}

function interactionReply(extra: JsonObject = {}): Promise<Response> {
  return Promise.resolve(
    Response.json({
      id: "v1_test",
      model: "gemini-3.8-flash",
      status: "completed",
      steps: [
        { type: "model_output", content: [{ type: "text", text: "ok" }] },
      ],
      ...extra,
    }),
  )
}

function upstreamStream(events: Array<JsonObject>): Promise<Response> {
  return Promise.resolve(
    new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          for (const event of events) controller.enqueue(frame(event))
          controller.close()
        },
      }),
    ),
  )
}

async function keyError(path: string): Promise<string> {
  try {
    await readApiKey(path)
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
  throw new Error(`Expected readApiKey to reject ${path}`)
}

function streamOf(frames: Array<Uint8Array>): Promise<Response> {
  return Promise.resolve(
    new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          for (const chunk of frames) controller.enqueue(chunk)
          controller.close()
        },
      }),
    ),
  )
}

/** Reads the log exactly as it stands, without waiting for more writes. */
async function lines(path: string): Promise<Array<JsonObject>> {
  const text = await Bun.file(path).text()
  return text
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line) as JsonObject)
}

describe("Interactions bridge boundary", () => {
  test("serves health and rejects unknown routes, wrong methods and upgrades", async () => {
    const handler = bridge()
    const health = await handler(
      new Request(`${ORIGIN}/health`, { method: "GET" }),
    )
    expect(health.status).toBe(200)
    expect(await health.json()).toEqual({
      ok: true,
      mode: "sample",
      upstreamModel: "gemini-3.8-flash",
    })

    const unknown = await handler(post(textRequest(), { path: "/v1/other" }))
    expect(unknown.status).toBe(404)
    expect(((await unknown.json()) as JsonObject).error).toMatchObject({
      code: "not_found",
    })

    const wrongMethod = await handler(
      new Request(`${ORIGIN}/v1/responses`, {
        method: "GET",
        headers: { authorization: `Bearer ${TOKEN}` },
      }),
    )
    expect(wrongMethod.status).toBe(405)

    const upgrade = await handler(
      post(textRequest(), { headers: { upgrade: "websocket" } }),
    )
    expect(upgrade.status).toBe(400)
    expect(((await upgrade.json()) as JsonObject).error).toMatchObject({
      code: "websocket_unsupported",
    })
  })

  test("requires the local token before any conversion work", async () => {
    const handler = bridge()
    const missing = await handler(post(textRequest(), { token: null }))
    expect(missing.status).toBe(401)
    const wrong = await handler(post(textRequest(), { token: "other-token" }))
    expect(wrong.status).toBe(401)
    expect(((await wrong.json()) as JsonObject).error).toMatchObject({
      code: "invalid_token",
    })
    expect((await handler(post(textRequest()))).status).toBe(200)
  })

  test("rejects unsupported Responses requests without calling upstream", async () => {
    let calls = 0
    const handler = bridge({
      mode: "live",
      apiKey: "upstream-key",
      fetchImpl: () => {
        calls += 1
        return Promise.resolve(Response.json({}))
      },
    })
    const response = await handler(
      post(
        textRequest({
          tools: [{ type: "custom", name: "x", format: { type: "grammar" } }],
        }),
      ),
    )
    expect(response.status).toBe(400)
    expect(((await response.json()) as JsonObject).error).toMatchObject({
      code: "unsupported_request",
    })
    expect(calls).toBe(0)
  })

  test("converts a JSON interaction into a Responses envelope", async () => {
    const response = await bridge()(post(textRequest()))
    expect(response.status).toBe(200)
    const body = (await response.json()) as JsonObject
    expect(body).toMatchObject({
      object: "response",
      model: "client-alias",
      status: "completed",
      error: null,
    })
    expect(JSON.stringify(body)).toContain("[bridge sample mode]")
  })

  test("sends only the upstream key and never client credentials", async () => {
    const seen: Array<RequestInit> = []
    const handler = bridge({
      mode: "live",
      apiKey: "upstream-key",
      fetchImpl: (_input, init) => {
        seen.push(init ?? {})
        return interactionReply()
      },
    })
    await handler(post(textRequest(), { headers: { cookie: "session=1" } }))
    expect(seen).toHaveLength(1)
    const headers = (seen[0]?.headers ?? {}) as Record<string, string>
    expect(headers["x-goog-api-key"]).toBe("upstream-key")
    expect(headers.authorization).toBeUndefined()
    expect(headers.cookie).toBeUndefined()
    expect(seen[0]?.redirect).toBe("error")
  })

  test("maps upstream failures and unreadable bodies", async () => {
    const quota = bridge({
      mode: "live",
      apiKey: "upstream-key",
      fetchImpl: () =>
        Promise.resolve(
          Response.json(
            { error: { code: "quota_exceeded", message: "Quota exhausted" } },
            { status: 429 },
          ),
        ),
    })
    const limited = await quota(post(textRequest()))
    expect(limited.status).toBe(429)
    expect(((await limited.json()) as JsonObject).error).toMatchObject({
      code: "quota_exceeded",
      message: "Quota exhausted",
    })

    const garbage = bridge({
      mode: "live",
      apiKey: "upstream-key",
      fetchImpl: () =>
        Promise.resolve(new Response("not json", { status: 200 })),
    })
    const invalid = await garbage(post(textRequest()))
    expect(invalid.status).toBe(502)
    expect(((await invalid.json()) as JsonObject).error).toMatchObject({
      code: "upstream_invalid_json",
    })
  })

  test("keeps concurrent responses independent", async () => {
    const handler = bridge()
    const [first, second] = await Promise.all([
      handler(post(textRequest())),
      handler(post(textRequest())),
    ])
    const firstBody = (await first.json()) as JsonObject
    const secondBody = (await second.json()) as JsonObject
    expect(firstBody.id).not.toBe(secondBody.id)
    const outputs = [firstBody, secondBody].map((body) =>
      (body.output as Array<JsonObject>).map((item) => {
        const { id, ...rest } = item
        expect(id).toBeString()
        return rest
      }),
    )
    expect(outputs[0]).toEqual(outputs[1])
    expect(firstBody.output).not.toEqual(secondBody.output)
  })
})

describe("Interactions bridge records", () => {
  test("keeps the raw request, response and replay values", async () => {
    const directory = await temporaryDirectory()
    const recordPath = join(directory, "records.jsonl")
    const request = textRequest({
      prompt_cache_key: "cache-key-1",
      client_metadata: { "x-codex-turn-metadata": { turn: "t1" } },
    })
    const handler = bridge({
      mode: "live",
      apiKey: "upstream-key",
      recordPath,
      fetchImpl: () =>
        interactionReply({
          id: "v1_record",
          token: "leaked-token-value",
          signature: "leaked-signature-value",
        }),
    })
    await handler(post(request, { headers: { "session-id": "session-raw" } }))

    const records = await lines(recordPath)
    const inbound = records.find((record) => record.phase === "inbound")
    expect((inbound?.headers as JsonObject).authorization).toBe(
      `Bearer ${TOKEN}`,
    )
    expect((inbound?.headers as JsonObject)["session-id"]).toBe("session-raw")
    expect(inbound?.body).toEqual(request)
    expect(
      Buffer.from(String(inbound?.body_base64), "base64").toString("utf8"),
    ).toBe(JSON.stringify(request))

    const converted = records.find((record) => record.phase === "converted")
    expect(converted?.metadata).toEqual({
      "session-id": "session-raw",
      prompt_cache_key: "cache-key-1",
      client_metadata: { "x-codex-turn-metadata": { turn: "t1" } },
    })
    expect(converted?.body).toMatchObject({
      model: "gemini-3.8-flash",
      store: false,
    })

    const upstream = records.find(
      (record) => record.phase === "upstream_request",
    )
    expect((upstream?.headers as JsonObject)["x-goog-api-key"]).toBe(
      "upstream-key",
    )

    const reply = records.find((record) => record.phase === "upstream_json")
    expect(reply?.body).toContain("leaked-token-value")
    expect(reply?.body).toContain("leaked-signature-value")
  })

  test("keeps a long upstream error and an unparsable body verbatim", async () => {
    const directory = await temporaryDirectory()
    const recordPath = join(directory, "records.jsonl")
    const longBody = `x${"y".repeat(9000)}z`
    const failing = bridge({
      mode: "live",
      apiKey: "upstream-key",
      recordPath,
      fetchImpl: () => Promise.resolve(new Response(longBody, { status: 429 })),
    })
    expect((await failing(post(textRequest()))).status).toBe(429)

    const garbage = bridge({
      mode: "live",
      apiKey: "upstream-key",
      recordPath,
      fetchImpl: () =>
        Promise.resolve(new Response("{not json", { status: 200 })),
    })
    expect((await garbage(post(textRequest()))).status).toBe(502)

    const records = await lines(recordPath)
    expect(
      records.find((record) => record.phase === "upstream_error")?.body,
    ).toBe(longBody)
    expect(
      records.find((record) => record.phase === "upstream_json")?.body,
    ).toBe("{not json")
    expect(
      records.find(
        (record) => record.phase === "downstream_json" && record.status === 429,
      )?.body,
    ).toContain("upstream_429")
  })

  test("stores both SSE directions byte for byte", async () => {
    const directory = await temporaryDirectory()
    const recordPath = join(directory, "records.jsonl")
    const signature = "sig-\u00e9\u00e8-\u4e2d\u6587"
    const events = [
      {
        event_type: "interaction.created",
        interaction: { id: "v1_sse", status: "in_progress" },
      },
      { event_type: "step.start", index: 0, step: { type: "thought" } },
      {
        event_type: "step.delta",
        index: 0,
        delta: { type: "thought_signature", signature },
      },
      { event_type: "step.stop", index: 0 },
      {
        event_type: "interaction.completed",
        interaction: { id: "v1_sse", status: "completed" },
      },
    ]
    const upstreamText = events
      .map((event) => `data: ${JSON.stringify(event)}\n\n`)
      .join("")
    const bytes = new TextEncoder().encode(upstreamText)
    // Split inside a multi-byte character and inside a frame.
    const cut = upstreamText.indexOf(signature) + 6
    const head = bytes.slice(0, cut)
    const tail = bytes.slice(cut)
    const handler = bridge({
      mode: "live",
      apiKey: "upstream-key",
      recordPath,
      fetchImpl: () => streamOf([head, tail]),
    })

    const downstream = await (
      await handler(post(textRequest({ stream: true })))
    ).text()
    expect(downstream).toContain("response.completed")

    const records = await lines(recordPath)
    const upstream = Buffer.concat(
      records
        .filter((record) => record.phase === "upstream_sse")
        .map((record) => Buffer.from(String(record.base64), "base64")),
    )
    expect(upstream.toString("utf8")).toBe(upstreamText)
    expect(
      records.find((record) => record.phase === "upstream_stream_head"),
    ).toMatchObject({ status: 200 })
    expect(
      records.find((record) => record.phase === "downstream_stream_head"),
    ).toMatchObject({ status: 200 })
    expect(
      records
        .filter((record) => record.phase === "downstream_sse")
        .map((record) => record.text)
        .join(""),
    ).toBe(downstream)
    const replay = /agdata1\.([\w-]+)/.exec(downstream)
    expect(
      Buffer.from(replay?.[1] ?? "", "base64url").toString("utf8"),
    ).toContain(signature)
    expect(records.at(-1)?.phase).toBe("stream_end")
  })

  test("correlates interleaved requests and flushes every record", async () => {
    const directory = await temporaryDirectory()
    const recordPath = join(directory, "records.jsonl")
    const handler = bridge({
      mode: "live",
      apiKey: "upstream-key",
      recordPath,
      fetchImpl: () => interactionReply(),
    })
    await Promise.all([
      handler(post(textRequest({ prompt_cache_key: "first" }))),
      handler(post(textRequest({ prompt_cache_key: "second" }))),
    ])

    const records = await lines(recordPath)
    expect(records).toHaveLength(10)
    const ids = new Set(records.map((record) => record.id))
    expect(ids.size).toBe(2)
    for (const id of ids) {
      const phases = records
        .filter((record) => record.id === id)
        .map((record) => record.phase)
      expect(phases).toEqual([
        "inbound",
        "converted",
        "upstream_request",
        "upstream_json",
        "downstream_json",
      ])
    }
  })
})

describe("Interactions bridge record bytes", () => {
  test("records an unparsable inbound body", async () => {
    const directory = await temporaryDirectory()
    const recordPath = join(directory, "records.jsonl")
    const response = await bridge({ recordPath })(
      new Request(`${ORIGIN}/v1/responses`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${TOKEN}`,
          "content-type": "application/json",
        },
        body: '{"model":',
      }),
    )
    expect(response.status).toBe(400)
    const records = await lines(recordPath)
    expect(records).toHaveLength(2)
    expect(records[0]).toMatchObject({
      phase: "invalid_json",
      body: '{"model":',
    })
    expect(
      Buffer.from(String(records[0]?.body_base64), "base64").toString("utf8"),
    ).toBe('{"model":')
    expect(records[1]).toMatchObject({
      phase: "downstream_json",
      status: 400,
    })
  })

  test("records inbound bytes that are not valid UTF-8", async () => {
    const directory = await temporaryDirectory()
    const recordPath = join(directory, "records.jsonl")
    const bytes = Uint8Array.from([0x7b, 0xff])
    const response = await bridge({ recordPath })(
      new Request(`${ORIGIN}/v1/responses`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${TOKEN}`,
          "content-type": "application/json",
        },
        body: bytes,
      }),
    )
    expect(response.status).toBe(400)
    const records = await lines(recordPath)
    const invalid = records.find((record) => record.phase === "invalid_json")
    expect(Buffer.from(String(invalid?.body_base64), "base64")).toEqual(
      Buffer.from(bytes),
    )
  })

  test("records an upstream chunk whose tail is a split character", async () => {
    const directory = await temporaryDirectory()
    const recordPath = join(directory, "records.jsonl")
    const head = frame({
      event_type: "interaction.created",
      interaction: { id: "v1_cut", status: "in_progress" },
    })
    // Half of a three-byte character: a text decoder replaces or drops it.
    const split = new TextEncoder().encode("中").slice(0, 2)
    const chunk = Uint8Array.from([...head, ...split])
    const handler = bridge({
      mode: "live",
      apiKey: "upstream-key",
      recordPath,
      fetchImpl: () => streamOf([chunk]),
    })
    await (await handler(post(textRequest({ stream: true })))).text()
    const records = await lines(recordPath)
    const recorded = Buffer.concat(
      records
        .filter((record) => record.phase === "upstream_sse")
        .map((record) => Buffer.from(String(record.base64), "base64")),
    )
    expect(recorded).toEqual(Buffer.from(chunk))
    expect(recorded.subarray(-2)).toEqual(Buffer.from(split))
  })

  test("records rejected answers and their headers", async () => {
    const directory = await temporaryDirectory()
    const recordPath = join(directory, "records.jsonl")
    const handler = bridge({ recordPath })
    expect(
      (await handler(post(textRequest(), { token: "wrong" }))).status,
    ).toBe(401)
    expect((await handler(post(textRequest(), { path: "/nope" }))).status).toBe(
      404,
    )
    const records = await lines(recordPath)
    const answers = records.filter(
      (record) => record.phase === "downstream_json",
    )
    expect(answers.map((record) => record.status)).toEqual([401, 404])
    expect(JSON.parse(String(answers[0]?.body))).toMatchObject({
      error: { code: "invalid_token" },
    })
    for (const record of answers)
      expect((record.headers as JsonObject)["content-type"]).toContain(
        "application/json",
      )
  })
})

describe("Interactions bridge upstream failures", () => {
  test.each([401, 403, 500, 503])(
    "maps an opaque upstream %i body without inventing a success",
    async (status) => {
      const handler = bridge({
        mode: "live",
        apiKey: "upstream-key",
        fetchImpl: () => Promise.resolve(new Response("denied", { status })),
      })
      const response = await handler(post(textRequest()))
      expect(response.status).toBe(status)
      expect(((await response.json()) as JsonObject).error).toMatchObject({
        code: `upstream_${status}`,
      })
    },
  )

  test("reports an unreachable upstream and a stalled head as 502", async () => {
    const refused = bridge({
      mode: "live",
      apiKey: "upstream-key",
      fetchImpl: () => Promise.reject(new Error("connect ECONNREFUSED")),
    })
    const unreachable = await refused(post(textRequest()))
    expect(unreachable.status).toBe(502)
    expect(((await unreachable.json()) as JsonObject).error).toMatchObject({
      code: "upstream_unreachable",
    })

    const stalled = bridge({
      mode: "live",
      apiKey: "upstream-key",
      headerTimeoutMs: 20,
      fetchImpl: (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new Error("aborted by header timeout")),
          )
        }),
    })
    const timedOut = await stalled(post(textRequest()))
    expect(timedOut.status).toBe(502)
    expect(((await timedOut.json()) as JsonObject).error).toMatchObject({
      code: "upstream_unreachable",
    })
  })
})

describe("Interactions bridge streaming", () => {
  test("converts a streamed interaction into Responses SSE", async () => {
    const response = await bridge()(post(textRequest({ stream: true })))
    expect(response.headers.get("content-type")).toBe("text/event-stream")
    const text = await response.text()
    expect(text).toContain("response.output_text.delta")
    expect(text).toContain("response.completed")
    expect(text).not.toContain("response.failed")
  })

  test("fails a truncated stream instead of reporting success", async () => {
    const handler = bridge({
      mode: "live",
      apiKey: "upstream-key",
      fetchImpl: () =>
        upstreamStream([
          {
            event_type: "interaction.created",
            interaction: { id: "v1_cut", status: "in_progress" },
          },
          {
            event_type: "step.start",
            index: 0,
            step: { type: "model_output" },
          },
          {
            event_type: "step.delta",
            index: 0,
            delta: { type: "text", text: "partial" },
          },
        ]),
    })
    const text = await (
      await handler(post(textRequest({ stream: true })))
    ).text()
    expect(text).toContain("partial")
    expect(text).toContain("response.failed")
    expect(text).not.toContain("response.completed")
  })

  test("fails an idle stream on timeout instead of reporting success", async () => {
    const handler = bridge({
      mode: "live",
      apiKey: "upstream-key",
      idleTimeoutMs: 20,
      fetchImpl: (_input, init) =>
        Promise.resolve(
          new Response(
            new ReadableStream<Uint8Array>({
              start(controller) {
                controller.enqueue(
                  frame({
                    event_type: "interaction.created",
                    interaction: { id: "v1_idle", status: "in_progress" },
                  }),
                )
                init?.signal?.addEventListener("abort", () =>
                  controller.error(new Error("aborted by idle timeout")),
                )
              },
            }),
          ),
        ),
    })
    const text = await (
      await handler(post(textRequest({ stream: true })))
    ).text()
    expect(text).toContain("response.failed")
    expect(text).not.toContain("response.completed")
  })

  test("releases the upstream reader on cancel and keeps serving", async () => {
    let released = false
    const handler = bridge({
      mode: "live",
      apiKey: "upstream-key",
      fetchImpl: () =>
        Promise.resolve(
          new Response(
            new ReadableStream<Uint8Array>({
              start(controller) {
                controller.enqueue(
                  frame({
                    event_type: "interaction.created",
                    interaction: { id: "v1_slow", status: "in_progress" },
                  }),
                )
              },
              cancel() {
                released = true
              },
            }),
          ),
        ),
    })
    const streamed = await handler(post(textRequest({ stream: true })))
    await streamed.body?.cancel()
    expect(released).toBe(true)

    const later = await bridge()(post(textRequest()))
    expect(later.status).toBe(200)
  })

  test("aborts the upstream call when the client disconnects", async () => {
    let aborted = false
    const handler = bridge({
      mode: "live",
      apiKey: "upstream-key",
      fetchImpl: (_input, init) => {
        init?.signal?.addEventListener("abort", () => {
          aborted = true
        })
        // Never closes, so the pump is still reading when the client leaves.
        return Promise.resolve(
          new Response(
            new ReadableStream<Uint8Array>({
              start(controller) {
                controller.enqueue(
                  frame({
                    event_type: "interaction.created",
                    interaction: { id: "v1_abort", status: "in_progress" },
                  }),
                )
              },
            }),
          ),
        )
      },
    })
    const client = new AbortController()
    const response = await handler(
      post(textRequest({ stream: true }), { signal: client.signal }),
    )
    const reader = (response.body as ReadableStream<Uint8Array>).getReader()
    await reader.read()
    client.abort()
    expect(aborted).toBe(true)
    await reader.cancel().catch(() => {})
  })
})

describe("Interactions bridge key resolution", () => {
  test("refuses the shipped placeholder before any upstream call", async () => {
    expect(
      await keyError("scripts/interactions-codex-live.example.json"),
    ).toContain("gemini_api_key")
  })

  test("rejects missing files, bad JSON, missing and empty values", async () => {
    const directory = await temporaryDirectory()
    const absent = join(directory, "absent.json")
    expect(await keyError(absent)).toContain("Cannot read key file")

    const notJson = join(directory, "broken.json")
    await writeFile(notJson, "nope")
    expect(await keyError(notJson)).toContain("is not JSON")

    const noKey = join(directory, "no-key.json")
    await writeFile(noKey, JSON.stringify({ other: true }))
    expect(await keyError(noKey)).toContain("gemini_api_key")

    const emptyKey = join(directory, "empty-key.json")
    await writeFile(emptyKey, JSON.stringify({ gemini_api_key: "" }))
    expect(await keyError(emptyKey)).toContain(
      "is missing or still a placeholder",
    )
  })

  test("resolves the key from a single JSON field", async () => {
    const directory = await temporaryDirectory()
    const keyFile = join(directory, "gemini-key.json")
    await writeFile(keyFile, JSON.stringify({ gemini_api_key: "resolved-key" }))
    expect(await readApiKey(keyFile)).toBe("resolved-key")
  })
})
