import { describe, expect, test } from "bun:test"

import { createInteractionsEventStream } from "../src/services/interactions/stream"
import {
  completed,
  created,
  delta,
  encoder,
  events,
  frame,
  plainTools,
  run,
  start,
  stop,
} from "./support/interactions-stream"

describe("Interactions SSE tool identity", () => {
  test("isolates interleaved tools and delays argument events until validation", () => {
    const result = run(
      [
        created,
        start(0, { type: "function_call", id: "c0", name: "zero" }),
        start(1, { type: "function_call", id: "c1", name: "one" }),
        delta(0, { type: "arguments_delta", arguments: '{"x":' }),
        delta(1, { type: "arguments_delta", arguments: '{"y":2}' }),
        delta(0, { type: "arguments_delta", arguments: "1}" }),
        stop(1),
        stop(0),
        completed,
      ],
      { tools: plainTools("zero", "one") },
    )
    const done = result.filter(
      (event) => event.type === "response.function_call_arguments.done",
    )
    expect(done.map((event) => [event.item_id, event.arguments])).toEqual([
      ["v1_id_1", '{"y":2}'],
      ["v1_id_0", '{"x":1}'],
    ])
    const output = (result.at(-1)?.response as Record<string, unknown>)
      .output as Array<Record<string, unknown>>
    expect(output.map((item) => item.call_id)).toEqual(["c0", "c1"])
  })

  test("restores a namespace on a streamed tool call", () => {
    const stream = createInteractionsEventStream({
      requestedModel: "client",
      createdAt: 1,
      tools: new Map([
        [
          "_9_mcp__demolookup",
          { name: "lookup", namespace: "mcp__demo", custom: false },
        ],
      ]),
    })
    const output = events(
      stream.push(
        encoder.encode(
          frame(created)
            + frame(
              start(0, {
                type: "function_call",
                id: "c",
                name: "_9_mcp__demolookup",
              }),
            )
            + frame(delta(0, { type: "arguments_delta", arguments: '{"q":1}' }))
            + frame(stop(0))
            + frame(completed),
        ),
      ) + stream.flush(),
    )
    const added = output.find(
      (event) => event.type === "response.output_item.added",
    )
    expect(added?.item).toMatchObject({
      type: "function_call",
      name: "lookup",
      namespace: "mcp__demo",
    })
  })
})

describe("Interactions SSE streamed tool arguments", () => {
  test("ignores the empty step.start placeholder when arguments stream later", () => {
    const result = run(
      [
        created,
        start(0, {
          type: "function_call",
          id: "call_1",
          name: "exec_command",
          arguments: {},
        }),
        delta(0, {
          type: "arguments_delta",
          arguments: '{"cmd":"cat fixture.txt"}',
        }),
        stop(0),
        completed,
      ],
      { tools: plainTools("exec_command") },
    )
    const done = result.find(
      (event) => event.type === "response.function_call_arguments.done",
    )
    expect(done?.arguments).toBe('{"cmd":"cat fixture.txt"}')
    const output = (result.at(-1)?.response as Record<string, unknown>)
      .output as Array<Record<string, unknown>>
    expect(output[0]).toMatchObject({
      type: "function_call",
      call_id: "call_1",
      name: "exec_command",
      arguments: '{"cmd":"cat fixture.txt"}',
    })
  })

  test("keeps a zero-argument streamed call valid without any delta", () => {
    const result = run(
      [
        created,
        start(0, {
          type: "function_call",
          id: "call_2",
          name: "list_files",
          arguments: {},
        }),
        stop(0),
        completed,
      ],
      { tools: plainTools("list_files") },
    )
    const done = result.find(
      (event) => event.type === "response.function_call_arguments.done",
    )
    expect(done?.arguments).toBe("{}")
    const output = (result.at(-1)?.response as Record<string, unknown>)
      .output as Array<Record<string, unknown>>
    expect(output[0]).toMatchObject({
      type: "function_call",
      call_id: "call_2",
      arguments: "{}",
      status: "completed",
    })
  })
})

test("rejects a call the request never declared", () => {
  const result = run([
    created,
    start(0, { type: "function_call", id: "c", name: "undeclared" }),
    stop(0),
    completed,
  ])
  expect(
    result.some((event) => event.type === "response.output_item.added"),
  ).toBe(false)
  expect(result.at(-1)?.type).toBe("response.failed")
})

test("invalid declared arguments never emit an executable call", () => {
  const result = run(
    [
      created,
      start(0, { type: "function_call", id: "c", name: "bad" }),
      delta(0, { type: "arguments_delta", arguments: "{bad" }),
      stop(0),
      completed,
    ],
    { tools: plainTools("bad") },
  )
  expect(result.at(-1)?.type).toBe("response.failed")
  expect(
    result.some((event) => event.type === "response.output_item.added"),
  ).toBe(false)
})
