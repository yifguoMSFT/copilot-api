import type { MiddlewareHandler } from "hono"

import consola from "consola"
import { AsyncLocalStorage } from "node:async_hooks"
import { createHash, randomUUID } from "node:crypto"
import { mkdir } from "node:fs/promises"
import path from "node:path"

type SqlValue = string | number | Uint8Array | null
interface DumpDatabase {
  exec: (sql: string) => unknown
  prepare: (sql: string) => {
    run: (...values: Array<SqlValue>) => unknown
    finalize?: () => void
  }
  close: () => void
}

const credentialHeaders = new Set([
  "authorization",
  "proxy-authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "api-key",
])

const dumpHeaders = (headers: Headers): string =>
  JSON.stringify(
    Object.fromEntries(
      Array.from(headers, ([name, value]) => [
        name,
        credentialHeaders.has(name) ? "[REDACTED]" : value,
      ]),
    ),
  )

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

export const requestDumpPath = path.resolve("logs/requests.sqlite")

export class RequestDump {
  private readonly database: DumpDatabase

  constructor(database: DumpDatabase) {
    this.database = database
    database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA busy_timeout = 1000;
      CREATE TABLE IF NOT EXISTS requests (
        id TEXT PRIMARY KEY,
        trace_id TEXT NOT NULL,
        stage TEXT NOT NULL CHECK(stage IN ('incoming', 'upstream')),
        started_at TEXT NOT NULL,
        finished_at TEXT,
        method TEXT NOT NULL,
        url TEXT NOT NULL,
        headers_json TEXT NOT NULL,
        body BLOB,
        body_bytes INTEGER,
        body_sha256 TEXT,
        model TEXT,
        status INTEGER,
        response_headers_json TEXT,
        error TEXT,
        capture_error TEXT
      );
      CREATE INDEX IF NOT EXISTS requests_trace ON requests(trace_id);
      CREATE INDEX IF NOT EXISTS requests_time ON requests(started_at);
      CREATE INDEX IF NOT EXISTS requests_model ON requests(model, started_at);
    `)
  }

  // Capture failures must not change the proxied request or response.
  private write(sql: string, ...values: Array<SqlValue>): void {
    try {
      const statement = this.database.prepare(sql)
      try {
        statement.run(...values)
      } finally {
        statement.finalize?.()
      }
    } catch (error) {
      consola.warn("Could not write request dump", errorMessage(error))
    }
  }

  async start(
    request: Request,
    traceId: string,
    stage: "incoming" | "upstream",
  ): Promise<string> {
    const id = randomUUID()
    this.write(
      `INSERT INTO requests
       (id, trace_id, stage, started_at, method, url, headers_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      id,
      traceId,
      stage,
      new Date().toISOString(),
      request.method,
      request.url,
      dumpHeaders(request.headers),
    )
    try {
      const body = new Uint8Array(await request.clone().arrayBuffer())
      this.write(
        `UPDATE requests SET body = ?, body_bytes = ?, body_sha256 = ?,
         model = ? WHERE id = ?`,
        body,
        body.byteLength,
        createHash("sha256").update(body).digest("hex"),
        readModel(body),
        id,
      )
    } catch (error) {
      this.write(
        "UPDATE requests SET capture_error = ? WHERE id = ?",
        errorMessage(error),
        id,
      )
      consola.warn("Could not capture request body", errorMessage(error))
    }
    return id
  }

  finish(id: string, response?: Response, error?: unknown): void {
    this.write(
      `UPDATE requests SET finished_at = ?, status = ?,
       response_headers_json = ?, error = ? WHERE id = ?`,
      new Date().toISOString(),
      response?.status ?? null,
      response ? dumpHeaders(response.headers) : null,
      error === undefined ? null : errorMessage(error),
      id,
    )
  }

  close(): void {
    this.database.close()
  }
}

const readModel = (body: Uint8Array): string | null => {
  try {
    const payload: unknown = JSON.parse(new TextDecoder().decode(body))
    if (
      payload !== null
      && typeof payload === "object"
      && "model" in payload
      && typeof payload.model === "string"
    ) {
      return payload.model
    }
  } catch {
    // Non-JSON and malformed requests are still stored byte-for-byte.
  }
  return null
}

export async function openRequestDump(filePath: string): Promise<RequestDump> {
  await mkdir(path.dirname(filePath), { recursive: true })
  // Keep SQLite optional when dumping is disabled, on both supported runtimes.
  if (typeof Bun !== "undefined") {
    const { Database } = await import("bun:sqlite")
    return new RequestDump(new Database(filePath, { create: true }))
  }
  const { DatabaseSync } = await import("node:sqlite")
  return new RequestDump(new DatabaseSync(filePath))
}

let activeDump: RequestDump | undefined

export const setRequestDump = (dump: RequestDump | undefined): void => {
  activeDump = dump
}

export async function configureRequestDump(enabled?: boolean): Promise<void> {
  activeDump?.close()
  activeDump = undefined
  if (!enabled) return
  setRequestDump(await openRequestDump(requestDumpPath))
  consola.info("Request dump database:", requestDumpPath)
}

const requestContext = new AsyncLocalStorage<{
  dump: RequestDump
  traceId: string
}>()

export const requestDumpMiddleware: MiddlewareHandler = async (c, next) => {
  const dump = activeDump
  if (dump === undefined) return next()
  const traceId = randomUUID()
  const id = await dump.start(c.req.raw, traceId, "incoming")
  await requestContext.run({ dump, traceId }, async () => {
    try {
      await next()
      dump.finish(id, c.res, c.error)
    } catch (error) {
      dump.finish(id, undefined, error)
      throw error
    }
  })
}

export async function fetchWithRequestDump(
  input: string | URL,
  init?: RequestInit,
): Promise<Response> {
  const context = requestContext.getStore()
  if (context === undefined) return fetch(input, init)
  const { dump, traceId } = context
  let id: string | undefined
  try {
    id = await dump.start(new Request(String(input), init), traceId, "upstream")
  } catch (error) {
    consola.warn("Could not capture upstream request", errorMessage(error))
  }
  try {
    const response = await fetch(input, init)
    if (id !== undefined) dump.finish(id, response)
    return response
  } catch (error) {
    if (id !== undefined) dump.finish(id, undefined, error)
    throw error
  }
}
