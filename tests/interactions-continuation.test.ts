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
  frame,
  start,
  stop,
} from "./support/interactions-stream"

describe("Interactions reference continuation", () => {
  test("rejects a persistent conversation instead of dropping its context", () => {
    for (const conversation of ["conv_1", { id: "conv_1" }]) {
      expect(() => request({ model: "g", input: "x", conversation })).toThrow(
        "conversation has no Interactions equivalent",
      )
    }
    expect(
      request({ model: "g", input: "x", conversation: null }).body,
    ).not.toHaveProperty("conversation")
  })

  test("carries a real parent id and only the new instructions", () => {
    const plain = request({
      model: "g",
      input: "next",
      store: false,
      previous_response_id: "v1_parent",
    })
    expect(plain.body.previous_interaction_id).toBe("v1_parent")
    expect(plain.body.store).toBe(false)
    expect(plain.body).not.toHaveProperty("system_instruction")
    const redirected = request({
      model: "g",
      input: "next",
      instructions: "new rules",
      previous_response_id: "v1_parent",
    })
    expect(redirected.body.previous_interaction_id).toBe("v1_parent")
    expect(redirected.body.system_instruction).toBe("new rules")
  })

  test("refuses a blank parent id instead of querying an empty resource", () => {
    for (const id of ["", "   ", "\t"]) {
      expect(() =>
        request({ model: "g", input: "x", previous_response_id: id }),
      ).toThrow("previous_response_id must be a non-empty interaction id")
    }
  })

  test("reports items that need the OpenAI store as unsupported", () => {
    expect(() =>
      request({ model: "g", input: [{ type: "item_reference", id: "msg_1" }] }),
    ).toThrow("item_reference has no Interactions equivalent")
    expect(() =>
      request({
        model: "g",
        input: [
          { type: "compaction", id: "cmp_1", encrypted_content: "gAAAAAB" },
        ],
      }),
    ).toThrow("compaction has no Interactions equivalent")
  })

  test("falls back to full history when the response omits its id", () => {
    const converted = response(
      { model: "gemini", status: "completed", steps: [] },
      { requestedModel: "g" },
    )
    expect(converted.id).toBe("")
    expect(() =>
      request({
        model: "g",
        input: "next",
        previous_response_id: converted.id,
      }),
    ).toThrow("previous_response_id must be a non-empty interaction id")
    expect(request({ model: "g", input: "next" }).body).not.toHaveProperty(
      "previous_interaction_id",
    )
  })
})

const toolDeclarations = [
  {
    type: "function",
    name: "get_weather",
    strict: false,
    parameters: { type: "object", properties: { city: { type: "string" } } },
  },
]

const parentInteractionId =
  "v1_ChdPU0F4YWFtNkFwS2kxZThQZ05lbXdROBIXT1NBeGFhbTZBcEtpMWU4UGdOZW13UTg"

describe("Client owned continuation", () => {
  test("continues a full-history turn from client data with a fresh stream", () => {
    const first = request({
      model: "g",
      input: "weather?",
      tools: toolDeclarations,
    })
    const source = {
      type: "thought",
      signature: "sig_turn_1",
      summary: [{ type: "text", text: "calling the tool", extra_part: 1 }],
    }
    // Turn one lives in its own scope: the stream instance is unreachable once
    // it has produced the client-visible text, exactly as in the bridge.
    const clientSse = (() => {
      const stream = converter({ requestedModel: "g", tools: first.tools })
      return (
        stream.push(
          encoder.encode(
            [
              created,
              start(0, source),
              stop(0),
              start(1, {
                type: "function_call",
                id: "call_weather_1",
                name: "get_weather",
                arguments: {},
              }),
              delta(1, {
                type: "arguments_delta",
                arguments: '{"city":"Tokyo"}',
              }),
              stop(1),
              completed,
            ]
              .map((value) => frame(value))
              .join(""),
          ),
        ) + stream.flush()
      )
    })()
    const terminal = events(clientSse).at(-1)?.response as JsonObject
    expect(terminal.status).toBe("completed")
    const [reasoningItem, callItem] = terminal.output as Array<JsonObject>
    expect(callItem).toMatchObject({
      type: "function_call",
      call_id: "call_weather_1",
      name: "get_weather",
    })
    expect(callItem.arguments).toBe('{"city":"Tokyo"}')

    // Turn two only uses what the client holds, plus the tools it declares now.
    const second = request({
      model: "g",
      input: [
        {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: "weather?" }],
        },
        reasoningItem,
        callItem,
        {
          type: "function_call_output",
          call_id: "call_weather_1",
          output: "sunny, 21C",
        },
        {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: "and tomorrow?" }],
        },
      ],
      tools: toolDeclarations,
    })
    expect(second.tools).not.toBe(first.tools)
    expect([...second.tools.keys()]).toEqual([...first.tools.keys()])
    const steps = second.body.input as Array<JsonObject>
    expect(steps.map((step) => step.type)).toEqual([
      "user_input",
      "thought",
      "function_call",
      "function_result",
      "user_input",
    ])
    expect(steps[1]).toEqual(source)
    expect(steps[2]).toEqual({
      type: "function_call",
      id: "call_weather_1",
      name: "get_weather",
      arguments: { city: "Tokyo" },
    })
    expect(steps[3]).toEqual({
      type: "function_result",
      call_id: "call_weather_1",
      name: "get_weather",
      result: [{ type: "text", text: "sunny, 21C" }],
    })
    expect(second.body).not.toHaveProperty("previous_interaction_id")
  })

  test("maps a real interaction id and sends only the new instructions", () => {
    const result = {
      type: "function_call_output",
      call_id: "call_weather_1",
      output: "sunny, 21C",
    }
    const withNew = request({
      model: "g",
      input: [result],
      previous_response_id: parentInteractionId,
      instructions: "new rules",
    })
    expect(withNew.body.previous_interaction_id).toBe(parentInteractionId)
    expect(withNew.body.system_instruction).toBe("new rules")
    const withoutNew = request({
      model: "g",
      input: [result],
      previous_response_id: parentInteractionId,
    })
    expect(withoutNew.body.previous_interaction_id).toBe(parentInteractionId)
    expect(withoutNew.body).not.toHaveProperty("system_instruction")
    expect((withoutNew.body.input as Array<JsonObject>)[0]).toEqual({
      type: "function_result",
      call_id: "call_weather_1",
      result: [{ type: "text", text: "sunny, 21C" }],
    })
  })

  test("keeps every text block of a tool result instead of joining them", () => {
    const converted = request({
      model: "g",
      input: [
        { type: "function_call", call_id: "c1", name: "read", arguments: "{}" },
        {
          type: "function_call_output",
          call_id: "c1",
          output: [
            { type: "input_text", text: "line one" },
            { type: "input_text", text: "line two" },
          ],
        },
      ],
    })
    expect((converted.body.input as Array<JsonObject>)[1]).toEqual({
      type: "function_result",
      call_id: "c1",
      name: "read",
      result: [
        { type: "text", text: "line one" },
        { type: "text", text: "line two" },
      ],
    })
  })

  test("fails explicitly when the client omits information a step needs", () => {
    expect(() =>
      request({
        model: "g",
        input: [{ type: "function_call_output", call_id: "c1", output: "x" }],
      }),
    ).toThrow("Tool result requires call history or explicit name")
    expect(() =>
      request({
        model: "g",
        input: [
          {
            type: "reasoning",
            summary: [{ type: "summary_text", text: "partial" }],
          },
        ],
      }),
    ).toThrow(
      "Reasoning item has no replay envelope; only a signed thought can be replayed",
    )
    expect(() =>
      response(
        {
          id: "v1",
          model: "g",
          status: "completed",
          steps: [
            {
              type: "function_call",
              id: "c1",
              name: "get_weather",
              arguments: {},
            },
          ],
        },
        { tools: new Map() },
      ),
    ).toThrow("Tool call get_weather is not in the declared tools")
  })
})
