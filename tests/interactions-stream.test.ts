import { describe, expect, test } from "bun:test"

import { MAX_DATA_BYTES } from "../src/services/interactions/convert"
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

describe("Interactions SSE", () => {
  test("emits text event order, increasing sequence and accumulated terminal output", () => {
    const result = run([
      created,
      start(0),
      delta(0, { type: "text", text: "Hel" }),
      delta(0, { type: "text", text: "lo" }),
      stop(0),
      completed,
    ])
    expect(result.map((event) => event.type)).toEqual([
      "response.created",
      "response.in_progress",
      "response.output_item.added",
      "response.content_part.added",
      "response.output_text.delta",
      "response.output_text.delta",
      "response.output_text.done",
      "response.content_part.done",
      "response.output_item.done",
      "response.completed",
    ])
    expect(result.map((event) => event.sequence_number)).toEqual(
      result.map((_, index) => index),
    )
    expect((result.at(-1)?.response as Record<string, unknown>).output).toEqual(
      [
        {
          type: "message",
          id: "msg_v1_id_0",
          role: "assistant",
          status: "completed",
          content: [{ type: "output_text", text: "Hello", annotations: [] }],
        },
      ],
    )
  })

  test("supports every byte boundary, UTF-8, CRLF and multiline data", () => {
    const wire = [
      created,
      start(0),
      delta(0, { type: "text", text: "世界🙂" }),
      stop(0),
      completed,
    ]
      .map(
        (item) =>
          `event: ignored\r\ndata: ${JSON.stringify(item, null, 2).replaceAll("\n", "\r\ndata: ")}\r\n\r\n`,
      )
      .join(": heartbeat\r\n\r\n")
    const bytes = encoder.encode(wire)
    const stream = converter()
    let output = ""
    for (const byte of bytes) output += stream.push(new Uint8Array([byte]))
    output += stream.flush()
    expect(events(output).at(-1)?.type).toBe("response.completed")
    expect(
      events(output).find(
        (event) => event.type === "response.output_text.delta",
      )?.delta,
    ).toBe("世界🙂")
  })

  test("includes initial content once and verifies terminal snapshot without duplication", () => {
    const step = {
      type: "model_output",
      content: [{ type: "text", text: "initial" }],
    }
    const result = run([
      created,
      start(0, step),
      stop(0),
      {
        ...completed,
        interaction: { ...completed.interaction, steps: [step] },
      },
    ])
    expect(
      result
        .filter((event) => event.type === "response.output_text.delta")
        .map((event) => event.delta),
    ).toEqual(["initial"])
    expect(result.at(-1)?.type).toBe("response.completed")
  })

  test("keeps late thought signature in final replay envelope", () => {
    const stream = converter()
    const partial = events(
      stream.push(
        encoder.encode(
          [
            created,
            start(0, { type: "thought" }),
            delta(0, {
              type: "thought_summary",
              content: { type: "text", text: "thinking" },
            }),
            stop(0),
          ]
            .map((value) => frame(value))
            .join(""),
        ),
      ),
    )
    expect(
      partial.some((event) => event.type === "response.output_item.done"),
    ).toBe(false)
    expect(
      partial.some(
        (event) => event.type === "response.reasoning_summary_part.added",
      ),
    ).toBe(true)
    const final = events(
      stream.push(
        encoder.encode(
          [
            delta(0, { type: "thought_signature", signature: "late" }),
            completed,
          ]
            .map((value) => frame(value))
            .join(""),
        ),
      ),
    )
    const item = final.find(
      (event) => event.type === "response.output_item.done",
    )?.item as Record<string, unknown>
    const decoded: unknown = JSON.parse(
      Buffer.from(
        String(item.encrypted_content).slice(8),
        "base64url",
      ).toString(),
    )
    expect(decoded).toEqual({
      type: "thought",
      signature: "late",
      summary: [{ type: "text", text: "thinking" }],
    })
  })
})

describe("Interactions SSE item identity", () => {
  test("uses one item id for events and the terminal output", () => {
    const result = run([
      created,
      start(0),
      delta(0, { type: "text", text: "Hi" }),
      stop(0),
      completed,
    ])
    const referenced = new Set(
      result
        .filter((event) => event.item_id !== undefined)
        .map((event) => event.item_id),
    )
    expect([...referenced]).toEqual(["msg_v1_id_0"])
    const output = (result.at(-1)?.response as Record<string, unknown>)
      .output as Array<Record<string, unknown>>
    expect(output.map((item) => item.id)).toEqual(["msg_v1_id_0"])
  })
})

const terminalUsage = (result: Array<Record<string, unknown>>) =>
  (result.at(-1)?.response as Record<string, unknown>).usage

describe("Interactions SSE cumulative usage", () => {
  test("keeps delta metadata total_usage when the terminal snapshot omits it", () => {
    const result = run([
      created,
      start(0),
      delta(0, {
        type: "text",
        text: "Hi",
        metadata: { total_usage: { ignored: "delta field, not event field" } },
      }),
      {
        event_type: "step.delta",
        index: 0,
        delta: { type: "text", text: "!" },
        metadata: {
          total_usage: {
            total_cached_tokens: 4,
            total_input_tokens: 7,
            total_output_tokens: 2,
            total_thought_tokens: 0,
            total_tokens: 9,
          },
        },
      },
      stop(0),
      completed,
    ])
    expect(terminalUsage(result)).toEqual({
      input_tokens: 7,
      output_tokens: 2,
      total_tokens: 9,
      input_tokens_details: { cached_tokens: 4 },
      output_tokens_details: { reasoning_tokens: 0 },
    })
  })

  test("keeps the latest cumulative snapshot from step.stop and ignores step_usage", () => {
    const result = run([
      created,
      start(0),
      delta(0, { type: "text", text: "Hi" }),
      {
        ...stop(0),
        step_usage: { total_input_tokens: 999, total_tokens: 999 },
        usage: {
          total_input_tokens: 20,
          total_output_tokens: 5,
          total_thought_tokens: 1,
          total_tokens: 26,
        },
      },
      completed,
    ])
    expect(terminalUsage(result)).toEqual({
      input_tokens: 20,
      output_tokens: 6,
      total_tokens: 26,
      output_tokens_details: { reasoning_tokens: 1 },
    })
  })

  test("lets explicit terminal usage override retained snapshots without summing", () => {
    const result = run([
      created,
      start(0),
      {
        event_type: "step.delta",
        index: 0,
        delta: { type: "text", text: "Hi" },
        metadata: {
          total_usage: { total_input_tokens: 1, total_output_tokens: 1 },
        },
      },
      stop(0),
      {
        ...completed,
        interaction: {
          ...completed.interaction,
          usage: {
            total_input_tokens: 50,
            total_output_tokens: 10,
            total_thought_tokens: 0,
            total_tokens: 60,
          },
        },
      },
    ])
    expect(terminalUsage(result)).toEqual({
      input_tokens: 50,
      output_tokens: 10,
      total_tokens: 60,
      output_tokens_details: { reasoning_tokens: 0 },
    })
  })

  test("preserves known zero counters and reports absent usage as null", () => {
    const zero = run([
      created,
      start(0),
      {
        event_type: "step.delta",
        index: 0,
        delta: { type: "text", text: "Hi" },
        metadata: { total_usage: { total_cached_tokens: 0 } },
      },
      stop(0),
      completed,
    ])
    expect(terminalUsage(zero)).toEqual({
      input_tokens_details: { cached_tokens: 0 },
    })
    expect(
      terminalUsage(run([created, start(0), stop(0), completed])),
    ).toBeNull()
  })

  test("never invents a zero thought count to complete output_tokens", () => {
    const result = run([
      created,
      start(0),
      {
        event_type: "step.delta",
        index: 0,
        delta: { type: "text", text: "Hi" },
        metadata: { total_usage: { total_output_tokens: 3 } },
      },
      stop(0),
      completed,
    ])
    expect(terminalUsage(result)).toEqual({})
  })
})

describe("Interactions SSE failure boundaries", () => {
  test.each([
    "data: {bad}\n\n",
    "data: [DONE]\n\n",
    frame(delta(0, { type: "text", text: "x" })),
  ])("fails malformed input without later success", (bad) => {
    const stream = converter()
    const output =
      stream.push(encoder.encode(frame(created) + bad + frame(completed)))
      + stream.flush()
    const result = events(output)
    expect(result.at(-1)?.type).toBe("response.failed")
    expect(
      result.filter((event) => event.type === "response.failed"),
    ).toHaveLength(1)
    expect(result.some((event) => event.type === "response.completed")).toBe(
      false,
    )
  })

  test("EOF and invalid UTF-8 fail, cancellation releases state silently", () => {
    const stream = converter()
    stream.push(encoder.encode(frame(created)))
    expect(events(stream.flush()).at(-1)?.type).toBe("response.failed")
    const utf = converter()
    expect(events(utf.push(new Uint8Array([255]))).at(-1)?.type).toBe(
      "response.failed",
    )
    const cancelled = converter()
    cancelled.push(encoder.encode(frame(created) + frame(start(0))))
    cancelled.cancel()
    expect(
      cancelled.push(encoder.encode(frame(completed))) + cancelled.flush(),
    ).toBe("")
  })

  test("caps incomplete frames and cumulative argument buffers", () => {
    const stream = converter()
    expect(
      events(
        stream.push(encoder.encode("data: " + "x".repeat(MAX_DATA_BYTES))),
      ).at(-1)?.type,
    ).toBe("response.failed")
    const tool = converter()
    tool.push(
      encoder.encode(
        frame(created)
          + frame(start(0, { type: "function_call", id: "c", name: "f" })),
      ),
    )
    const chunk = frame(
      delta(0, { type: "arguments_delta", arguments: "x".repeat(600_000) }),
    )
    tool.push(encoder.encode(chunk))
    expect(events(tool.push(encoder.encode(chunk))).at(-1)?.type).toBe(
      "response.failed",
    )
  })

  test("forwards DONE only once after one terminal", () => {
    const stream = converter()
    const output =
      stream.push(
        encoder.encode(
          frame(created)
            + frame(completed)
            + frame(completed)
            + "data: [DONE]\n\ndata: [DONE]\n\n",
        ),
      ) + stream.flush()
    expect(output.match(/data: \[DONE\]/g)).toHaveLength(1)
    expect(
      events(output).filter((event) => event.type === "response.completed"),
    ).toHaveLength(1)
  })

  test("preserves upstream errors and rejects inconsistent terminal snapshots", () => {
    const error = run([
      created,
      { event_type: "error", error: { code: "quota", message: "exceeded" } },
    ])
    expect((error.at(-1)?.response as Record<string, unknown>).error).toEqual({
      code: "quota",
      message: "exceeded",
    })
    const v1 = run([
      created,
      start(0),
      {
        ...completed,
        interaction: {
          ...completed.interaction,
          status: "failed",
          errors: [{ code: "quota", message: "exhausted" }],
        },
      },
    ])
    expect(v1.at(-1)?.type).toBe("response.failed")
    expect((v1.at(-1)?.response as Record<string, unknown>).error).toEqual({
      code: "quota",
      message: "exhausted",
    })
    const mismatch = run([
      created,
      start(0),
      delta(0, { type: "text", text: "a" }),
      {
        ...completed,
        interaction: {
          ...completed.interaction,
          steps: [
            { type: "model_output", content: [{ type: "text", text: "b" }] },
          ],
        },
      },
    ])
    expect(mismatch.at(-1)?.type).toBe("response.failed")
    const badSignature = run([
      created,
      start(0, { type: "thought" }),
      {
        ...completed,
        interaction: {
          ...completed.interaction,
          steps: [{ type: "thought", signature: 42 }],
        },
      },
    ])
    expect(badSignature.at(-1)?.type).toBe("response.failed")
  })
})

describe("Interactions SSE failed replay state", () => {
  const summary = delta(0, {
    type: "thought_summary",
    content: { type: "text", text: "thinking" },
  })
  const signature = delta(0, { type: "thought_signature", signature: "signed" })
  const thought = { type: "thought" }

  test("keeps a received thought signature when the stream ends early", () => {
    const stream = converter()
    const result = events(
      stream.push(
        encoder.encode(
          [created, start(0, thought), summary, signature]
            .map((value) => frame(value))
            .join(""),
        ),
      ) + stream.flush(),
    )
    expect(result.at(-1)?.type).toBe("response.failed")
    expect(result.some((event) => event.type === "response.completed")).toBe(
      false,
    )
    const item = result.find(
      (event) => event.type === "response.output_item.done",
    )?.item as Record<string, unknown>
    expect(replay(item)).toEqual({
      type: "thought",
      signature: "signed",
      summary: [{ type: "text", text: "thinking" }],
    })
    expect(failedOutput(result)).toEqual([item])
  })

  test("keeps a received thought signature when the upstream reports an error", () => {
    const result = run([
      created,
      start(0, thought),
      summary,
      signature,
      { event_type: "error", error: { code: "quota", message: "exceeded" } },
    ])
    const failed = result.at(-1)?.response as Record<string, unknown>
    expect(result.at(-1)?.type).toBe("response.failed")
    expect(failed.error).toEqual({ code: "quota", message: "exceeded" })
    expect(replay(failedOutput(result)[0])).toEqual({
      type: "thought",
      signature: "signed",
      summary: [{ type: "text", text: "thinking" }],
    })
  })

  test("never fabricates a replay envelope for an unsigned thought fragment", () => {
    const stream = converter()
    const result = events(
      stream.push(
        encoder.encode(
          [created, start(0, thought), summary]
            .map((value) => frame(value))
            .join(""),
        ),
      ) + stream.flush(),
    )
    expect(result.at(-1)?.type).toBe("response.failed")
    expect(failedOutput(result)).toEqual([
      {
        type: "reasoning",
        id: "rs_v1_id_0",
        summary: [{ type: "summary_text", text: "thinking" }],
      },
    ])
  })

  test("accepts a signature that only the terminal snapshot carries", () => {
    const result = run([
      created,
      start(0, thought),
      summary,
      stop(0),
      {
        ...completed,
        interaction: {
          ...completed.interaction,
          steps: [
            {
              type: "thought",
              signature: "late",
              summary: [{ type: "text", text: "thinking" }],
            },
          ],
        },
      },
    ])
    expect(result.at(-1)?.type).toBe("response.completed")
    expect(
      replay(
        result.find((event) => event.type === "response.output_item.done")
          ?.item as Record<string, unknown>,
      ),
    ).toEqual({
      type: "thought",
      signature: "late",
      summary: [{ type: "text", text: "thinking" }],
    })
  })

  test("accepts a terminal snapshot that omits optional fields", () => {
    const result = run([
      created,
      start(0, thought),
      summary,
      signature,
      stop(0),
      {
        ...completed,
        interaction: { ...completed.interaction, steps: [thought] },
      },
    ])
    expect(result.at(-1)?.type).toBe("response.completed")
    expect(
      replay(
        result.find((event) => event.type === "response.output_item.done")
          ?.item as Record<string, unknown>,
      ),
    ).toEqual({
      type: "thought",
      signature: "signed",
      summary: [{ type: "text", text: "thinking" }],
    })
  })

  test("keeps usage captured before a failure", () => {
    const stream = converter()
    const result = events(
      stream.push(
        encoder.encode(
          [
            created,
            start(0),
            {
              ...delta(0, { type: "text", text: "partial" }),
              metadata: {
                total_usage: {
                  total_input_tokens: 7,
                  total_output_tokens: 2,
                  total_thought_tokens: 0,
                  total_cached_tokens: 0,
                  total_tokens: 9,
                },
              },
            },
          ]
            .map((value) => frame(value))
            .join(""),
        ),
      ) + stream.flush(),
    )
    const failed = result.at(-1)?.response as Record<string, unknown>
    expect(result.at(-1)?.type).toBe("response.failed")
    expect(failed.usage).toEqual({
      input_tokens: 7,
      output_tokens: 2,
      total_tokens: 9,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens_details: { reasoning_tokens: 0 },
    })
    expect(failedOutput(result)).toEqual([
      {
        type: "message",
        id: "msg_v1_id_0",
        role: "assistant",
        status: "incomplete",
        content: [{ type: "output_text", text: "partial", annotations: [] }],
      },
    ])
  })
})

test("EOF ends partial text items before failure without losing emitted text", () => {
  const stream = converter()
  stream.push(
    encoder.encode(
      [created, start(0), delta(0, { type: "text", text: "partial" })]
        .map((value) => frame(value))
        .join(""),
    ),
  )
  const result = events(stream.flush())
  expect(result.map((event) => event.type)).toEqual([
    "response.output_text.done",
    "response.content_part.done",
    "response.output_item.done",
    "response.failed",
  ])
  expect(result[2].item).toMatchObject({ status: "incomplete" })
  expect((result[3].response as Record<string, unknown>).output).toEqual([
    result[2].item,
  ])
})

test("invalid initial thought fails without escaping push", () => {
  const result = run([
    created,
    start(0, { type: "thought", summary: [{ type: "image" }] }),
    completed,
  ])
  expect(result.at(-1)?.type).toBe("response.failed")
})
