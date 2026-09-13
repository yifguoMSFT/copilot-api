import { describe, expect, test } from "bun:test"

import {
  convertInteractionsResponseToResponses as response,
  convertResponsesRequestToInteractions as request,
  InteractionsConversionError,
  type JsonObject,
} from "../src/services/interactions/convert"
import official from "./fixtures/interactions/simple-response.json"

const functionTool = {
  type: "function",
  name: "weather",
  parameters: { type: "object" },
}
const customTool = { type: "custom", name: "patch", format: { type: "text" } }

function reply(steps: Array<Record<string, unknown>>) {
  return { id: "v1_original", model: "gemini", status: "completed", steps }
}

describe("Interactions request conversion", () => {
  test("preserves a Responses tool search history item", () => {
    const result = request({
      model: "gemini",
      input: [{
        type: "tool_search_call",
        id: "tsc-1",
        call_id: "call-search",
        status: "completed",
        execution: "client",
        arguments: { query: "weather" },
      }],
    })
    expect(result.body.input).toEqual([{
      type: "model_output",
      content: [{ type: "text", text: JSON.stringify({
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
    const result = request({
      model: "gemini",
      input: [{
        type: "tool_search_output",
        id: "tso-1",
        call_id: "call-search",
        status: "completed",
        tools: [functionTool],
      }],
    })
    expect(result.body.tools).toEqual([functionTool])
  })

  test("ignores a native tool search declaration without inventing a function", () => {
    const result = request({
      model: "gemini",
      input: "hi",
      tools: [{ type: "tool_search" }],
    })
    expect(result.body.tools).toBeUndefined()
  })

  test("maps text, instructions, generation and metadata without mutating input", () => {
    const input = {
      model: "client-alias",
      instructions: "top",
      store: false,
      stream: false,
      input: [
        { role: "developer", content: "rules" },
        { role: "user", content: "a\n世" },
      ],
      max_output_tokens: 123,
      reasoning: { effort: "high", summary: "auto" },
      prompt_cache_key: "cache-1",
      tools: [functionTool],
      tool_choice: "required",
    }
    const before = structuredClone(input)
    const converted = request(input, {
      upstreamModel: "gemini",
      metadata: { "session-id": "session-1" },
    })
    expect(converted.body).toEqual({
      model: "gemini",
      store: false,
      stream: false,
      system_instruction: "top\n\nrules",
      input: [
        { type: "user_input", content: [{ type: "text", text: "a\n世" }] },
      ],
      tools: [functionTool],
      generation_config: {
        max_output_tokens: 123,
        thinking_level: "high",
        thinking_summaries: "auto",
        tool_choice: "any",
      },
    })
    expect(converted.metadata).toEqual({
      "session-id": "session-1",
      prompt_cache_key: "cache-1",
    })
    expect(input).toEqual(before)
    converted.body.tools = []
    expect(input).toEqual(before)
  })

  test("preserves explicit parent and store independently without adding history", () => {
    const result = request({
      model: "g",
      input: "new",
      store: false,
      previous_response_id: "v1_parent",
    })
    expect(result.body.previous_interaction_id).toBe("v1_parent")
    expect(result.body.input).toHaveLength(1)
    expect(result.body.store).toBe(false)
    const plain = request({ model: "g", input: "new" })
    expect(plain.body.store).toBe(true)
    expect(plain.body).not.toHaveProperty("previous_interaction_id")
  })

  test("maps function calls and results using only local call history", () => {
    const result = request({
      model: "g",
      input: [
        {
          type: "function_call",
          id: "item-1",
          call_id: "call-1",
          name: "weather",
          arguments: '{"city":"東京"}',
        },
        {
          type: "function_call_output",
          call_id: "call-1",
          output: "  sunny\n",
        },
      ],
    })
    expect(result.body.input).toEqual([
      {
        type: "function_call",
        id: "call-1",
        name: "weather",
        arguments: { city: "東京" },
      },
      {
        type: "function_result",
        call_id: "call-1",
        name: "weather",
        result: [{ type: "text", text: "  sunny\n" }],
      },
    ])
    expect(() =>
      request({
        model: "g",
        input: [
          { type: "function_call_output", call_id: "call-1", output: "x" },
        ],
      }),
    ).toThrow("requires call history")
  })

  test("wraps custom tools, preserving name and raw input", () => {
    const converted = request({
      model: "g",
      tools: [customTool],
      tool_choice: { type: "custom", name: "patch" },
      input: [
        {
          type: "custom_tool_call",
          call_id: "c",
          name: "patch",
          input: "*** patch\n",
        },
        { type: "custom_tool_call_output", call_id: "c", output: "ok" },
      ],
    })
    expect(converted.tools.get("patch")).toEqual({
      name: "patch",
      custom: true,
    })
    expect(converted.body.generation_config).toEqual({
      tool_choice: { allowed_tools: { mode: "any", tools: ["patch"] } },
    })
    expect(converted.body.tools).toEqual([
      {
        type: "function",
        name: "patch",
        parameters: {
          type: "object",
          properties: { input: { type: "string" } },
          required: ["input"],
          additionalProperties: false,
        },
      },
    ])
    expect(converted.body.input).toEqual([
      {
        type: "function_call",
        id: "c",
        name: "patch",
        arguments: { input: "*** patch\n" },
      },
      {
        type: "function_result",
        call_id: "c",
        name: "patch",
        result: [{ type: "text", text: "ok" }],
      },
    ])
  })

  test.each(["{", "[]", "null", "42"])(
    "rejects invalid arguments %s",
    (args) => {
      expect(() =>
        request({
          model: "g",
          input: [
            { type: "function_call", call_id: "c", name: "f", arguments: args },
          ],
        }),
      ).toThrow(InteractionsConversionError)
    },
  )

  test.each([
    { reasoning: { effort: "xhigh" } },
    { tools: [{ ...functionTool, strict: true }] },
    { tools: [{ ...customTool, format: { type: "grammar" } }] },
    {
      input: [
        { role: "user", content: [{ type: "input_image", image_url: "x" }] },
      ],
    },
    {
      input: [
        { role: "user", content: "x" },
        { role: "system", content: "late" },
      ],
    },
    { tools: [functionTool, functionTool] },
    {
      tools: [functionTool],
      tool_choice: { type: "function", name: "absent" },
    },
  ])("rejects unsupported semantics", (override) => {
    expect(() => request({ model: "g", input: "x", ...override })).toThrow(
      InteractionsConversionError,
    )
  })

  test("rejects conflicting cache metadata", () => {
    expect(() =>
      request(
        { model: "g", input: "x", prompt_cache_key: "a" },
        { metadata: { prompt_cache_key: "b" } },
      ),
    ).toThrow("Conflicting")
  })
})

describe("Codex CLI request fields", () => {
  test("accepts the metadata fields that have no Interactions counterpart", () => {
    const converted = request({
      model: "g",
      input: "x",
      parallel_tool_calls: true,
      client_metadata: { "x-codex-turn-metadata": "{}" },
    })
    expect(converted.body).not.toHaveProperty("parallel_tool_calls")
    expect(converted.body).not.toHaveProperty("client_metadata")
  })

  test("refuses an unenforceable parallel_tool_calls=false", () => {
    expect(() =>
      request({ model: "g", input: "x", parallel_tool_calls: false }),
    ).toThrow("no Interactions equivalent")
  })

  test("passes over request and item fields with no Interactions counterpart", () => {
    const converted = request({
      model: "g",
      input: [
        {
          type: "message",
          id: "m1",
          role: "user",
          content: "hi",
          status: "completed",
        },
        {
          type: "function_call",
          id: "i1",
          call_id: "c1",
          name: "weather",
          arguments: '{"city":"東京"}',
          status: "completed",
        },
        {
          type: "function_call_output",
          id: "i2",
          call_id: "c1",
          name: "weather",
          output: "sunny",
          status: "completed",
        },
      ],
      temperature: 0.5,
      top_p: 0.9,
      max_tool_calls: 3,
    })
    expect(converted.body.input).toEqual([
      { type: "user_input", content: [{ type: "text", text: "hi" }] },
      {
        type: "function_call",
        id: "c1",
        name: "weather",
        arguments: { city: "東京" },
      },
      {
        type: "function_result",
        call_id: "c1",
        name: "weather",
        result: [{ type: "text", text: "sunny" }],
      },
    ])
    expect(converted.body).not.toHaveProperty("temperature")
    expect(converted.body).not.toHaveProperty("top_p")
    expect(converted.body).not.toHaveProperty("max_tool_calls")
  })
})

describe("Interactions tool namespaces", () => {
  const namespaced = {
    type: "namespace",
    name: "mcp__demo",
    description: "Demo tools",
    tools: [
      {
        type: "function",
        name: "lookup",
        description: "Look something up",
        strict: false,
        parameters: { type: "object" },
      },
      { type: "custom", name: "patch", format: { type: "text" } },
    ],
  }

  test("flattens a namespace group into qualified upstream functions", () => {
    const converted = request({ model: "g", input: "x", tools: [namespaced] })
    expect(converted.body.tools).toEqual([
      {
        type: "function",
        name: "_9_mcp__demolookup",
        description: "Look something up",
        parameters: { type: "object" },
      },
      {
        type: "function",
        name: "_9_mcp__demopatch",
        parameters: {
          type: "object",
          properties: { input: { type: "string" } },
          required: ["input"],
          additionalProperties: false,
        },
      },
    ])
    expect([...converted.tools]).toEqual([
      [
        "_9_mcp__demolookup",
        { name: "lookup", namespace: "mcp__demo", custom: false },
      ],
      [
        "_9_mcp__demopatch",
        { name: "patch", namespace: "mcp__demo", custom: true },
      ],
    ])
  })

  test("resolves a chosen tool through its namespace", () => {
    const converted = request({
      model: "g",
      input: "x",
      tools: [namespaced],
      tool_choice: { type: "function", name: "lookup", namespace: "mcp__demo" },
    })
    expect(converted.body.generation_config).toEqual({
      tool_choice: {
        allowed_tools: { mode: "any", tools: ["_9_mcp__demolookup"] },
      },
    })
    expect(() =>
      request({
        model: "g",
        input: "x",
        tools: [namespaced],
        tool_choice: { type: "function", name: "lookup" },
      }),
    ).toThrow("Unknown chosen tool")
  })

  test("restores the namespace on returned calls", () => {
    const converted = request({ model: "g", input: "x", tools: [namespaced] })
    const called = response(
      reply([
        {
          type: "function_call",
          id: "fc_1",
          name: "_9_mcp__demolookup",
          arguments: { q: "x" },
        },
      ]),
      {
        requestedModel: "g",
        tools: converted.tools,
      },
    )
    expect(called.output).toEqual([
      {
        type: "function_call",
        id: "v1_original_0",
        call_id: "fc_1",
        name: "lookup",
        namespace: "mcp__demo",
        arguments: '{"q":"x"}',
        status: "completed",
      },
    ])
  })

  test("restores a namespaced custom tool as a custom call", () => {
    const converted = request({ model: "g", input: "x", tools: [namespaced] })
    const called = response(
      reply([
        {
          type: "function_call",
          id: "fc_2",
          name: "_9_mcp__demopatch",
          arguments: { input: "*** Begin Patch" },
        },
      ]),
      {
        requestedModel: "g",
        tools: converted.tools,
      },
    )
    expect(called.output).toEqual([
      {
        type: "custom_tool_call",
        id: "v1_original_0",
        call_id: "fc_2",
        name: "patch",
        namespace: "mcp__demo",
        input: "*** Begin Patch",
        status: "completed",
      },
    ])
  })

  test("replays namespaced calls and results under one upstream name", () => {
    const converted = request({
      model: "g",
      input: [
        {
          type: "function_call",
          id: "fc_1",
          call_id: "fc_1",
          name: "lookup",
          namespace: "mcp__demo",
          arguments: '{"q":"x"}',
        },
        {
          type: "function_call_output",
          call_id: "fc_1",
          name: "lookup",
          namespace: "mcp__demo",
          output: "sunny",
        },
      ],
      tools: [namespaced],
    })
    expect(converted.body.input).toEqual([
      {
        type: "function_call",
        id: "fc_1",
        name: "_9_mcp__demolookup",
        arguments: { q: "x" },
      },
      {
        type: "function_result",
        call_id: "fc_1",
        name: "_9_mcp__demolookup",
        result: [{ type: "text", text: "sunny" }],
      },
    ])
  })
})

describe("Interactions request tool results", () => {
  test("allows orphaned tool results only in parent-referenced continuation", () => {
    const input = [
      { type: "function_call_output", call_id: "call-1", output: "  sunny\n" },
    ]
    const continued = request({
      model: "g",
      input,
      previous_response_id: "v1_parent",
    })
    expect(continued.body.input).toEqual([
      {
        type: "function_result",
        call_id: "call-1",
        result: [{ type: "text", text: "  sunny\n" }],
      },
    ])
    expect(continued.body.previous_interaction_id).toBe("v1_parent")
    expect(input).toHaveLength(1)
    const named = request({
      model: "g",
      input: [{ ...input[0], name: "weather" }],
      previous_response_id: "v1_parent",
    })
    expect(named.body.input).toEqual([
      {
        type: "function_result",
        call_id: "call-1",
        name: "weather",
        result: [{ type: "text", text: "  sunny\n" }],
      },
    ])
  })

  test("keeps full-history name checks and rejects conflicting results", () => {
    expect(() =>
      request({
        model: "g",
        input: [
          {
            type: "function_call",
            call_id: "call-1",
            name: "weather",
            arguments: "{}",
          },
          {
            type: "function_call_output",
            call_id: "call-1",
            name: "other",
            output: "x",
          },
        ],
      }),
    ).toThrow("Conflicting tool result name")
    expect(() =>
      request({
        model: "g",
        input: [
          { type: "function_call_output", call_id: "call-1", output: "x" },
        ],
      }),
    ).toThrow("requires call history")
  })
})

describe("Interactions JSON responses", () => {
  test("maps the official usage example including thought tokens", () => {
    const before = structuredClone(official)
    const converted = response(official, { requestedModel: "client-alias" })
    expect(converted.id).toBe(official.id)
    expect(converted.model).toBe("client-alias")
    expect(converted.created_at).toBe(
      Math.floor(Date.parse(official.created) / 1000),
    )
    expect(converted.usage).toEqual({
      input_tokens: 7,
      output_tokens: 42,
      total_tokens: 49,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens_details: { reasoning_tokens: 22 },
    })
    expect(official).toEqual(before)
  })

  test("distinguishes missing counters from known zero", () => {
    expect(response(reply([])).usage).toBeNull()
    expect(
      response({ ...reply([]), usage: { total_cached_tokens: 0 } }).usage,
    ).toEqual({ input_tokens_details: { cached_tokens: 0 } })
    expect(
      response({ ...reply([]), usage: { total_output_tokens: 3 } }).usage,
    ).toEqual({})
    expect(
      response({
        ...reply([]),
        usage: {
          total_input_tokens: 4137,
          total_cached_tokens: 128,
          total_tokens: 5000,
        },
      }).usage,
    ).toEqual({
      input_tokens: 4137,
      input_tokens_details: { cached_tokens: 128 },
      total_tokens: 5000,
    })
  })

  test("converts tool IDs separately and restores custom input", () => {
    const converted = response(
      {
        ...reply([
          {
            type: "function_call",
            id: "c1",
            name: "weather",
            arguments: { city: "x" },
          },
          {
            type: "function_call",
            id: "c2",
            name: "patch",
            arguments: { input: "raw\n" },
          },
        ]),
        status: "requires_action",
      },
      {
        tools: new Map([
          ["weather", { name: "weather", custom: false }],
          ["patch", { name: "patch", custom: true }],
        ]),
      },
    )
    expect(converted.status).toBe("completed")
    expect(converted.output).toEqual([
      {
        type: "function_call",
        id: "v1_original_0",
        call_id: "c1",
        name: "weather",
        arguments: '{"city":"x"}',
        status: "completed",
      },
      {
        type: "custom_tool_call",
        id: "v1_original_1",
        call_id: "c2",
        name: "patch",
        input: "raw\n",
        status: "completed",
      },
    ])
  })

  test("replays thought data and rejects foreign or malformed envelopes", () => {
    const thought = {
      type: "thought",
      signature: "opaque",
      summary: [{ type: "text", text: "checking" }],
    }
    const output = response(reply([thought])).output
    expect(request({ model: "g", input: output }).body.input).toEqual([thought])
    for (const encrypted of [
      "foreign",
      // Native OpenAI reasoning ciphertext is not a Gemini thought signature.
      "gAAAAABm0F7mV3J9c2lnbmF0dXJl",
      "agdata1.bad+",
      `agdata1.${Buffer.from(JSON.stringify({ type: "message" })).toString("base64url")}`,
    ]) {
      expect(() =>
        request({
          model: "g",
          input: [{ type: "reasoning", encrypted_content: encrypted }],
        }),
      ).toThrow(InteractionsConversionError)
    }
  })

  test("accepts a Codex reasoning echo that adds a null content field", () => {
    const thought = {
      type: "thought",
      signature: "opaque",
      summary: [{ type: "text", text: "checking" }],
    }
    const item = (
      response(reply([thought])).output as Array<Record<string, unknown>>
    )[0]
    expect(
      request({ model: "g", input: [{ ...item, content: null }] }).body.input,
    ).toEqual([thought])
  })

  test("rejects unknown output instead of silently dropping it", () => {
    expect(() => response(reply([{ type: "image" }]))).toThrow(
      "Unsupported response step",
    )
  })

  test("does not echo input history and preserves error terminal", () => {
    const converted = response({
      ...reply([{ type: "user_input", content: [] }]),
      status: "failed",
      error: { code: "quota", message: "No quota" },
    })
    expect(converted.output).toEqual([])
    expect(converted.status).toBe("failed")
    expect(converted.error).toEqual({ code: "quota", message: "No quota" })
  })

  test("accepts the live v1 shape that omits id and adds a thought step", () => {
    const converted = response(
      {
        object: "interaction",
        model: "gemini-3.8-flash",
        status: "completed",
        steps: [
          { type: "thought", signature: "signed-thought" },
          { type: "model_output", content: [{ type: "text", text: "Pong." }] },
        ],
        usage: {
          total_input_tokens: 15,
          total_output_tokens: 2,
          total_thought_tokens: 164,
          total_cached_tokens: 0,
          total_tokens: 181,
        },
      },
      { requestedModel: "client-alias" },
    )
    expect(converted.id).toBe("")
    expect(converted.status).toBe("completed")
    expect(converted.model).toBe("client-alias")
    const output = converted.output as Array<JsonObject>
    expect(output.map((item) => item.type)).toEqual(["reasoning", "message"])
    expect(converted.usage).toEqual({
      input_tokens: 15,
      output_tokens: 166,
      total_tokens: 181,
      output_tokens_details: { reasoning_tokens: 164 },
      input_tokens_details: { cached_tokens: 0 },
    })
  })

  test("maps v1 errors arrays and defaults unusable diagnostics", () => {
    const v1 = response({
      ...reply([]),
      status: "failed",
      errors: [
        {
          code: "type.googleapis.com/google.rpc.QuotaFailure",
          message: "quota exhausted",
        },
        { code: "second", message: "ignored" },
      ],
    })
    expect(v1.error).toEqual({
      code: "type.googleapis.com/google.rpc.QuotaFailure",
      message: "quota exhausted",
    })
    expect(
      response({ ...reply([]), status: "failed", errors: [] }).error,
    ).toEqual({ code: "upstream_error", message: "Interaction failed" })
    expect(
      response({
        ...reply([]),
        status: "failed",
        errors: [null, "ignored", { message: "only message" }],
      }).error,
    ).toEqual({ code: "upstream_error", message: "only message" })
  })
})

describe("Interactions model turn ordering", () => {
  test("leads a model turn with its thought block before calls and results", () => {
    const [reasoning] = response(
      reply([{ type: "thought", signature: "s", summary: [] }]),
    ).output as Array<Record<string, unknown>>
    const converted = request({
      model: "g",
      input: [
        { type: "message", role: "user", content: "hi" },
        {
          type: "function_call",
          call_id: "call-1",
          name: "weather",
          arguments: "{}",
        },
        reasoning,
        { type: "function_call_output", call_id: "call-1", output: "sunny" },
      ],
    })
    const steps = converted.body.input as Array<Record<string, unknown>>
    expect(steps.map((step) => step.type)).toEqual([
      "user_input",
      "thought",
      "function_call",
      "function_result",
    ])
  })
})
