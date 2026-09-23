import { describe, expect, test } from "bun:test"

import { normalizeFunctionSchemaRoots } from "../src/routes/responses/normalize-function-schema-roots"
import automationUpdateNamespace from "./fixtures/deepseek-schema/automation-update.tools.json"

type Json = Record<string, unknown>

const namespaceTool = automationUpdateNamespace as unknown as Json
const cloneNamespace = (): Json => structuredClone(namespaceTool)
const childrenOf = (tool: Json): Array<Json> => tool.tools as Array<Json>
const onlyChild = (tool: Json): Json => childrenOf(tool)[0]
const parametersOf = (tool: Json): Json => tool.parameters as Json

describe("normalizeFunctionSchemaRoots", () => {
  test("declares the object root of the real automation_update union schema", () => {
    const tool = cloneNamespace()
    const payload: Json = {
      model: "deepseek-v4.1-flash",
      previous_response_id: "previous-response",
      conversation: "conversation-id",
      reasoning: { effort: "high" },
      tools: [tool],
    }
    const untouched = structuredClone(payload)
    const sourceParameters = parametersOf(onlyChild(tool))

    const result = normalizeFunctionSchemaRoots(payload)

    expect(result.changed).toBe(true)
    expect(result.normalizedCount).toBe(1)

    const forwarded = onlyChild((result.payload.tools as Array<Json>)[0])
    const { type, ...rest } = parametersOf(forwarded)
    expect(type).toBe("object")
    // Only the declared root type is added; the union and its references stay.
    expect(rest).toEqual(sourceParameters)
    expect(rest.oneOf).toHaveLength(4)
    expect(Object.keys(rest.$defs as Json)).toHaveLength(25)
    expect(forwarded.strict).toBe(false)
    expect(forwarded.defer_loading).toBe(true)

    // The caller's payload and the fixture itself are never mutated.
    expect(payload).toEqual(untouched)
    expect(JSON.stringify(payload)).toBe(JSON.stringify(untouched))
    expect(parametersOf(onlyChild(tool))).toEqual(sourceParameters)
  })

  test("preserves unrelated request fields", () => {
    const payload: Json = {
      model: "deepseek-v4.1-flash",
      input: [{ type: "message", role: "user", content: "hi" }],
      tools: [cloneNamespace()],
    }

    const result = normalizeFunctionSchemaRoots(payload)

    expect(result.payload.model).toBe("deepseek-v4.1-flash")
    expect(result.payload.previous_response_id).toBeUndefined()
    expect(result.payload.input).toEqual(payload.input)
  })

  test("leaves schemas that already declare any root type alone", () => {
    const payload: Json = {
      tools: [
        {
          type: "function",
          name: "declared",
          parameters: { type: "object", properties: {} },
        },
        { type: "function", name: "null_type", parameters: { type: null } },
        {
          type: "function",
          name: "string_type",
          parameters: { type: "string", oneOf: [{ type: "string" }] },
        },
      ],
    }

    const result = normalizeFunctionSchemaRoots(payload)

    expect(result.changed).toBe(false)
    expect(result.normalizedCount).toBe(0)
    expect(result.payload).toBe(payload)
  })

  test("leaves unusable parameter shapes for Upstream to reject", () => {
    const payload: Json = {
      tools: [
        { type: "function", name: "missing" },
        { type: "function", name: "null", parameters: null },
        { type: "function", name: "boolean", parameters: true },
        { type: "function", name: "string", parameters: "object" },
        { type: "function", name: "array", parameters: [{ type: "object" }] },
      ],
    }

    const result = normalizeFunctionSchemaRoots(payload)

    expect(result.changed).toBe(false)
    expect(result.payload).toBe(payload)
  })

  test("normalizes namespace children and mid-conversation declarations", () => {
    const payload: Json = {
      input: [
        { type: "message", role: "user", content: "search" },
        {
          type: "tool_search_output",
          call_id: "call_search",
          execution: "client",
          tools: [cloneNamespace()],
        },
        {
          type: "additional_tools",
          tools: [
            {
              type: "namespace",
              name: "codex_app",
              tools: [
                {
                  type: "function",
                  name: "list_projects",
                  parameters: { oneOf: [{ type: "object" }] },
                },
              ],
            },
          ],
        },
      ],
    }
    const untouched = structuredClone(payload)

    const result = normalizeFunctionSchemaRoots(payload)

    expect(result.changed).toBe(true)
    expect(result.normalizedCount).toBe(2)

    const input = result.payload.input as Array<Json>
    expect(parametersOf(onlyChild(childrenOf(input[1])[0])).type).toBe("object")
    const added = childrenOf(input[2])[0]
    expect(parametersOf(onlyChild(added)).type).toBe("object")
    expect(input[0]).toEqual((untouched.input as Array<Json>)[0])
    expect(input[1].call_id).toBe("call_search")
    expect(input[1].execution).toBe("client")
    expect(input[2].type).toBe("additional_tools")
  })

  test("normalizes every copy of a repeated declaration", () => {
    const payload: Json = {
      tools: [cloneNamespace(), cloneNamespace()],
      input: [
        { type: "tool_search_output", call_id: "c", tools: [cloneNamespace()] },
      ],
    }

    const result = normalizeFunctionSchemaRoots(payload)

    expect(result.normalizedCount).toBe(3)
    const tools = result.payload.tools as Array<Json>
    expect(parametersOf(onlyChild(tools[0])).type).toBe("object")
    expect(parametersOf(onlyChild(tools[1])).type).toBe("object")
    const input = result.payload.input as Array<Json>
    expect(parametersOf(onlyChild(childrenOf(input[0])[0])).type).toBe("object")
  })

  test("is idempotent and reuses the payload when nothing changes", () => {
    const payload: Json = { tools: [cloneNamespace()] }

    const first = normalizeFunctionSchemaRoots(payload)
    const second = normalizeFunctionSchemaRoots(first.payload)

    expect(first.changed).toBe(true)
    expect(second.changed).toBe(false)
    expect(second.normalizedCount).toBe(0)
    expect(second.payload).toBe(first.payload)
  })

  test("ignores non-tool data that merely resembles a schema", () => {
    const payload: Json = {
      tools: [
        { type: "web_search" },
        { type: "namespace", name: "empty" },
        { type: "function", name: "tool", parameters: { type: "object" } },
      ],
      input: [
        {
          type: "function_call",
          name: "noop",
          arguments: JSON.stringify({
            parameters: { oneOf: [] },
            tools: [{ type: "function" }],
          }),
        },
        {
          type: "function_call_output",
          output: '{"parameters":{"oneOf":[]}}',
        },
        { type: "message", role: "assistant", content: "parameters" },
      ],
    }

    const result = normalizeFunctionSchemaRoots(payload)

    expect(result.changed).toBe(false)
    expect(result.payload).toBe(payload)
  })
})
