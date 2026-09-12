import { type ConversionOptions } from "../../src/services/interactions/convert"
import { createInteractionsEventStream } from "../../src/services/interactions/stream"

export const encoder = new TextEncoder()

export const frame = (value: unknown) => `data: ${JSON.stringify(value)}\n\n`

export const created = {
  event_type: "interaction.created",
  interaction: { id: "v1_id", model: "gemini", status: "in_progress" },
}

export const start = (
  index: number,
  step: unknown = { type: "model_output" },
) => ({
  event_type: "step.start",
  index,
  step,
})

export const delta = (index: number, value: unknown) => ({
  event_type: "step.delta",
  index,
  delta: value,
})

export const stop = (index: number) => ({ event_type: "step.stop", index })

export const completed = {
  event_type: "interaction.completed",
  interaction: { id: "v1_id", status: "completed" },
}

export const converter = (options: ConversionOptions = {}) =>
  createInteractionsEventStream({
    requestedModel: "client",
    createdAt: 1,
    ...options,
  })

export const events = (output: string): Array<Record<string, unknown>> =>
  output
    .split("\n\n")
    .filter((part) => part.startsWith("event:"))
    .map(
      (part) =>
        JSON.parse(part.split("\ndata: ")[1]) as Record<string, unknown>,
    )

export const run = (
  values: Array<unknown>,
  options: ConversionOptions = {},
) => {
  const stream = converter(options)
  return events(
    stream.push(encoder.encode(values.map((value) => frame(value)).join("")))
      + stream.flush(),
  )
}

export const plainTools = (...names: Array<string>) =>
  new Map(names.map((name) => [name, { name, custom: false }] as const))

export const replay = (item: Record<string, unknown>): unknown =>
  JSON.parse(
    Buffer.from(
      String(item.encrypted_content).slice(8),
      "base64url",
    ).toString(),
  ) as unknown

export const failedOutput = (result: Array<Record<string, unknown>>) =>
  (result.at(-1)?.response as Record<string, unknown>).output as Array<
    Record<string, unknown>
  >
