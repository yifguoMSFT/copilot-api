const itemEvents = new Set([
  "response.content_part.added",
  "response.content_part.done",
  "response.output_item.added",
  "response.output_item.done",
  "response.output_text.delta",
  "response.output_text.done",
])

const encoder = new TextEncoder()

export function normalizeResponsesItemIds(
  source: ReadableStream<Uint8Array>,
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder()
  const ids = new Map<number, string>()
  let buffer = ""

  return source.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        buffer += decoder.decode(chunk, { stream: true })
        let boundary = /\r?\n\r?\n/.exec(buffer)
        while (boundary?.index !== undefined) {
          const frame = buffer.slice(0, boundary.index)
          controller.enqueue(
            encoder.encode(normalizeFrame(frame, ids) + boundary[0]),
          )
          buffer = buffer.slice(boundary.index + boundary[0].length)
          boundary = /\r?\n\r?\n/.exec(buffer)
        }
      },
      flush(controller) {
        buffer += decoder.decode()
        if (buffer !== "") controller.enqueue(encoder.encode(buffer))
      },
    }),
  )
}

const normalizeFrame = (frame: string, ids: Map<number, string>): string => {
  const newline = frame.includes("\r\n") ? "\r\n" : "\n"
  const lines = frame.split(/\r?\n/)
  const dataLines = lines.filter((line) => line.startsWith("data:"))
  if (dataLines.length !== 1) return frame

  const dataLine = dataLines[0]

  let payload: Record<string, unknown>
  try {
    const parsed = JSON.parse(dataLine.slice(5).trimStart()) as unknown
    if (!isRecord(parsed)) return frame
    payload = parsed
  } catch {
    return frame
  }

  let changed = false
  if (payload.type === "response.completed") {
    changed = normalizeCompleted(payload, ids)
  } else if (typeof payload.type === "string" && itemEvents.has(payload.type)) {
    changed = normalizeItem(payload, ids)
  }
  if (!changed) return frame

  lines[lines.indexOf(dataLine)] = `data: ${JSON.stringify(payload)}`
  return lines.join(newline)
}

const normalizeItem = (
  payload: Record<string, unknown>,
  ids: Map<number, string>,
): boolean => {
  const outputIndex = payload.output_index
  const item = isRecord(payload.item) ? payload.item : undefined
  let currentId: string | undefined
  if (typeof payload.item_id === "string") currentId = payload.item_id
  else if (typeof item?.id === "string") currentId = item.id
  if (typeof outputIndex !== "number" || currentId === undefined) return false

  const id = ids.get(outputIndex) ?? currentId
  ids.set(outputIndex, id)
  if (typeof payload.item_id === "string") payload.item_id = id
  if (typeof item?.id === "string") item.id = id
  return true
}

const normalizeCompleted = (
  payload: Record<string, unknown>,
  ids: Map<number, string>,
): boolean => {
  const response = isRecord(payload.response) ? payload.response : undefined
  if (!Array.isArray(response?.output)) return false

  let changed = false
  for (const [index, value] of response.output.entries()) {
    const item = isRecord(value) ? value : undefined
    const id = ids.get(index)
    if (typeof item?.id !== "string" || id === undefined) continue
    item.id = id
    changed = true
  }
  return changed
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
