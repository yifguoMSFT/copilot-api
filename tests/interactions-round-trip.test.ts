import { describe, expect, test } from "bun:test"

import {
  convertInteractionsResponseToResponses,
  convertResponsesRequestToInteractions,
  type JsonObject,
} from "../src/services/interactions/convert"
import { createInteractionsEventStream } from "../src/services/interactions/stream"
import fixture from "./fixtures/interactions/offline-round-trip.json"
import official from "./fixtures/interactions/simple-response.json"

const encode = (value: unknown) =>
  new TextEncoder().encode(`data: ${JSON.stringify(value)}\n\n`)
const parseEvents = (value: string): Array<JsonObject> =>
  value
    .split("\n\n")
    .filter((frame) => frame.startsWith("event:"))
    .map((frame) => JSON.parse(frame.split("\ndata: ")[1]) as JsonObject)
const options = {
  requestedModel: "client-alias",
  customTools: new Set(["patch"]),
}
const baseRequest = {
  model: "client-alias",
  store: false,
  instructions: "stable prefix\n",
  tools: [
    {
      type: "function",
      name: "weather",
      parameters: { type: "object", properties: { city: { type: "string" } } },
    },
    { type: "custom", name: "patch" },
  ],
  input: [{ role: "user", content: "check weather and patch" }],
  prompt_cache_key: "cache-stable",
}

function streamReply() {
  const stream = createInteractionsEventStream(options)
  let output = ""
  for (const event of fixture.events) output += stream.push(encode(event))
  output += stream.flush()
  return parseEvents(output)
}

describe("Offline converter round trips", () => {
  test("independent JSON and SSE fixtures agree on complete output, usage and envelope", () => {
    const json = convertInteractionsResponseToResponses(
      fixture.interaction,
      options,
    )
    const events = streamReply()
    expect(events.at(-1)?.type).toBe("response.completed")
    expect(events.at(-1)?.response).toEqual(json)
    const itemEvents = events.filter(
      (event) => event.type === "response.output_item.done",
    )
    expect(itemEvents.find((event) => event.output_index === 0)?.item).toEqual(
      (json.output as Array<JsonObject>)[0],
    )
    expect(
      events.find(
        (event) => event.type === "response.custom_tool_call_input.done",
      )?.input,
    ).toBe("*** Begin Patch\nraw\n")
  })

  test("fresh instances reconstruct client-carried thought and both tool calls, never add history", () => {
    const first = convertResponsesRequestToInteractions(baseRequest, {
      upstreamModel: "gemini-test",
      metadata: { "session-id": "s" },
    })
    const saved = (streamReply().at(-1)?.response as JsonObject)
      .output as Array<JsonObject>
    const next = {
      ...baseRequest,
      input: [
        ...baseRequest.input,
        ...saved,
        {
          type: "function_call_output",
          call_id: "call_weather",
          output: "sunny\n",
        },
        {
          type: "custom_tool_call_output",
          call_id: "call_patch",
          output: "patched",
        },
      ],
    }
    const converted = convertResponsesRequestToInteractions(next, {
      upstreamModel: "gemini-test",
      metadata: first.metadata,
    })
    expect(converted.body.input).toEqual([
      ...(first.body.input as Array<JsonObject>),
      ...fixture.interaction.steps,
      {
        type: "function_result",
        call_id: "call_weather",
        name: "weather",
        result: [{ type: "text", text: "sunny\n" }],
      },
      {
        type: "function_result",
        call_id: "call_patch",
        name: "patch",
        result: [{ type: "text", text: "patched" }],
      },
    ])
    expect(converted.body.store).toBe(false)
    expect(converted.body).not.toHaveProperty("previous_interaction_id")
    expect(converted.body.system_instruction).toBe(
      first.body.system_instruction,
    )
    expect(converted.body.tools).toEqual(first.body.tools)
    expect(converted.metadata).toEqual(first.metadata)
    expect(
      convertResponsesRequestToInteractions(next, {
        upstreamModel: "gemini-test",
        metadata: first.metadata,
      }),
    ).toEqual(converted)
    const final = convertInteractionsResponseToResponses(
      {
        id: "v1_next",
        model: "gemini-test",
        status: "completed",
        steps: [
          { type: "model_output", content: [{ type: "text", text: "done" }] },
        ],
      },
      options,
    )
    expect(final.id).toBe("v1_next")
    expect(final.output).toHaveLength(1)
  })

  test("interleaved instances and caller mutation do not share buffers or tool names", () => {
    const custom = new Set(["patch"])
    const a = createInteractionsEventStream({
      requestedModel: "a",
      customTools: custom,
    })
    const b = createInteractionsEventStream({ requestedModel: "b" })
    custom.clear()
    let outputA = ""
    let outputB = ""
    for (const event of fixture.events) {
      outputA += a.push(encode(event))
      outputB += b.push(encode(event))
    }
    const replyA = parseEvents(outputA + a.flush()).at(-1)
      ?.response as JsonObject
    const replyB = parseEvents(outputB + b.flush()).at(-1)
      ?.response as JsonObject
    expect(replyA.model).toBe("a")
    expect(replyB.model).toBe("b")
    expect((replyA.output as Array<JsonObject>)[2].type).toBe(
      "custom_tool_call",
    )
    expect((replyB.output as Array<JsonObject>)[2].type).toBe("function_call")
  })

  test("official JSON matches a terminal snapshot stream", () => {
    const stream = createInteractionsEventStream(options)
    const output =
      stream.push(
        encode({
          event_type: "interaction.created",
          interaction: { id: official.id },
        }),
      )
      + stream.push(
        encode({ event_type: "interaction.completed", interaction: official }),
      )
      + stream.flush()
    expect(parseEvents(output).at(-1)?.response).toEqual(
      convertInteractionsResponseToResponses(official, options),
    )
  })

  test("session/cache metadata changes never alter the protocol body", () => {
    const a = convertResponsesRequestToInteractions(baseRequest, {
      metadata: { "session-id": "s1" },
    })
    const b = convertResponsesRequestToInteractions(
      { ...baseRequest, prompt_cache_key: "different" },
      { metadata: { "session-id": "s2" } },
    )
    expect(a.body).toEqual(b.body)
    expect(a.metadata).not.toEqual(b.metadata)
    expect(a.body).not.toHaveProperty("prompt_cache_key")
    expect(a.body).not.toHaveProperty("session-id")
  })
})

describe("Terminal status parity", () => {
  const partial = {
    type: "model_output",
    content: [{ type: "text", text: "partial answer" }],
  }
  const terminalSnapshot = (status: string): JsonObject => ({
    id: "v1_terminal",
    model: "gemini",
    status,
    steps: [partial],
    usage: {
      total_input_tokens: 3,
      total_output_tokens: 1,
      total_thought_tokens: 0,
      total_tokens: 4,
    },
  })
  const replyEvents = (interaction: JsonObject): Array<JsonObject> => [
    {
      event_type: "interaction.created",
      interaction: { id: "v1_terminal" },
    },
    { event_type: "step.start", index: 0, step: partial },
    { event_type: "step.stop", index: 0 },
    { event_type: "interaction.completed", interaction },
  ]

  test("both directions report an empty id when the live interaction omits it", () => {
    const interaction: JsonObject = {
      object: "interaction",
      model: "gemini-3.8-flash",
      status: "completed",
      steps: [partial],
    }
    const stream = createInteractionsEventStream(options)
    let wire = ""
    for (const event of [
      {
        event_type: "interaction.created",
        interaction: { status: "in_progress" },
      },
      { event_type: "step.start", index: 0, step: partial },
      { event_type: "step.stop", index: 0 },
      { event_type: "interaction.completed", interaction },
    ])
      wire += stream.push(encode(event))
    wire += stream.flush()
    const json = convertInteractionsResponseToResponses(interaction, options)
    expect(json.id).toBe("")
    expect(parseEvents(wire).at(-1)?.response).toEqual(json)
  })

  test.each([
    ["completed", "response.completed"],
    ["failed", "response.failed"],
    ["incomplete", "response.incomplete"],
    ["cancelled", "response.incomplete"],
  ])("JSON and SSE agree for a %s interaction", (status, eventType) => {
    const interaction = terminalSnapshot(status)
    const stream = createInteractionsEventStream(options)
    let wire = ""
    for (const event of replyEvents(interaction))
      wire += stream.push(encode(event))
    wire += stream.flush()
    const events = parseEvents(wire)
    expect(events.at(-1)?.type).toBe(eventType)
    const json = convertInteractionsResponseToResponses(interaction, options)
    expect(events.at(-1)?.response).toEqual(json)
    expect(json.incomplete_details).toBeNull()
    expect(json.usage).toEqual({
      input_tokens: 3,
      output_tokens: 1,
      total_tokens: 4,
      output_tokens_details: { reasoning_tokens: 0 },
    })
    const output = json.output as Array<JsonObject>
    expect(output).toHaveLength(1)
    expect(output[0].content).toEqual([
      { type: "output_text", text: "partial answer", annotations: [] },
    ])
    expect(output[0].status).toBe("completed")
    expect(json.status).toBe(status === "cancelled" ? "incomplete" : status)
  })
})
