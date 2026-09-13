import type { ClientRequest, IncomingMessage, Server } from "node:http"

import { afterAll, describe, expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { createServer, request as httpRequest } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { gzipSync } from "node:zlib"

import { AntigravityCredentialStore } from "../src/services/antigravity/auth"
import { createAntigravityProxyServer } from "../src/services/antigravity/proxy"

const directories: Array<string> = []
const servers: Array<Server> = []

afterAll(async () => {
  for (const server of servers) await closeServer(server)
  for (const directory of directories)
    await rm(directory, { force: true, recursive: true })
})

interface StreamWriter {
  /** Ends the response normally. */
  end: () => void
  /** Destroys the connection mid-body, without ending the response. */
  fail: () => void
  /** Writes bytes immediately; the mock never buffers on its own. */
  write: (chunk: Buffer) => void
}

interface StreamingUpstream {
  /** Resolves true only when the client cancelled before the response ended. */
  cancelled: Promise<true>
  origin: string
  started: Promise<StreamWriter>
}

async function startStreamingUpstream(
  headers: Record<string, string> = {
    "cache-control": "no-store",
    "content-type": "text/event-stream",
  },
): Promise<StreamingUpstream> {
  const started = Promise.withResolvers<StreamWriter>()
  const cancelled = Promise.withResolvers<true>()
  let completed = false

  const server = createServer((request, response) => {
    request.socket.on("close", () => {
      if (!completed) cancelled.resolve(true)
    })
    request.on("aborted", () => {
      cancelled.resolve(true)
    })
    response.writeHead(200, headers)
    // Flush the head before any body byte so the client can observe the
    // response while the mock still holds the body open.
    response.flushHeaders()
    started.resolve({
      end: () => {
        completed = true
        response.end()
      },
      fail: () => {
        response.socket?.destroy()
      },
      write: (chunk) => {
        response.write(chunk)
      },
    })
  })
  await listen(server)
  servers.push(server)
  return {
    cancelled: cancelled.promise,
    origin: `http://127.0.0.1:${portOf(server)}`,
    started: started.promise,
  }
}

interface OpenStream {
  request: ClientRequest
  response: IncomingMessage
}

async function openStream(
  port: number,
  path = "/v1beta/interactions",
): Promise<OpenStream> {
  const opened = Promise.withResolvers<OpenStream>()
  const request = httpRequest(
    { host: "127.0.0.1", method: "POST", path, port },
    (response) => opened.resolve({ request, response }),
  )
  request.on("error", () => {
    // Cancellation and truncation both surface here on purpose; the body
    // assertions below decide whether the truncation was faithful.
  })
  request.end()
  return await opened.promise
}

async function startProxy(upstreamOrigin: string): Promise<number> {
  const directory = await mkdtemp(join(tmpdir(), "antigravity-stream-"))
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

async function nextChunk(iterator: AsyncIterator<unknown>): Promise<Buffer> {
  const step = await iterator.next()
  if (step.done === true)
    throw new Error("stream ended before the expected chunk arrived")
  return Buffer.from(step.value as Uint8Array)
}

async function readAll(iterator: AsyncIterator<unknown>): Promise<Buffer> {
  const chunks: Array<Buffer> = []
  for (;;) {
    const step = await iterator.next()
    if (step.done === true) break
    chunks.push(Buffer.from(step.value as Uint8Array))
  }
  return Buffer.concat(chunks)
}

function iteratorOf(response: IncomingMessage): AsyncIterator<unknown> {
  return response[Symbol.asyncIterator]()
}

/** Fails loudly instead of hanging when a stream never progresses. */
function withTimeout<T>(
  promise: Promise<T>,
  milliseconds: number,
  label: string,
): Promise<T> {
  const expiry = Promise.withResolvers<never>()
  const handle = setTimeout(() => {
    expiry.reject(new Error(`Timed out waiting for ${label}`))
  }, milliseconds)
  return Promise.race([promise, expiry.promise]).finally(() => {
    clearTimeout(handle)
  })
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

const EXAMPLE_EVENT =
  'event: interaction.delta\ndata: {"delta":"héllo 漢字"}\n\n'
const KEEPALIVE = ": keep-alive\n\n"

describe("Antigravity proxy streaming", () => {
  test("reassembles the upstream byte stream exactly across awkward chunk boundaries", async () => {
    const upstream = await startStreamingUpstream()
    const port = await startProxy(upstream.origin)
    const payload = Buffer.from(
      `${KEEPALIVE}${EXAMPLE_EVENT}data: {"delta":"ok"}\r\n\r\nevent: interaction.complete\ndata: [DONE]\n\n`,
    )

    const { response } = await openStream(port)
    const iterator = iteratorOf(response)
    const writer = await upstream.started

    const text = payload.toString()
    const splits = [
      text.indexOf("data:") + 2,
      Buffer.byteLength(text.slice(0, text.indexOf("é"))) + 1,
      text.indexOf("\r\n") + 1,
      text.indexOf("\n\n") + 2,
      text.indexOf("[DONE]") + 3,
    ].sort((left, right) => left - right)

    let previous = 0
    for (const split of splits) {
      writer.write(payload.subarray(previous, split))
      previous = split
    }
    writer.write(payload.subarray(previous))
    writer.end()

    const received = await readAll(iterator)
    expect(received.equals(payload)).toBe(true)
    expect(received.toString().includes("é")).toBe(true)
  })

  test("delivers the first chunk before the upstream finishes the body", async () => {
    const upstream = await startStreamingUpstream()
    const port = await startProxy(upstream.origin)
    const first = Buffer.from(
      'event: interaction.delta\ndata: {"delta":"one"}\n\n',
    )
    const second = Buffer.from("data: [DONE]\n\n")

    const { response } = await openStream(port)
    const iterator = iteratorOf(response)
    const writer = await upstream.started

    writer.write(first)
    const received = await withTimeout(
      nextChunk(iterator),
      2_000,
      "the first streamed chunk (the upstream body is still open)",
    )
    expect(received.equals(first)).toBe(true)

    writer.write(second)
    writer.end()
    const rest = await readAll(iterator)
    expect(
      Buffer.concat([received, rest]).equals(Buffer.concat([first, second])),
    ).toBe(true)
  })

  test("passes comments, unknown events, empty frames, and terminators through unchanged", async () => {
    const upstream = await startStreamingUpstream()
    const port = await startProxy(upstream.origin)
    const payload = Buffer.from(
      `${KEEPALIVE}\n\nevent: interaction.unknown\ndata: {"x":1}\n\n`
        + 'data: {"usage":{"total_tokens":5}}\n\n'
        + "data: [DONE]\n\n",
    )

    const { response } = await openStream(port)
    const iterator = iteratorOf(response)
    const writer = await upstream.started
    writer.write(payload)
    writer.end()

    const received = await readAll(iterator)
    expect(received.equals(payload)).toBe(true)
    expect(received.toString().endsWith("[DONE]\n\n")).toBe(true)
  })

  test("leaves a stream that ends without a terminator untouched", async () => {
    const upstream = await startStreamingUpstream()
    const port = await startProxy(upstream.origin)
    const payload = Buffer.from(EXAMPLE_EVENT)

    const { response } = await openStream(port)
    const iterator = iteratorOf(response)
    const writer = await upstream.started
    writer.write(payload)
    writer.end()

    const received = await readAll(iterator)
    expect(received.equals(payload)).toBe(true)
    expect(received.toString().includes("[DONE]")).toBe(false)
    expect(received.toString().endsWith("\n\n")).toBe(true)
  })
})

describe("Antigravity proxy stream interruption", () => {
  test("cancels the upstream request when the client aborts mid-stream", async () => {
    const upstream = await startStreamingUpstream()
    const port = await startProxy(upstream.origin)

    const opened = await openStream(port)
    const iterator = iteratorOf(opened.response)
    const writer = await upstream.started
    writer.write(Buffer.from(EXAMPLE_EVENT))
    await nextChunk(iterator)

    opened.request.destroy()
    expect(
      await withTimeout(
        upstream.cancelled,
        2_000,
        "the upstream to observe the cancelled client",
      ),
    ).toBe(true)
  })

  test("does not turn an abrupt upstream close into a completed stream", async () => {
    const upstream = await startStreamingUpstream()
    const port = await startProxy(upstream.origin)
    const partial = Buffer.from(
      'event: interaction.delta\ndata: {"delta":"trun',
    )

    const { response } = await openStream(port)
    const iterator = iteratorOf(response)
    const writer = await upstream.started
    writer.write(partial)
    const first = await nextChunk(iterator)
    writer.fail()

    const received: Array<Buffer> = [first]
    let failed = false
    try {
      received.push(await readAll(iterator))
    } catch {
      failed = true
    }

    const all = Buffer.concat(received)
    // A normal-looking completion would be a full event or an appended frame.
    expect(all.equals(partial)).toBe(true)
    expect(all.toString().includes("[DONE]")).toBe(false)
    expect(failed || !response.complete).toBe(true)
  })

  test("keeps a compressed body and its Content-Encoding header consistent", async () => {
    const upstream = await startStreamingUpstream({
      "content-encoding": "gzip",
      "content-type": "text/event-stream",
    })
    const port = await startProxy(upstream.origin)
    const compressed = gzipSync(Buffer.from(EXAMPLE_EVENT))

    const { response } = await openStream(port)
    const iterator = iteratorOf(response)
    const writer = await upstream.started
    writer.write(compressed.subarray(0, 4))
    writer.write(compressed.subarray(4))
    writer.end()

    const received = await readAll(iterator)
    expect(response.headers["content-encoding"]).toBe("gzip")
    expect(received.equals(compressed)).toBe(true)
    // The proxy must not decompress and leave a stale Content-Encoding behind.
    expect(received.equals(Buffer.from(EXAMPLE_EVENT))).toBe(false)
  })
})
