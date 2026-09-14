import { describe, expect, test } from "bun:test"

import {
  convertInteractionsResponseToResponses as response,
  convertResponsesRequestToInteractions as request,
  type JsonObject,
} from "../src/services/interactions/convert"

const itemIds = (value: JsonObject) =>
  (value.output as Array<JsonObject>).map((item) => item.id)

const weatherTool = new Map([["weather", { name: "weather", custom: false }]])

describe("Interactions item identity", () => {
  test("keeps one text block per Responses content block", () => {
    const converted = request({
      model: "g",
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: "first" },
            { type: "input_text", text: "second" },
          ],
        },
        {
          type: "message",
          role: "assistant",
          content: [
            { type: "output_text", text: "a" },
            { type: "output_text", text: "b" },
          ],
        },
      ],
    })
    expect(converted.body.input).toEqual([
      {
        type: "user_input",
        content: [
          { type: "text", text: "first" },
          { type: "text", text: "second" },
        ],
      },
      {
        type: "model_output",
        content: [
          { type: "text", text: "a" },
          { type: "text", text: "b" },
        ],
      },
    ])
  })

  test("replays every text block of a multi-block message", () => {
    const converted = response({
      id: "v1_multi",
      model: "gemini",
      status: "completed",
      steps: [
        {
          type: "model_output",
          content: [
            { type: "text", text: "a" },
            { type: "text", text: "b" },
          ],
        },
      ],
    })
    const item = (converted.output as Array<JsonObject>)[0]
    expect(
      (item.content as Array<JsonObject>).map((part) => part.text),
    ).toEqual(["a", "b"])
    expect(request({ model: "g", input: [item] }).body.input).toEqual([
      {
        type: "model_output",
        content: [
          { type: "text", text: "a" },
          { type: "text", text: "b" },
        ],
      },
    ])
  })

  test("gives each response an item id scope of its own", () => {
    const unnamed: JsonObject = {
      model: "gemini",
      status: "completed",
      steps: [
        {
          type: "function_call",
          id: "call_1",
          name: "weather",
          arguments: { city: "x" },
        },
      ],
    }
    const first = response(unnamed, { tools: weatherTool })
    const second = response(unnamed, { tools: weatherTool })
    expect(itemIds(first)).not.toEqual(itemIds(second))
    // The upstream call_id is the tool's identity and never regenerated.
    expect((first.output as Array<JsonObject>)[0].call_id).toBe("call_1")
    expect((second.output as Array<JsonObject>)[0].call_id).toBe("call_1")
    // The upstream interaction id is used verbatim when it exists.
    expect(
      itemIds(response({ ...unnamed, id: "v1_named" }, { tools: weatherTool })),
    ).toEqual(["fc_v1_named_0"])
    expect(
      itemIds(response(unnamed, { itemIdScope: "pinned", tools: weatherTool })),
    ).toEqual(["fc_pinned_0"])
  })

  test("keeps message text but cannot carry Responses phase or status", () => {
    const converted = request({
      model: "g",
      input: [
        {
          type: "message",
          id: "msg_1",
          role: "assistant",
          phase: "commentary",
          status: "completed",
          content: [{ type: "output_text", text: "working" }],
        },
        {
          type: "message",
          id: "msg_2",
          role: "assistant",
          phase: "final_answer",
          content: [{ type: "output_text", text: "done" }],
        },
      ],
    })
    expect(converted.body.input).toEqual([
      { type: "model_output", content: [{ type: "text", text: "working" }] },
      { type: "model_output", content: [{ type: "text", text: "done" }] },
    ])
    expect(converted.body).not.toHaveProperty("system_instruction")
  })
})
