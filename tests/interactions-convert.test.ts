import { describe, expect, test } from "bun:test"

import {
  convertInteractionsResponseToResponses as response,
  convertResponsesRequestToInteractions as request,
  InteractionsConversionError,
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
    expect(converted.customTools.has("patch")).toBe(true)
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
    { temperature: 0.5 },
    { parallel_tool_calls: true },
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
      { customTools: new Set(["patch"]) },
    )
    expect(converted.status).toBe("completed")
    expect(converted.output).toEqual([
      {
        type: "function_call",
        id: "step_0",
        call_id: "c1",
        name: "weather",
        arguments: '{"city":"x"}',
        status: "completed",
      },
      {
        type: "custom_tool_call",
        id: "step_1",
        call_id: "c2",
        name: "patch",
        input: "raw\n",
        status: "completed",
      },
    ])
  })

  test("replays thought data and rejects foreign or injected envelopes", () => {
    const thought = {
      type: "thought",
      signature: "opaque",
      summary: [{ type: "text", text: "checking" }],
    }
    const output = response(reply([thought])).output
    expect(request({ model: "g", input: output }).body.input).toEqual([thought])
    for (const encrypted of [
      "foreign",
      "agdata1.bad+",
      `agdata1.${Buffer.from(JSON.stringify({ ...thought, apiKey: "evil" })).toString("base64url")}`,
    ]) {
      expect(() =>
        request({
          model: "g",
          input: [{ type: "reasoning", encrypted_content: encrypted }],
        }),
      ).toThrow(InteractionsConversionError)
    }
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
})
