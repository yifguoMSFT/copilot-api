import type { IncomingHttpHeaders, Server, ServerResponse } from "node:http"

/**
 * Wires the two independent pieces together the way a caller would: Responses
 * in, `convertResponsesRequestToInteractions`, the resulting body sent to the
 * Antigravity proxy, a mock native Interactions upstream, then the reply back
 * through the Responses converters. Neither module imports the other; this
 * test file is the only place they meet.
 */
import { afterAll, describe, expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { createServer, request as httpRequest } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { AntigravityCredentialStore } from "../src/services/antigravity/auth"
import { createAntigravityProxyServer } from "../src/services/antigravity/proxy"
import {
  type JsonObject,
  convertInteractionsResponseToResponses,
  convertResponsesRequestToInteractions,
} from "../src/services/interactions/convert"
import { createInteractionsEventStream } from "../src/services/interactions/stream"
import fixture from "./fixtures/interactions/offline-round-trip.json"
import simpleResponse from "./fixtures/interactions/simple-response.json"
import { events, frame } from "./support/interactions-stream"

const directories: Array<string> = []
const servers: Array<Server> = []

afterAll(async () => {
  for (const server of servers) await closeServer(server)
  for (const directory of directories)
    await rm(directory, { force: true, recursive: true })
})

interface RecordedRequest {
  body: JsonObject
  headers: IncomingHttpHeaders
  url: string | undefined
}

interface NativeUpstream {
  origin: string
  requests: Array<RecordedRequest>
}

async function startNativeUpstream(
  respond: (recorded: RecordedRequest, response: ServerResponse) => void,
): Promise<NativeUpstream> {
  const requests: Array<RecordedRequest> = []
  const server = createServer((request, response) => {
    const chunks: Array<Buffer> = []
    request.on("data", (chunk: Buffer) => chunks.push(chunk))
    request.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8")
      const recorded: RecordedRequest = {
        body: (text === "" ? {} : JSON.parse(text)) as JsonObject,
        headers: request.headers,
        url: request.url,
      }
      requests.push(recorded)
      respond(recorded, response)
    })
  })
  await listen(server)
  servers.push(server)
  return { origin: `http://127.0.0.1:${portOf(server)}`, requests }
}

async function startProxy(upstreamOrigin: string): Promise<number> {
  const directory = await mkdtemp(join(tmpdir(), "antigravity-integration-"))
  directories.push(directory)
  const credentialPath = join(directory, "antigravity-test.json")
  await writeFile(
    credentialPath,
    JSON.stringify({
      access_token: "access-token-value",
      expired: new Date(Date.now() + 3_600_000).toISOString(),
      refresh_token: "refresh-token-value",
    }),
  )
  const server = createAntigravityProxyServer({
    credentialStore: new AntigravityCredentialStore(credentialPath),
    host: "127.0.0.1",
    upstreamOrigin,
  })
  await listen(server)
  servers.push(server)
  return portOf(server)
}

async function postInteractions(
  port: number,
  body: unknown,
): Promise<{ chunks: Array<Buffer>; status: number }> {
  const { promise, reject, resolve } = Promise.withResolvers<{
    chunks: Array<Buffer>
    status: number
  }>()
  const request = httpRequest(
    {
      headers: { "content-type": "application/json" },
      host: "127.0.0.1",
      method: "POST",
      path: "/v1beta/interactions",
      port,
    },
    (response) => {
      const chunks: Array<Buffer> = []
      response.on("data", (chunk: Buffer) => chunks.push(chunk))
      response.on("error", reject)
      response.on("end", () =>
        resolve({ chunks, status: response.statusCode ?? 0 }),
      )
    },
  )
  request.on("error", reject)
  request.end(Buffer.from(JSON.stringify(body)))
  return await promise
}

async function postJson(
  port: number,
  body: unknown,
): Promise<{ json: JsonObject; status: number }> {
  const { chunks, status } = await postInteractions(port, body)
  const text = Buffer.concat(chunks).toString("utf8")
  return { json: (text === "" ? {} : JSON.parse(text)) as JsonObject, status }
}

/** The text of the first output item of a converted Responses response. */
function textOf(response: JsonObject): string {
  const output = response.output as Array<JsonObject>
  const content = (output[0].content ?? []) as Array<JsonObject>
  return content
    .map((part) => (typeof part.text === "string" ? part.text : ""))
    .join("")
}

function itemsOf(response: JsonObject): Array<JsonObject> {
  return response.output as Array<JsonObject>
}

async function listen(server: Server): Promise<void> {
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve())
  })
}

async function closeServer(server: Server): Promise<void> {
  server.closeAllConnections()
  await new Promise<void>((resolve) => {
    server.close(() => resolve())
  })
}

function portOf(server: Server): number {
  const address = server.address()
  return typeof address === "object" && address !== null ? address.port : 0
}

const CLIENT_MODEL = "client-alias"
const UPSTREAM_MODEL = "gemini-3.8-flash"
const TOOL_DECLARATIONS = [
  {
    name: "weather",
    parameters: {
      properties: { city: { type: "string" } },
      type: "object",
    },
    type: "function",
  },
  { name: "patch", type: "custom" },
]

describe("Responses request through the Antigravity proxy", () => {
  test("plain text, non-streaming", async () => {
    const upstream = await startNativeUpstream((_recorded, response) => {
      response.writeHead(200, { "content-type": "application/json" })
      response.end(JSON.stringify(simpleResponse))
    })
    const port = await startProxy(upstream.origin)

    const converted = convertResponsesRequestToInteractions(
      { input: "hello", instructions: "be brief", model: CLIENT_MODEL },
      { requestedModel: CLIENT_MODEL, upstreamModel: UPSTREAM_MODEL },
    )
    const { json, status } = await postJson(port, converted.body)
    expect(status).toBe(200)

    const result = convertInteractionsResponseToResponses(json, {
      requestedModel: CLIENT_MODEL,
      tools: converted.tools,
    })
    expect(result.status).toBe("completed")
    expect(result.model).toBe(CLIENT_MODEL)
    expect(textOf(result)).toContain("Hello!")

    expect(upstream.requests).toHaveLength(1)
    expect(upstream.requests[0].url).toBe("/v1beta/interactions")
    expect(upstream.requests[0].headers.authorization).toBe(
      "Bearer access-token-value",
    )
    expect(upstream.requests[0].body).toEqual(converted.body)
  })

  test("plain text, streaming, with the SSE frames split across chunks", async () => {
    const upstream = await startNativeUpstream((_recorded, response) => {
      response.writeHead(200, { "content-type": "text/event-stream" })
      response.flushHeaders()
      const payload = Buffer.from(
        fixture.events.map((event) => frame(event)).join(""),
      )
      // Deliberately awkward: one event per write, with the first frame cut in
      // half so the caller never sees a whole frame per chunk.
      const cuts = [7, Math.floor(payload.length / 2), payload.length]
      let previous = 0
      for (const cut of cuts) {
        response.write(payload.subarray(previous, cut))
        previous = cut
      }
      response.end()
    })
    const port = await startProxy(upstream.origin)

    const converted = convertResponsesRequestToInteractions(
      {
        input: "use both tools",
        model: CLIENT_MODEL,
        stream: true,
        tools: TOOL_DECLARATIONS,
      },
      { requestedModel: CLIENT_MODEL, upstreamModel: UPSTREAM_MODEL },
    )
    const { chunks, status } = await postInteractions(port, converted.body)
    expect(status).toBe(200)
    expect(chunks.length).toBeGreaterThan(1)

    const stream = createInteractionsEventStream({
      requestedModel: CLIENT_MODEL,
      tools: converted.tools,
    })
    let output = ""
    for (const chunk of chunks) output += stream.push(chunk)
    output += stream.flush()

    const received = events(output)
    const final = received.at(-1)
    expect(final?.type).toBe("response.completed")
    // The streamed envelope must agree with the non-streaming conversion of
    // the same interaction rather than with a status this test invents.
    expect(final?.response).toEqual(
      convertInteractionsResponseToResponses(fixture.interaction, {
        requestedModel: CLIENT_MODEL,
        tools: converted.tools,
      }),
    )
    expect(
      received.some((event) => event.type === "response.output_item.done"),
    ).toBe(true)
  })

  test("carries a tool call and its result onto the next turn with the identity map", async () => {
    const upstream = await startNativeUpstream((_recorded, response) => {
      response.writeHead(200, { "content-type": "application/json" })
      response.end(JSON.stringify(fixture.interaction))
    })
    const port = await startProxy(upstream.origin)

    const request = {
      input: [{ content: "check weather and patch", role: "user" }],
      model: CLIENT_MODEL,
      store: false,
      tools: TOOL_DECLARATIONS,
    }
    const converted = convertResponsesRequestToInteractions(request, {
      requestedModel: CLIENT_MODEL,
      upstreamModel: UPSTREAM_MODEL,
    })
    const { json } = await postJson(port, converted.body)
    const first = convertInteractionsResponseToResponses(json, {
      requestedModel: CLIENT_MODEL,
      tools: converted.tools,
    })

    const calls = itemsOf(first).filter(
      (item) =>
        item.type === "function_call" || item.type === "custom_tool_call",
    )
    expect(calls.map((item) => item.name)).toEqual(["weather", "patch"])
    expect(converted.tools.size).toBe(2)

    const next = convertResponsesRequestToInteractions(
      {
        ...request,
        input: [
          ...(request.input as Array<JsonObject>),
          ...itemsOf(first),
          {
            call_id: "call_weather",
            output: "sunny\n",
            type: "function_call_output",
          },
        ],
        previous_response_id: "v1_parent",
      },
      {
        requestedModel: CLIENT_MODEL,
        tools: converted.tools,
        upstreamModel: UPSTREAM_MODEL,
      },
    )
    expect((next.body.input as Array<JsonObject>).at(-1)).toEqual({
      call_id: "call_weather",
      name: "weather",
      result: [{ text: "sunny\n", type: "text" }],
      type: "function_result",
    })
  })

  test("replays a signed thought carried in encrypted_content", async () => {
    const thought = {
      signature: "opaque-signature",
      summary: [{ text: "checking", type: "text" }],
      type: "thought",
    }
    const upstream = await startNativeUpstream((_recorded, response) => {
      response.writeHead(200, { "content-type": "application/json" })
      response.end(
        JSON.stringify({
          id: "v1_thought",
          model: UPSTREAM_MODEL,
          status: "completed",
          steps: [thought],
        }),
      )
    })
    const port = await startProxy(upstream.origin)

    const first = convertResponsesRequestToInteractions(
      { input: "think", model: CLIENT_MODEL },
      { requestedModel: CLIENT_MODEL, upstreamModel: UPSTREAM_MODEL },
    )
    const { json } = await postJson(port, first.body)
    const [reasoning] = itemsOf(
      convertInteractionsResponseToResponses(json, {
        requestedModel: CLIENT_MODEL,
        tools: first.tools,
      }),
    )
    expect(reasoning.type).toBe("reasoning")
    expect(String(reasoning.encrypted_content)).toStartWith("agdata1.")

    const replayed = convertResponsesRequestToInteractions(
      {
        input: [reasoning, { content: "continue", role: "user" }],
        model: CLIENT_MODEL,
      },
      { requestedModel: CLIENT_MODEL, upstreamModel: UPSTREAM_MODEL },
    )
    expect((replayed.body.input as Array<JsonObject>)[0]).toEqual(thought)
  })

  test("forwards a parent id verbatim and keeps the caller metadata local", async () => {
    const upstream = await startNativeUpstream((_recorded, response) => {
      response.writeHead(200, { "content-type": "application/json" })
      response.end(JSON.stringify(simpleResponse))
    })
    const port = await startProxy(upstream.origin)

    const converted = convertResponsesRequestToInteractions(
      {
        client_metadata: { trace: "t1" },
        input: "next",
        model: CLIENT_MODEL,
        previous_response_id: "v1_parent",
        prompt_cache_key: "cache-stable",
      },
      { requestedModel: CLIENT_MODEL, upstreamModel: UPSTREAM_MODEL },
    )
    expect(converted.metadata.prompt_cache_key).toBe("cache-stable")
    expect(converted.metadata.client_metadata).toEqual({ trace: "t1" })
    expect(converted.body).not.toHaveProperty("prompt_cache_key")
    expect(converted.body).not.toHaveProperty("client_metadata")

    await postJson(port, converted.body)
    const seen = upstream.requests[0].body
    expect(seen.previous_interaction_id).toBe("v1_parent")
    expect(seen).not.toHaveProperty("prompt_cache_key")
    expect(seen).not.toHaveProperty("client_metadata")
  })
})

describe("Antigravity proxy and converter decoupling", () => {
  test("no Antigravity file imports the Interactions converter", async () => {
    const antigravityFiles = [
      "scripts/antigravity-proxy.ts",
      "src/services/antigravity/auth.ts",
      "src/services/antigravity/proxy.ts",
      "tests/antigravity-auth.test.ts",
      "tests/antigravity-proxy-entry.test.ts",
      "tests/antigravity-proxy-stream.test.ts",
      "tests/antigravity-proxy.test.ts",
    ]
    for (const file of antigravityFiles) {
      const source = await Bun.file(file).text()
      expect(source).not.toContain("services/interactions")
    }
  })
})
