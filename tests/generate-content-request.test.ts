import { describe, expect, test } from "bun:test"

import {
  convertResponsesRequestToGenerateContent as request,
  GenerateContentConversionError,
  STATE_CARRIER_PREFIX,
  type JsonObject,
} from "../src/services/generate-content/convert"

const functionTool = {
  type: "function",
  name: "weather",
  parameters: { type: "object", properties: { city: { type: "string" } } },
}
const customTool = { type: "custom", name: "patch", format: { type: "text" } }

interface Body {
  contents: Array<JsonObject>
  systemInstruction?: { parts: Array<JsonObject> }
  tools?: Array<{ functionDeclarations: Array<JsonObject> }>
  toolConfig?: JsonObject
  generationConfig?: JsonObject
}

function carrier(parts: Array<JsonObject>): string {
  const encoded = Buffer.from(JSON.stringify({ parts })).toString("base64url")
  return `${STATE_CARRIER_PREFIX}${encoded}`
}

function bodyOf(value: unknown): Body {
  return request(value).body as unknown as Body
}

function failure(value: unknown): string {
  try {
    request(value)
  } catch (error) {
    expect(error).toBeInstanceOf(GenerateContentConversionError)
    return (error as Error).message
  }
  throw new Error("expected the conversion to fail")
}

function toolConfigOf(value: unknown): unknown {
  return (request({ input: "hi", tools: [functionTool], tool_choice: value }).body as any).toolConfig
}

describe("GenerateContent request turns and state", () => {
  test("maps instructions and text turns without mutating the input", () => {
    const input = {
      model: "anything",
      instructions: "top",
      input: [
        { role: "developer", content: "rules" },
        { role: "user", content: "hi" },
        { role: "assistant", content: [{ type: "output_text", text: "yo" }] },
        { role: "user", content: "again" },
      ],
    }
    const clone = structuredClone(input)
    const body = bodyOf(input)

    expect(body.contents).toEqual([
      { role: "user", parts: [{ text: "hi" }] },
      { role: "model", parts: [{ text: "yo" }] },
      { role: "user", parts: [{ text: "again" }] },
    ])
    expect(body.systemInstruction).toEqual({
      parts: [{ text: "top" }, { text: "rules" }],
    })
    expect(input).toEqual(clone)
  })

  test("treats a string input as one user turn", () => {
    expect(bodyOf({ input: "hello" }).contents).toEqual([
      { role: "user", parts: [{ text: "hello" }] },
    ])
  })

  test("never emits the model, because the adapter owns the envelope", () => {
    const body = bodyOf({ model: "gemini-3.8-flash-medium", input: "hi" })
    expect(Object.keys(body)).toEqual(["contents"])
  })

  test("replays a carried model turn byte for byte", () => {
    const parts = [{ text: "OK" }, { thoughtSignature: "sig==", text: "" }]
    const body = bodyOf({
      input: [
        { role: "user", content: "remember ab5ec571" },
        { type: "reasoning", id: "r1", encrypted_content: carrier(parts) },
        { role: "user", content: "which marker?" },
      ],
    })
    expect(body.contents).toEqual([
      { role: "user", parts: [{ text: "remember ab5ec571" }] },
      { role: "model", parts },
      { role: "user", parts: [{ text: "which marker?" }] },
    ])
  })

  test("does not send a call twice when the carrier already holds it", () => {
    const call = { functionCall: { name: "weather", args: { city: "kyoto" } } }
    const body = bodyOf({
      input: [
        { type: "reasoning", encrypted_content: carrier([{ text: "" }, call]) },
        {
          type: "function_call",
          call_id: "call_1",
          name: "weather",
          arguments: '{"city":"kyoto"}',
        },
        { type: "function_call_output", call_id: "call_1", output: "sunny" },
      ],
    })
    expect(body.contents).toEqual([
      { role: "model", parts: [{ text: "" }, call] },
      {
        role: "user",
        parts: [
          {
            functionResponse: {
              name: "weather",
              response: { output: "sunny" },
            },
          },
        ],
      },
    ])
  })
})

describe("GenerateContent request tools and generation parameters", () => {
  test("declares functions, namespaces and custom tools with identities", () => {
    const result = request({
      input: "hi",
      tools: [
        functionTool,
        customTool,
        {
          type: "namespace",
          name: "fs",
          tools: [
            { type: "function", name: "read", parameters: { type: "object" } },
          ],
        },
      ],
    })
    const body = result.body as unknown as Body
    const declarations = body.tools?.[0].functionDeclarations ?? []

    expect(declarations.map((tool) => tool.name)).toEqual([
      "weather",
      "patch",
      "_2_fsread",
    ])
    expect(declarations[1].parameters).toEqual({
      type: "object",
      properties: { input: { type: "string" } },
      required: ["input"],
    })
    expect(declarations[0].parameters).toEqual(functionTool.parameters)
    expect([...result.tools]).toEqual([
      ["weather", { name: "weather", custom: false }],
      ["patch", { name: "patch", custom: true }],
      ["_2_fsread", { name: "read", namespace: "fs", custom: false }],
    ])
  })

  test("keeps a declared schema intact instead of rewriting keywords", () => {
    const parameters = {
      type: "object",
      additionalProperties: false,
      $defs: { inner: { type: "string" } },
    }
    const body = bodyOf({
      input: "hi",
      tools: [{ type: "function", name: "t", parameters }],
    })
    expect(body.tools?.[0].functionDeclarations[0].parameters).toEqual(
      parameters,
    )
  })

  test("replays calls and results inside the model and user turns", () => {
    const body = bodyOf({
      input: [
        { role: "user", content: "weather?" },
        {
          type: "function_call",
          call_id: "call_1",
          name: "weather",
          arguments: '{"city":"kyoto"}',
        },
        { type: "function_call_output", call_id: "call_1", output: "sunny" },
        { role: "user", content: "thanks" },
      ],
    })

    expect(body.contents).toEqual([
      { role: "user", parts: [{ text: "weather?" }] },
      {
        role: "model",
        parts: [{ functionCall: { name: "weather", args: { city: "kyoto" } } }],
      },
      {
        role: "user",
        parts: [
          {
            functionResponse: {
              name: "weather",
              response: { output: "sunny" },
            },
          },
        ],
      },
      { role: "user", parts: [{ text: "thanks" }] },
    ])
  })

  test("wraps a custom tool call as its single string parameter", () => {
    const body = bodyOf({
      input: [
        {
          type: "custom_tool_call",
          call_id: "c1",
          name: "patch",
          input: "diff",
        },
        { type: "custom_tool_call_output", call_id: "c1", output: "applied" },
      ],
    })
    expect(body.contents).toEqual([
      {
        role: "model",
        parts: [{ functionCall: { name: "patch", args: { input: "diff" } } }],
      },
      {
        role: "user",
        parts: [
          {
            functionResponse: {
              name: "patch",
              response: { output: "applied" },
            },
          },
        ],
      },
    ])
  })

  test("qualifies a namespaced call and its result", () => {
    const body = bodyOf({
      input: [
        {
          type: "function_call",
          call_id: "c1",
          name: "read",
          namespace: "fs",
          arguments: "{}",
        },
        { type: "function_call_output", call_id: "c1", output: "data" },
      ],
    })
    expect(body.contents).toEqual([
      {
        role: "model",
        parts: [{ functionCall: { name: "_2_fsread", args: {} } }],
      },
      {
        role: "user",
        parts: [
          {
            functionResponse: {
              name: "_2_fsread",
              response: { output: "data" },
            },
          },
        ],
      },
    ])
  })

  test("maps tool_choice and defaults to AUTO when tools exist", () => {
    expect(toolConfigOf(undefined)).toEqual({
      functionCallingConfig: { mode: "AUTO" },
    })
    expect(toolConfigOf("auto")).toEqual({
      functionCallingConfig: { mode: "AUTO" },
    })
    expect(toolConfigOf("none")).toEqual({
      functionCallingConfig: { mode: "NONE" },
    })
    expect(toolConfigOf("required")).toEqual({
      functionCallingConfig: { mode: "ANY" },
    })
    expect(toolConfigOf({ type: "function", name: "weather" })).toEqual({
      functionCallingConfig: {
        mode: "ANY",
        allowedFunctionNames: ["weather"],
      },
    })
  })

  test("maps limits and asks for thought parts", () => {
    const generation = bodyOf({
      input: "hi",
      max_output_tokens: 512,
      reasoning: { effort: "medium" },
    }).generationConfig
    expect(generation).toEqual({
      maxOutputTokens: 512,
      thinkingConfig: { includeThoughts: true },
    })
  })
})

describe("GenerateContent request rejection", () => {
  test("refuses references this stateless endpoint cannot resolve", () => {
    expect(failure({ input: "hi", previous_response_id: "resp_1" })).toContain(
      "previous_response_id",
    )
    expect(failure({ input: "hi", conversation: "conv_1" })).toContain(
      "conversation",
    )
    expect(failure({ input: "hi", parallel_tool_calls: false })).toContain(
      "parallel_tool_calls",
    )
  })

  test("refuses tool and input shapes it cannot express", () => {
    expect(
      failure({
        input: "hi",
        tools: [{ type: "function", name: "t", parameters: {}, strict: true }],
      }),
    ).toContain("strict")
    expect(
      failure({ input: "hi", tools: [functionTool], tool_choice: "maybe" }),
    ).toContain("tool_choice")
    expect(
      failure({
        input: "hi",
        tools: [functionTool],
        tool_choice: { type: "function", name: "missing" },
      }),
    ).toContain("Unknown chosen tool")
    expect(failure({ input: [{ type: "compaction", id: "x" }] })).toContain(
      "compaction",
    )
    expect(failure({ input: [{ type: "mystery" }] })).toContain(
      "Unsupported input",
    )
  })

  test("refuses a call or result it cannot pair up", () => {
    expect(
      failure({
        input: [
          {
            type: "function_call",
            call_id: "c1",
            name: "weather",
            arguments: "not json",
          },
        ],
      }),
    ).toContain("JSON object")
    expect(
      failure({
        input: [{ type: "function_call_output", call_id: "c", output: "x" }],
      }),
    ).toContain("call history")
    expect(
      failure({
        input: [
          {
            type: "function_call",
            call_id: "c1",
            name: "weather",
            arguments: "{}",
          },
          {
            type: "function_call_output",
            call_id: "c1",
            name: "other",
            output: "x",
          },
        ],
      }),
    ).toContain("Conflicting tool result name")
  })

  test("refuses a reasoning item without our state carrier", () => {
    expect(failure({ input: [{ type: "reasoning", id: "r" }] })).toContain(
      "state carrier",
    )
    expect(
      failure({
        input: [
          {
            type: "reasoning",
            encrypted_content: `${STATE_CARRIER_PREFIX}!!!`,
          },
        ],
      }),
    ).toContain("encoding")
    expect(
      failure({
        input: [{ type: "reasoning", encrypted_content: "something-else" }],
      }),
    ).toContain("Unsupported model state carrier")
  })
})
