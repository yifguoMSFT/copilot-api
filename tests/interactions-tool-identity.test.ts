import { describe, expect, test } from "bun:test"

import {
  convertInteractionsResponseToResponses as response,
  convertResponsesRequestToInteractions as request,
  qualifiedToolName,
  type ToolIdentity,
} from "../src/services/interactions/convert"
import cliRequest from "./fixtures/interactions/codex-cli-request.json"

const fn = (name: string) => ({
  type: "function",
  name,
  parameters: { type: "object" },
})
const custom = (name: string) => ({
  type: "custom",
  name,
  format: { type: "text" },
})
const group = (name: string, tools: Array<Record<string, unknown>>) => ({
  type: "namespace",
  name,
  tools,
})
const call = (name: string, callId: string, args: unknown = {}) => ({
  type: "function_call",
  id: callId,
  name,
  arguments: args,
})
const reply = (steps: Array<Record<string, unknown>>) => ({
  id: "v1_tools",
  model: "gemini",
  status: "completed",
  steps,
})

describe("Interactions tool identity", () => {
  test("keeps separator, plain and namespace names apart", () => {
    const separated = qualifiedToolName("a__b", "c")
    const plain = qualifiedToolName("a", "b__c")
    const converted = request({
      model: "g",
      input: "x",
      tools: [
        group("a__b", [fn("c"), custom("patch")]),
        group("a", [fn("b__c")]),
        fn("a__b__c"),
      ],
    })
    expect(separated).not.toBe(plain)
    expect(new Set([separated, plain, "a__b__c"]).size).toBe(3)
    expect(converted.tools.get(separated)).toEqual({
      name: "c",
      namespace: "a__b",
      custom: false,
    })
    expect(converted.tools.get(plain)).toEqual({
      name: "b__c",
      namespace: "a",
      custom: false,
    })
    expect(converted.tools.get("a__b__c")).toEqual({
      name: "a__b__c",
      custom: false,
    })
    const output = response(
      reply([
        call(separated, "c1", { x: 1 }),
        call(plain, "c2"),
        call("a__b__c", "c3"),
        call(qualifiedToolName("a__b", "patch"), "c4", { input: "raw" }),
      ]),
      { tools: converted.tools },
    ).output as Array<Record<string, unknown>>
    expect(
      output.map((item) => [
        item.call_id,
        item.type,
        item.name,
        item.namespace,
      ]),
    ).toEqual([
      ["c1", "function_call", "c", "a__b"],
      ["c2", "function_call", "b__c", "a"],
      ["c3", "function_call", "a__b__c", undefined],
      ["c4", "custom_tool_call", "patch", "a__b"],
    ])
  })

  test("refuses calls the current request did not declare", () => {
    const converted = request({
      model: "g",
      input: "x",
      tools: [group("a__b", [fn("c")])],
    })
    // A plain tool that spells out the encoded pair is a different tool.
    expect(converted.tools.has("a__b__c")).toBe(false)
    expect(() =>
      response(reply([call("a__b__c", "c1")]), { tools: converted.tools }),
    ).toThrow("Tool call a__b__c is not in the declared tools")
    // A parent-referenced continuation may legitimately omit tools; the name
    // alone then cannot say whether the call was custom or namespaced.
    const continuation = request({
      model: "g",
      input: [{ type: "function_call_output", call_id: "c1", output: "sunny" }],
      previous_response_id: "v1_parent",
    })
    expect(continuation.tools.size).toBe(0)
    expect(() =>
      response(reply([call("weather", "c1")]), {
        tools: continuation.tools,
      }),
    ).toThrow("Tool call weather is not in the declared tools")
    expect(() => response(reply([call("weather", "c1")]))).toThrow(
      "Tool call weather is not in the declared tools",
    )
    expect(() =>
      request({
        model: "g",
        input: "x",
        tools: [group("a__b", [fn("c")]), fn(qualifiedToolName("a__b", "c"))],
      }),
    ).toThrow("Duplicate tool name")
  })

  test("rebuilds the same context for a response after a restart", () => {
    const first = request(structuredClone(cliRequest))
    const restarted = request(structuredClone(cliRequest))
    expect(restarted.tools.size).toBe(first.tools.size)
    expect([...restarted.tools]).toEqual([...first.tools])
    const entry = [...first.tools].find(
      ([, identity]) => identity.namespace !== undefined,
    )
    const [upstream, identity] = entry as [string, ToolIdentity]
    const output = response(reply([call(upstream, "call_1", { q: 1 })]), {
      tools: restarted.tools,
    }).output as Array<Record<string, unknown>>
    expect(output[0]).toMatchObject({
      name: identity.name,
      namespace: identity.namespace,
      call_id: "call_1",
    })
  })

  test("carries arguments as JSON values in both directions", () => {
    const args = { nested: { b: [1, { c: "x" }], a: null }, n: 2 }
    const converted = request({
      model: "g",
      input: [
        {
          type: "function_call",
          call_id: "c1",
          name: "weather",
          arguments: JSON.stringify(args),
        },
        { type: "function_call_output", call_id: "c1", output: "ok" },
      ],
      tools: [fn("weather"), custom("patch")],
    })
    const step = (converted.body.input as Array<Record<string, unknown>>)[0]
    expect(step.arguments).toEqual(args)
    const sorted = response(
      reply([
        { ...call("weather", "c1", args) },
        call("patch", "c2", { input: "raw\n" }),
      ]),
      { tools: converted.tools },
    ).output as Array<Record<string, unknown>>
    expect(JSON.parse(String(sorted[0].arguments))).toEqual(args)
    expect(sorted[1]).toMatchObject({
      type: "custom_tool_call",
      input: "raw\n",
    })
    expect(request({ model: "g", input: sorted }).body.input).toEqual([
      expect.objectContaining({
        type: "function_call",
        name: "weather",
        arguments: args,
      }),
      expect.objectContaining({
        type: "function_call",
        name: "patch",
        arguments: { input: "raw\n" },
      }),
    ])
  })
})
