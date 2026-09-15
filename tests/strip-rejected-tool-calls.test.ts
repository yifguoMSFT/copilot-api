import { describe, expect, test } from "bun:test"

import { stripRejectedToolCalls } from "~/routes/responses/strip-rejected-tool-calls"

const call = (
  name: string,
  callId: string,
  extra: Record<string, unknown> = {},
) => ({
  type: "function_call",
  id: `fc_${callId}`,
  name,
  arguments: "{}",
  call_id: callId,
  ...extra,
})

const output = (callId: string, text: string) => ({
  type: "function_call_output",
  id: `fco_${callId}`,
  call_id: callId,
  output: text,
})

describe("stripRejectedToolCalls", () => {
  test("drops the rejected pair and keeps every other item", () => {
    const input = [
      { type: "message", role: "user", content: "go" },
      call("mcp__kanban_execution::kanban_update", "c1"),
      output("c1", "unsupported call: mcp__kanban_execution::kanban_update"),
      call("kanban_update", "c2", { namespace: "mcp__kanban_execution" }),
      output("c2", 'Wall time: 4s\nOutput:\n{"result":"ok"}'),
    ]

    const result = stripRejectedToolCalls(input)

    expect(result.changed).toBe(true)
    expect(result.removed).toEqual([
      { callId: "c1", name: "mcp__kanban_execution::kanban_update" },
    ])
    expect(result.input).toEqual([input[0], input[3], input[4]])
  })

  test("drops a call the client rejected even when its name is legal", () => {
    const input = [
      call("mcp__codex_app__open_in_codex", "c1"),
      output("c1", "unsupported call: mcp__codex_app__open_in_codex"),
    ]

    expect(stripRejectedToolCalls(input).changed).toBe(true)
    expect(stripRejectedToolCalls(input).input).toEqual([])
  })

  test("drops a custom tool call rejected through a custom_tool_call_output", () => {
    const input = [
      {
        type: "custom_tool_call",
        id: "ctc_1",
        name: "apply_patch",
        input: "{}",
        call_id: "c1",
      },
      {
        type: "custom_tool_call_output",
        id: "ctco_1",
        call_id: "c1",
        output: "unsupported call: apply_patch",
      },
    ]

    const result = stripRejectedToolCalls(input)
    expect(result.changed).toBe(true)
    expect(result.input).toEqual([])
  })

  test("keeps a rejected-looking output that is not an exact rejection string", () => {
    const input = [
      call("exec_command", "c1"),
      output("c1", "unsupported call: exec_command\nTraceback follows"),
      call("exec_command", "c2"),
      output("c2", "Error: unsupported call: exec_command"),
      call("exec_command", "c3"),
      output("c3", "unsupported call: some_other_tool"),
      call("exec_command", "c4"),
      output("c4", "unsupported call: "),
    ]

    expect(stripRejectedToolCalls(input).changed).toBe(false)
  })

  test("keeps an ill-named call that was never answered with a rejection", () => {
    const input = [
      call("mcp__kanban_execution::kanban_update", "c1"),
      output("c1", "Wall time: 2s\nOutput:\nboom"),
      call("mcp__kanban_execution::kanban_update", "c2"),
    ]

    expect(stripRejectedToolCalls(input).changed).toBe(false)
  })

  test("keeps ambiguous or incomplete pairings", () => {
    const duplicateCalls = [
      call("exec_command", "c1"),
      call("exec_command", "c1"),
      output("c1", "unsupported call: exec_command"),
    ]
    const duplicateOutputs = [
      call("exec_command", "c1"),
      output("c1", "unsupported call: exec_command"),
      output("c1", "unsupported call: exec_command"),
    ]
    const orphanOutput = [output("c1", "unsupported call: exec_command")]
    const missingCallId = [
      { type: "function_call", name: "exec_command", arguments: "{}" },
      {
        type: "function_call_output",
        output: "unsupported call: exec_command",
      },
    ]
    const missingName = [
      { type: "function_call", call_id: "c1", arguments: "{}" },
      output("c1", "unsupported call: "),
    ]
    const outputBeforeCall = [
      output("c1", "unsupported call: exec_command"),
      call("exec_command", "c1"),
    ]
    const mismatchedTypes = [
      call("apply_patch", "c1"),
      {
        type: "custom_tool_call_output",
        id: "ctco_1",
        call_id: "c1",
        output: "unsupported call: apply_patch",
      },
    ]
    const structuredOutput = [
      call("exec_command", "c1"),
      {
        type: "function_call_output",
        id: "fco_1",
        call_id: "c1",
        output: [
          { type: "output_text", text: "unsupported call: exec_command" },
        ],
      },
    ]

    for (const input of [
      duplicateCalls,
      duplicateOutputs,
      orphanOutput,
      missingCallId,
      missingName,
      outputBeforeCall,
      mismatchedTypes,
      structuredOutput,
    ]) {
      const result = stripRejectedToolCalls(input as Array<unknown>)
      expect(result.changed).toBe(false)
      expect(result.input).toBe(input)
    }
  })

  test("removes only the rejected pair among parallel calls", () => {
    const input = [
      call("get_weather", "c1"),
      call("exec_command", "c2"),
      output("c1", "unsupported call: get_weather"),
      output("c2", '{"temperature":27}'),
      call("get_time", "c3"),
      output("c3", "unsupported call: get_time"),
    ]

    const result = stripRejectedToolCalls(input)
    expect(result.changed).toBe(true)
    expect(result.input).toEqual([input[1], input[3]])
  })

  test("accepts the namespaced rejection forms a flat name cannot express", () => {
    const namespaced = [
      call("kanban_update", "c1", { namespace: "mcp__kanban_execution" }),
      output("c1", "unsupported call: mcp__kanban_execution::kanban_update"),
    ]
    const flattened = [
      call("kanban_focus", "c2", { namespace: "mcp__kanban_execution" }),
      output("c2", "unsupported call: mcp__kanban_execution__kanban_focus"),
    ]
    const mismatchedNamespace = [
      call("kanban_update", "c3", { namespace: "mcp__kanban_execution" }),
      output("c3", "unsupported call: mcp__kanban_planning::kanban_update"),
    ]

    expect(stripRejectedToolCalls(namespaced).changed).toBe(true)
    expect(stripRejectedToolCalls(flattened).changed).toBe(true)
    expect(stripRejectedToolCalls(mismatchedNamespace).changed).toBe(false)
  })

  test("leaves the input array and its items untouched", () => {
    const input = [
      call("exec_command", "c1"),
      output("c1", "unsupported call: exec_command"),
    ]
    const snapshot = structuredClone(input)

    const result = stripRejectedToolCalls(input)

    expect(result.input).not.toBe(input)
    expect(input).toEqual(snapshot)
    expect(input).toHaveLength(2)
  })

  test("is a no-op on the already filtered history", () => {
    const input = [
      { type: "message", role: "user", content: "go" },
      output("c1", "unsupported call: exec_command"),
      call("exec_command", "c2"),
    ]

    const first = stripRejectedToolCalls(input)
    expect(first.changed).toBe(false)

    const second = stripRejectedToolCalls(first.input)
    expect(second.changed).toBe(false)
    expect(second.input).toBe(input)
  })

  test("handles malformed entries without throwing", () => {
    const input = [
      null,
      42,
      "text",
      [],
      { type: "function_call", call_id: 7, name: "exec_command" },
      { type: "function_call", call_id: "c1", name: "" },
    ]

    const result = stripRejectedToolCalls(input)
    expect(result.changed).toBe(false)
    expect(result.input).toBe(input)
  })
})
