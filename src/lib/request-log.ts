import consola from "consola"
import fs from "node:fs/promises"
import path from "node:path"

/** Body characters kept in the readable one-line summary. */
export const REQUEST_LOG_BODY_HEAD_LENGTH = 600

export interface IncomingRequestRecord {
  bodyText?: string
  method: string
  path: string
}

let pending: Promise<void> = Promise.resolve()
let logFile: string | undefined

/**
 * Points the log at a file. Until a server start does this, records are
 * dropped, so test runs never write into the log an operator is reading.
 */
export function setRequestLogFile(file: string | undefined): void {
  logFile = file
}

/**
 * One request per line, in arrival order, so the sequence a client actually
 * sent can be read top to bottom without opening a database.
 */
export function formatRequestLogLine(
  record: IncomingRequestRecord,
  at: Date,
): string {
  const body = record.bodyText ?? ""
  const model = readRequestBodyModel(body) ?? "-"
  const fields = [
    at.toISOString(),
    `${record.method} ${record.path}`,
    `model=${model}`,
    `${Buffer.byteLength(body)}B`,
  ]
  const summary = summarizeRequestBody(body)
  return summary.length === 0 ?
      fields.join(" | ")
    : `${fields.join(" | ")} | ${summary}`
}

export function summarizeRequestBody(bodyText: string): string {
  const singleLine = bodyText.replaceAll(/\s+/g, " ").trim()
  if (singleLine.length <= REQUEST_LOG_BODY_HEAD_LENGTH) return singleLine
  return `${singleLine.slice(0, REQUEST_LOG_BODY_HEAD_LENGTH)}…`
}

/**
 * Appends the record without ever failing a request: the log is an aid, not a
 * dependency, and writes are queued so lines stay in arrival order.
 */
export function recordIncomingRequest(
  record: IncomingRequestRecord,
  file: string | undefined = logFile,
): void {
  if (file === undefined) return
  const line = formatRequestLogLine(record, new Date())
  pending = pending
    .then(() => appendLine(file, line))
    .catch((error: unknown) => {
      consola.warn("Could not write the incoming request log:", error)
    })
}

/** Awaits the queued writes; used by tests and shutdown paths. */
export async function flushRequestLog(): Promise<void> {
  await pending
}

const appendLine = async (file: string, line: string): Promise<void> => {
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.appendFile(file, `${line}\n`)
}

const readRequestBodyModel = (bodyText: string): string | undefined => {
  if (bodyText.length === 0) return undefined
  try {
    const parsed: unknown = JSON.parse(bodyText)
    if (parsed === null || typeof parsed !== "object") return undefined
    const model = (parsed as Record<string, unknown>).model
    return typeof model === "string" && model.length > 0 ? model : undefined
  } catch {
    return undefined
  }
}
