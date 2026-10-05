import consola from "consola"
import { createHash } from "node:crypto"
import { appendFile, mkdir } from "node:fs/promises"
import path from "node:path"

export const responsesDiagnosticLogPath = path.resolve(
  "logs/responses-diagnostics.jsonl",
)

export const createResponsesDiagnosticLogger = (filePath: string) => {
  let pending = Promise.resolve()
  return (record: Record<string, unknown>): Promise<void> => {
    const line = JSON.stringify({
      timestamp: new Date().toISOString(),
      ...record,
    })
    consola.info("Responses diagnostic", line)
    pending = pending
      .then(async () => {
        await mkdir(path.dirname(filePath), { recursive: true })
        await appendFile(filePath, `${line}\n`, "utf8")
      })
      .catch((error: unknown) => {
        consola.warn("Could not write Responses diagnostic log", {
          filePath,
          error,
        })
      })
    return pending
  }
}

export const logResponsesDiagnostic = createResponsesDiagnosticLogger(
  responsesDiagnosticLogPath,
)

const fingerprint = (value: string | Uint8Array) => ({
  bytes: Buffer.byteLength(value),
  sha256: createHash("sha256").update(value).digest("hex"),
})

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value) ?
    (value as Record<string, unknown>)
  : undefined

// Only protocol containers are traversed; prompts, arguments and metadata stay opaque.
const encryptedFields = (payload: unknown) => {
  const pending = [{ value: payload, path: "$" }]
  const fields: Array<{ path: string; bytes: number; sha256: string }> = []
  let visited = 0
  while (pending.length > 0 && visited < 10_000 && fields.length < 32) {
    const entry = pending.pop()
    if (entry === undefined) break
    visited += 1
    if (Array.isArray(entry.value)) {
      for (const [index, value] of entry.value.slice(0, 10_000).entries()) {
        pending.push({ value, path: `${entry.path}[${index}]` })
      }
      continue
    }
    const record = asRecord(entry.value)
    if (record === undefined) continue
    if (typeof record.encrypted_content === "string") {
      fields.push({
        path: `${entry.path}.encrypted_content`,
        ...fingerprint(record.encrypted_content),
      })
    }
    for (const key of ["input", "output", "content"]) {
      if (record[key] !== undefined) {
        pending.push({ value: record[key], path: `${entry.path}.${key}` })
      }
    }
  }
  return { fields, truncated: pending.length > 0 }
}

export const summarizeResponsesBody = (body: RequestInit["body"]): unknown => {
  let bytes: Uint8Array
  if (typeof body === "string") bytes = Buffer.from(body)
  else if (body instanceof ArrayBuffer) bytes = new Uint8Array(body)
  else if (ArrayBuffer.isView(body)) {
    bytes = new Uint8Array(body.buffer, body.byteOffset, body.byteLength)
  } else return { inspected: false }

  const digest = fingerprint(bytes)
  try {
    const payload = asRecord(JSON.parse(new TextDecoder().decode(bytes)))
    const stateFields = Object.fromEntries(
      ["previous_response_id", "conversation", "prompt_cache_key"].flatMap(
        (key) =>
          payload?.[key] === undefined ?
            []
          : [[key, fingerprint(JSON.stringify(payload[key]))]],
      ),
    )
    return {
      ...digest,
      validJson: true,
      model: payload?.model,
      inputItems:
        Array.isArray(payload?.input) ? payload.input.length : undefined,
      state: stateFields,
      encrypted: encryptedFields(payload),
    }
  } catch {
    return { ...digest, validJson: false }
  }
}

export const summarizeResponsesHeaders = (headers: Headers): unknown =>
  Object.fromEntries(
    [
      "session_id",
      "conversation_id",
      "x-session-id",
      "x-codex-session-id",
      "x-codex-turn-state",
      "x-codex-turn-metadata",
      "x-client-request-id",
      "x-request-id",
      "copilot-edits-session",
      "copilot-integration-id",
      "openai-beta",
      "content-type",
      "content-encoding",
    ].flatMap((name) => {
      const value = headers.get(name)
      return value === null ? [] : [[name, fingerprint(value)]]
    }),
  )

// Read only a bounded error-body clone. Never delay or consume the client's stream.
export async function logResponsesError(
  response: Response,
  requestId: string | null,
): Promise<void> {
  const stream: ReadableStream<Uint8Array> | null = response.clone().body
  const reader = stream?.getReader()
  if (reader === undefined) return
  const deadline = new AbortController()
  const timer = setTimeout(() => {
    deadline.abort()
    void reader.cancel().catch(() => undefined)
  }, 1000)
  const chunks: Array<Uint8Array> = []
  let bytes = 0
  try {
    while (bytes <= 8192) {
      const result = await reader.read()
      if (result.done) break
      bytes += result.value.byteLength
      if (bytes <= 8192) chunks.push(result.value)
    }
    let error: Record<string, unknown> | undefined
    if (!deadline.signal.aborted && bytes <= 8192) {
      try {
        const payload = asRecord(JSON.parse(Buffer.concat(chunks).toString()))
        error = asRecord(payload?.error)
      } catch {
        // Non-JSON errors are identified by status; never log their raw body.
      }
    }
    await logResponsesDiagnostic({
      stage: "upstream-error",
      requestId,
      upstreamRequestId: response.headers.get("x-request-id"),
      status: response.status,
      truncated: deadline.signal.aborted || bytes > 8192,
      invalidRequestBody: error?.code === "invalid_request_body",
      encryptedFunctionOutputRejected:
        error?.message
        === "Encrypted function output content could not be decrypted or decoded.",
    })
  } finally {
    clearTimeout(timer)
    void reader.cancel().catch(() => undefined)
  }
}
