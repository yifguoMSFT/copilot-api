import { describe, expect, test } from "bun:test"

import {
  convertInteractionsResponseToResponses as response,
  convertResponsesRequestToInteractions as request,
  type JsonObject,
} from "../src/services/interactions/convert"
import {
  completed,
  converter,
  created,
  delta,
  encoder,
  events,
  failedOutput,
  frame,
  replay,
  run,
  start,
  stop,
} from "./support/interactions-stream"

const thought = (signature: string, text: string) => ({
  type: "thought",
  signature,
  summary: [{ type: "text", text }],
})

/** The reasoning item Codex would echo back, carrying the replay envelope. */
function reasoning(item: Record<string, unknown>): JsonObject {
  const [converted] = response({
    id: "v1_thought",
    model: "gemini",
    status: "completed",
    steps: [item],
  }).output as Array<JsonObject>
  return converted
}

const message = (text: string) => ({
  type: "message",
  role: "assistant",
  content: [{ type: "output_text", text }],
})

describe("Interactions thought replay", () => {
  test("keeps every field of a complete thought through both directions", () => {
    const source = {
      type: "thought",
      signature: "sig-Ω-🙂",
      summary: [{ type: "text", text: "checking", extra_part: 1 }],
      client_metadata: { trace: "t1" },
      provider_metadata: { level: "low", nested: [1, 2] },
    }
    const item = reasoning(source)
    expect(item.type).toBe("reasoning")
    const replayed = request({ model: "g", input: [item] }).body
      .input as Array<JsonObject>
    expect(replayed).toEqual([source])
    expect(replayed[0]?.signature).toBe(source.signature)
  })

  test("leads a turn with its thoughts without disturbing either order", () => {
    const first = reasoning(thought("s1", "one"))
    const second = reasoning(thought("s2", "two"))
    const converted = request({
      model: "g",
      input: [
        { type: "function_call", call_id: "c0", name: "a", arguments: "{}" },
        first,
        { type: "function_call", call_id: "c1", name: "b", arguments: "{}" },
        second,
      ],
    })
    const steps = converted.body.input as Array<JsonObject>
    expect(steps.map((step) => step.type)).toEqual([
      "thought",
      "thought",
      "function_call",
      "function_call",
    ])
    expect(steps.slice(0, 2)).toEqual([
      thought("s1", "one"),
      thought("s2", "two"),
    ])
    expect(steps.slice(2).map((step) => step.name)).toEqual(["a", "b"])
  })

  test("ends a turn on tool results and user input", () => {
    const converted = request({
      model: "g",
      input: [
        message("working"),
        { type: "function_call", call_id: "c1", name: "a", arguments: "{}" },
        reasoning(thought("s1", "one")),
        { type: "function_call_output", call_id: "c1", output: "sunny" },
        reasoning(thought("s2", "two")),
        message("done"),
      ],
    })
    const steps = converted.body.input as Array<JsonObject>
    expect(steps.map((step) => step.type)).toEqual([
      "thought",
      "model_output",
      "function_call",
      "function_result",
      "thought",
      "model_output",
    ])
    expect(steps[0]).toEqual(thought("s1", "one"))
    expect(steps[3]).toMatchObject({ call_id: "c1" })
    expect(steps[4]).toEqual(thought("s2", "two"))
    expect(steps[5]).toEqual({
      type: "model_output",
      content: [{ type: "text", text: "done" }],
    })
  })

  test("leaves a turn that already starts with a thought untouched", () => {
    const converted = request({
      model: "g",
      input: [reasoning(thought("s1", "one")), message("answer")],
    })
    expect(converted.body.input).toEqual([
      thought("s1", "one"),
      { type: "model_output", content: [{ type: "text", text: "answer" }] },
    ])
  })

  test("keeps extra thought fields in the streamed replay envelope", () => {
    const source = {
      ...thought("sig-Ω", "streamed"),
      provider_metadata: { level: "low" },
    }
    const stream = converter()
    const output = events(
      stream.push(
        encoder.encode(
          frame(created) + frame(start(0, source)) + frame(completed),
        ),
      ) + stream.flush(),
    )
    const item = output.find(
      (event) => event.type === "response.output_item.done",
    )?.item as JsonObject
    const decoded: unknown = JSON.parse(
      Buffer.from(
        String(item.encrypted_content).slice(8),
        "base64url",
      ).toString(),
    )
    expect(decoded).toEqual(source)
    expect((decoded as JsonObject).signature).toBe(source.signature)
  })
})

const itemOf = (result: Array<Record<string, unknown>>) =>
  result.find((event) => event.type === "response.output_item.done")
    ?.item as JsonObject

describe("Interactions streamed thought fidelity", () => {
  test("keeps the fields of every summary part the stream declared", () => {
    const source = {
      type: "thought",
      signature: "sig",
      summary: [{ type: "text", text: "hello", extra_part: 1 }],
    }
    expect(replay(itemOf(run([created, start(0, source), completed])))).toEqual(
      source,
    )
  })

  test("keeps the fields of a summary part that arrives as a delta", () => {
    const result = run([
      created,
      start(0, { type: "thought", signature: "sig" }),
      delta(0, {
        type: "thought_summary",
        content: { type: "text", text: "hello", extra_part: 2 },
      }),
      completed,
    ])
    expect(replay(itemOf(result))).toEqual({
      type: "thought",
      signature: "sig",
      summary: [{ type: "text", text: "hello", extra_part: 2 }],
    })
  })

  test("never invents a summary for a signature-only thought", () => {
    const source = { type: "thought", signature: "sig" }
    const decoded = replay(itemOf(run([created, start(0, source), completed])))
    expect(decoded).toEqual(source)
    expect(decoded).not.toHaveProperty("summary")
  })

  test("adopts terminal-only fields into the replay envelope", () => {
    const result = run([
      created,
      start(0, { type: "thought", signature: "sig" }),
      stop(0),
      {
        ...completed,
        interaction: {
          ...completed.interaction,
          steps: [
            {
              type: "thought",
              signature: "sig",
              provider_metadata: { level: "low" },
            },
          ],
        },
      },
    ])
    expect(replay(itemOf(result))).toEqual({
      type: "thought",
      signature: "sig",
      provider_metadata: { level: "low" },
    })
  })

  test("adopts a summary that only the terminal snapshot carries", () => {
    const result = run([
      created,
      start(0, { type: "thought" }),
      stop(0),
      {
        ...completed,
        interaction: {
          ...completed.interaction,
          steps: [
            {
              type: "thought",
              signature: "sig",
              summary: [{ type: "text", text: "late", extra_part: 3 }],
            },
          ],
        },
      },
    ])
    expect(replay(itemOf(result))).toEqual({
      type: "thought",
      signature: "sig",
      summary: [{ type: "text", text: "late", extra_part: 3 }],
    })
  })

  test("keeps summary part fields when the stream ends early", () => {
    const stream = converter()
    const result = events(
      stream.push(
        encoder.encode(
          [
            created,
            start(0, { type: "thought" }),
            delta(0, {
              type: "thought_summary",
              content: { type: "text", text: "thinking", extra_part: 4 },
            }),
            delta(0, { type: "thought_signature", signature: "signed" }),
          ]
            .map((value) => frame(value))
            .join(""),
        ),
      ) + stream.flush(),
    )
    expect(result.at(-1)?.type).toBe("response.failed")
    expect(replay(failedOutput(result)[0])).toEqual({
      type: "thought",
      signature: "signed",
      summary: [{ type: "text", text: "thinking", extra_part: 4 }],
    })
  })

  test("fails when the terminal snapshot contradicts streamed thought text", () => {
    const result = run([
      created,
      start(0, { type: "thought", summary: [{ type: "text", text: "a" }] }),
      stop(0),
      {
        ...completed,
        interaction: {
          ...completed.interaction,
          steps: [{ type: "thought", summary: [{ type: "text", text: "b" }] }],
        },
      },
    ])
    expect(result.at(-1)?.type).toBe("response.failed")
  })

  test("reports the same thought through the JSON and stream paths", () => {
    const source = {
      type: "thought",
      signature: "sig",
      summary: [{ type: "text", text: "hello", extra_part: 1 }],
      provider_metadata: { level: "low" },
    }
    const [jsonItem] = response({
      id: "v1_thought",
      model: "gemini",
      status: "completed",
      steps: [source],
    }).output as Array<JsonObject>
    expect(replay(itemOf(run([created, start(0, source), completed])))).toEqual(
      replay(jsonItem),
    )
  })
})
