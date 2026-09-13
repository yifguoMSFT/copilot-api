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

function fn(name: string, extra: JsonObject = {}): JsonObject {
  return {
    type: "function",
    name,
    parameters: { type: "object", properties: {} },
    ...extra,
  }
}

function ns(name: string, tools: Array<JsonObject>): JsonObject {
  return { type: "namespace", name, tools }
}

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
  test("preserves a Responses tool search history item", () => {
    const body = bodyOf({
      input: [{
        type: "tool_search_call",
        id: "tsc-1",
        call_id: "call-search",
        status: "completed",
        execution: "client",
        arguments: { query: "weather" },
      }],
    })
    expect(body.contents).toEqual([{
      role: "model",
      parts: [{ text: JSON.stringify({
        type: "tool_search_call",
        id: "tsc-1",
        call_id: "call-search",
        status: "completed",
        execution: "client",
        arguments: { query: "weather" },
      }) }],
    }])
  })

  test("merges tools discovered by tool search output", () => {
    const body = bodyOf({
      input: [{
        type: "tool_search_output",
        id: "tso-1",
        call_id: "call-search",
        status: "completed",
        tools: [fn("weather")],
      }],
    })
    expect(body.tools?.[0].functionDeclarations[0].name).toBe("weather")
  })

  test("ignores a native tool search declaration without inventing a function", () => {
    const body = bodyOf({
      input: "hi",
      tools: [{ type: "tool_search" }],
    })
    expect(body.tools).toBeUndefined()
  })

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

  test("keeps an instruction that arrives mid-history as a user turn", () => {
    const body = bodyOf({
      instructions: "top",
      input: [
        { role: "developer", content: "rules" },
        { role: "user", content: "hi" },
        { role: "assistant", content: "yo" },
        { role: "developer", content: "switch to plan mode" },
      ],
    })

    expect(body.contents).toEqual([
      { role: "user", parts: [{ text: "hi" }] },
      { role: "model", parts: [{ text: "yo" }] },
      { role: "user", parts: [{ text: "switch to plan mode" }] },
    ])
    // Only the leading instruction joins the system prompt.
    expect(body.systemInstruction).toEqual({
      parts: [{ text: "top" }, { text: "rules" }],
    })
  })

  test("takes tools from additional_tools items without overriding top-level ones", () => {
    const body = bodyOf({
      input: [
        { role: "user", content: "hi" },
        {
          type: "additional_tools",
          id: "at_1",
          role: "developer",
          tools: [
            { type: "function", name: "weather", description: "later" },
            customTool,
          ],
        },
      ],
      tools: [functionTool],
    })

    // The item carries declarations, so it never becomes a turn.
    expect(body.contents).toEqual([{ role: "user", parts: [{ text: "hi" }] }])
    expect(body.tools).toEqual([
      {
        functionDeclarations: [
          {
            name: "weather",
            parametersJsonSchema: {
              type: "object",
              properties: { city: { type: "string" } },
            },
          },
          {
            name: "patch",
            parameters: {
              type: "object",
              properties: { input: { type: "string" } },
              required: ["input"],
            },
          },
        ],
      },
    ])
    expect(body.toolConfig).toEqual({ functionCallingConfig: { mode: "AUTO" } })
  })

  // A namespace is a group, so a later batch extends it instead of being
  // dropped whole, and identity is the flattened namespace+child pair.
  test("merges an additional namespace child by child", () => {
    const result = request({
      input: [
        { role: "user", content: "hi" },
        {
          type: "additional_tools",
          id: "at_1",
          role: "developer",
          tools: [ns("mcp", [fn("a", { description: "later" }), fn("b")])],
        },
      ],
      tools: [ns("mcp", [fn("a", { description: "first" })])],
    })

    expect(result.body.tools).toEqual([
      {
        functionDeclarations: [
          {
            name: "_3_mcpa",
            description: "first",
            parametersJsonSchema: { type: "object", properties: {} },
          },
          {
            name: "_3_mcpb",
            parametersJsonSchema: { type: "object", properties: {} },
          },
        ],
      },
    ])
    // The new child is reachable in the reverse direction too, which is how a
    // call gets its namespace back.
    expect([...result.tools]).toEqual([
      ["_3_mcpa", { name: "a", namespace: "mcp", custom: false }],
      ["_3_mcpb", { name: "b", namespace: "mcp", custom: false }],
    ])
  })

  test("keeps the first declaration of a qualified identity", () => {
    const result = request({
      input: [
        { role: "user", content: "hi" },
        {
          type: "additional_tools",
          id: "at_1",
          role: "developer",
          tools: [ns("mcp", [fn("a", { description: "second" }), fn("c")])],
        },
        {
          type: "additional_tools",
          id: "at_2",
          role: "developer",
          tools: [ns("mcp", [fn("c", { description: "third" }), fn("d")])],
        },
      ],
      tools: [ns("mcp", [fn("a", { description: "first" })])],
    })

    const declarations = (
      result.body.tools as Array<{ functionDeclarations: Array<JsonObject> }>
    ).flatMap((group) => group.functionDeclarations)
    expect(declarations.map((child) => child.name)).toEqual([
      "_3_mcpa",
      "_3_mcpc",
      "_3_mcpd",
    ])
    expect(declarations[0].description).toBe("first")
    expect(declarations[1].description).toBeUndefined()
  })

  test("does not confuse a direct name with a namespace of the same name", () => {
    const result = request({
      input: [
        { role: "user", content: "hi" },
        {
          type: "additional_tools",
          id: "at_1",
          role: "developer",
          tools: [ns("one", [fn("x")]), fn("one.x")],
        },
      ],
      tools: [fn("one"), ns("one", [fn("x")])],
    })

    const names = (result.body.tools as Array<{ functionDeclarations: Array<JsonObject> }>)
      .flatMap((group) => group.functionDeclarations.map((child) => child.name))
    expect(names).toEqual(["one", "_3_onex", "one.x"])
    expect([...result.tools].map(([name]) => name)).toEqual([
      "one",
      "_3_onex",
      "one.x",
    ])
  })

  test("leaves the declared tools untouched while merging", () => {
    const tools = [ns("mcp", [fn("a", { description: "first" })])]
    const input = [
      { role: "user", content: "hi" },
      {
        type: "additional_tools",
        id: "at_1",
        role: "developer",
        tools: [ns("mcp", [fn("a", { description: "second" }), customTool])],
      },
    ]
    const clone = structuredClone({ tools, input })

    request({ input, tools })

    expect({ tools, input }).toEqual(clone)
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
    const call = {
      functionCall: { name: "weather", args: { city: "kyoto" }, id: "upstream-1" },
    }
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

  // The upstream call id and the signature both survive only inside the
  // carrier, so the bare replay the client derives from the same turn can only
  // be recognized when neither field takes part in the comparison.
  test("drops the bare replay of a signed carried call and text", () => {
    const parts = [
      { text: "looking up", thoughtSignature: "text-sig==" },
      {
        functionCall: { name: "weather", args: { city: "kyoto" }, id: "upstream-1" },
        thoughtSignature: "call-sig==",
      },
    ]
    const body = bodyOf({
      input: [
        { type: "reasoning", id: "r1", encrypted_content: carrier(parts) },
        { role: "assistant", content: "looking up" },
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
      { role: "model", parts },
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

  test("lets a trailing carrier supersede the turn it belongs to", () => {
    const parts = [
      { text: "" },
      { functionCall: { name: "weather", args: { city: "kyoto" } }, thoughtSignature: "call-sig==" },
    ]
    const body = bodyOf({
      input: [
        {
          type: "function_call",
          call_id: "call_1",
          name: "weather",
          arguments: '{"city":"kyoto"}',
        },
        { type: "reasoning", encrypted_content: carrier(parts) },
        { type: "function_call_output", call_id: "call_1", output: "sunny" },
      ],
    })
    expect(body.contents[0]).toEqual({ role: "model", parts })
  })

  test("keeps every parallel call exactly once", () => {
    const parts = [
      { functionCall: { name: "a", args: {}, id: "upstream-1" }, thoughtSignature: "s1==" },
      { functionCall: { name: "b", args: {}, id: "upstream-2" } },
    ]
    const body = bodyOf({
      input: [
        { type: "reasoning", encrypted_content: carrier(parts) },
        { type: "function_call", call_id: "c1", name: "a", arguments: "{}" },
        { type: "function_call", call_id: "c2", name: "b", arguments: "{}" },
      ],
    })
    expect(body.contents).toEqual([{ role: "model", parts }])
  })

  // The upstream treats a missing signature as synthetic history, so the
  // converter never has to invent the `skip_thought_signature_validator`
  // sentinel, and it never rewrites a signature it received either.
  test("never invents or rewrites a signature", () => {
    const unsigned = bodyOf({
      input: [
        {
          type: "function_call",
          call_id: "c1",
          name: "weather",
          arguments: "{}",
        },
      ],
    })
    expect(unsigned.contents).toEqual([
      { role: "model", parts: [{ functionCall: { name: "weather", args: {} } }] },
    ])

    const forwarded = bodyOf({
      input: [
        {
          type: "function_call",
          call_id: "c1",
          name: "weather",
          arguments: "{}",
          thought_signature: "skip_thought_signature_validator",
        },
      ],
    })
    expect(forwarded.contents).toEqual([
      {
        role: "model",
        parts: [
          {
            functionCall: { name: "weather", args: {} },
            thoughtSignature: "skip_thought_signature_validator",
          },
        ],
      },
    ])
  })

  // Upstream pairs the Nth response with the Nth call, so results are written
  // in call order even when the client reports them the other way round.
  test("writes parallel results as one turn in call order", () => {
    const body = bodyOf({
      input: [
        { role: "user", content: "call both" },
        { type: "function_call", call_id: "c1", name: "a", arguments: "{}" },
        { type: "function_call", call_id: "c2", name: "b", arguments: "{}" },
        { type: "function_call_output", call_id: "c2", output: "second" },
        { type: "function_call_output", call_id: "c1", output: "first" },
      ],
    })
    expect(body.contents).toEqual([
      { role: "user", parts: [{ text: "call both" }] },
      {
        role: "model",
        parts: [
          { functionCall: { name: "a", args: {} } },
          { functionCall: { name: "b", args: {} } },
        ],
      },
      {
        role: "user",
        parts: [
          { functionResponse: { name: "a", response: { output: "first" } } },
          { functionResponse: { name: "b", response: { output: "second" } } },
        ],
      },
    ])
  })

  test("keeps an unanswered call unanswered and still carries the text", () => {
    const body = bodyOf({
      input: [
        { role: "user", content: "call it" },
        { type: "function_call", call_id: "c1", name: "a", arguments: "{}" },
        { role: "developer", content: "note" },
      ],
    })
    // No synthesized functionResponse, and the instruction is not lost.
    expect(body.contents).toEqual([
      { role: "user", parts: [{ text: "call it" }] },
      { role: "model", parts: [{ functionCall: { name: "a", args: {} } }] },
      { role: "user", parts: [{ text: "note" }] },
    ])
  })

  test("waits for the tool result before releasing a mid-call instruction", () => {
    const body = bodyOf({
      input: [
        { role: "user", content: "call it" },
        { type: "function_call", call_id: "c1", name: "weather", arguments: "{}" },
        { role: "developer", content: "switch to plan mode" },
        { type: "function_call_output", call_id: "c1", output: "sunny" },
        { role: "user", content: "and now?" },
      ],
    })
    expect(body.contents).toEqual([
      { role: "user", parts: [{ text: "call it" }] },
      { role: "model", parts: [{ functionCall: { name: "weather", args: {} } }] },
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
      { role: "user", parts: [{ text: "switch to plan mode" }] },
      { role: "user", parts: [{ text: "and now?" }] },
    ])
  })

  test("keeps a carried turn whole when an instruction lands inside it", () => {
    const parts = [
      {
        functionCall: { name: "weather", args: { city: "kyoto" }, id: "upstream-1" },
        thoughtSignature: "call-sig==",
      },
      { text: "" },
    ]
    const body = bodyOf({
      input: [
        { role: "user", content: "call it" },
        { type: "reasoning", encrypted_content: carrier(parts) },
        { role: "developer", content: "be brief" },
        {
          type: "function_call",
          call_id: "c1",
          name: "weather",
          arguments: '{"city":"kyoto"}',
        },
        { type: "function_call_output", call_id: "c1", output: "sunny" },
      ],
    })
    // The instruction cannot split the carried turn, so the replayed call is
    // recognized as the carried one instead of becoming a second model turn.
    expect(body.contents).toEqual([
      { role: "user", parts: [{ text: "call it" }] },
      { role: "model", parts },
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
      { role: "user", parts: [{ text: "be brief" }] },
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
    expect(declarations[0].parametersJsonSchema).toEqual(functionTool.parameters)
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
    expect(body.tools?.[0].functionDeclarations[0].parametersJsonSchema).toEqual(
      parameters,
    )
  })

  test("declares the schema as JSON Schema so const and typed enums survive", () => {
    const parameters = {
      type: "object",
      properties: {
        flag: { type: "boolean", const: true, enum: [true] },
        count: { type: "number", anyOf: [{ type: "number", enum: [1, 2] }] },
        mode: { type: "string", enum: ["plan", "edit"] },
      },
    }
    const clone = structuredClone(parameters)
    const body = bodyOf({
      input: "hi",
      tools: [{ type: "function", name: "t", parameters }],
    })

    // The legacy `parameters` proto rejects `const` and non-string enum
    // members, so the schema is published under the JSON Schema field instead.
    expect(
      body.tools?.[0].functionDeclarations[0].parametersJsonSchema,
    ).toEqual(parameters)
    expect(body.tools?.[0].functionDeclarations[0].parameters).toBeUndefined()
    expect(parameters).toEqual(clone)
  })

  test("keeps resolving a local reference inside the declared schema", () => {
    const body = request(
      {
        input: "hi",
        tools: [
          {
            type: "function",
            name: "t",
            parameters: {
              $defs: { flag: { type: "boolean", enum: [false] } },
              type: "object",
              properties: { flag: { $ref: "#/$defs/flag" } },
            },
          },
        ],
      },
      { cleanSchema: true },
    ).body as unknown as Body

    expect(
      body.tools?.[0].functionDeclarations[0].parametersJsonSchema,
    ).toEqual({
      type: "object",
      properties: { flag: { type: "boolean", enum: [false] } },
    })
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

  test("accepts foreign reasoning while rejecting corrupt native carriers", () => {
    expect(bodyOf({ input: [{ type: "reasoning", id: "r" }] }).contents).toEqual([])
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
    expect(bodyOf({
      input: [
        { role: "user", content: "hi" },
        { type: "reasoning", encrypted_content: "foreign-opaque-state", summary: [{ type: "summary_text", text: "Considering the request" }] },
        { role: "assistant", content: "hello" },
        { role: "user", content: "continue" },
      ],
    }).contents).toEqual([
      { role: "user", parts: [{ text: "hi" }] },
      { role: "model", parts: [{ text: "Considering the request", thought: true }, { text: "hello" }] },
      { role: "user", parts: [{ text: "continue" }] },
    ])
  })
})

describe("GenerateContent request structured output", () => {
  const generationOf = (format?: unknown): JsonObject | undefined =>
    bodyOf({ input: "hi", ...(format === undefined ? {} : { text: { format } }) })
      .generationConfig

  test("leaves plain and absent text formats at the default", () => {
    expect(generationOf()).toBeUndefined()
    expect(generationOf({})).toBeUndefined()
    expect(generationOf({ type: "text" })).toBeUndefined()
  })

  test("maps json_object to a JSON mime type without a schema", () => {
    expect(generationOf({ type: "json_object" })).toEqual({
      responseMimeType: "application/json",
    })
  })

  test("carries a json_schema unchanged, including enum and anyOf", () => {
    const schema = {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["plan", "edit"] },
        count: { anyOf: [{ type: "integer", enum: [1, 2] }] },
      },
      required: ["mode"],
      additionalProperties: false,
    }
    const clone = structuredClone(schema)
    const text = { type: "json_schema", name: "answer", strict: true, schema }

    expect(generationOf(text)).toEqual({
      responseMimeType: "application/json",
      responseSchema: schema,
    })
    expect(schema).toEqual(clone)
    expect(generationOf(text)?.responseSchema).not.toBe(schema)
  })

  test("accepts the nested json_schema revision", () => {
    expect(
      generationOf({
        type: "json_schema",
        json_schema: { name: "answer", schema: { type: "object" } },
      }),
    ).toEqual({
      responseMimeType: "application/json",
      responseSchema: { type: "object" },
    })
  })

  test("refuses a format whose contract cannot be expressed", () => {
    expect(
      failure({ input: "hi", text: { format: { type: "json_schema" } } }),
    ).toContain("requires a schema")
    expect(failure({ input: "hi", text: { format: { type: "grammar" } } })).toContain(
      "Unsupported text format",
    )
  })

  test("keeps the structured output request free of application policy", () => {
    const body = bodyOf({
      input: "hi",
      text: {
        format: { type: "json_schema", name: "answer", schema: { type: "object" } },
      },
    })
    expect(Object.keys(body.generationConfig ?? {})).toEqual([
      "responseMimeType",
      "responseSchema",
    ])
  })
})
