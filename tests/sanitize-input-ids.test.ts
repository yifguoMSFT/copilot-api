import { describe, expect, it } from "bun:test"
import { sanitizeInputItemIds } from "~/routes/responses/sanitize-input-ids"

describe("sanitizeInputItemIds", () => {
  it("normalizes un-prefixed function_call ID like in session 01a099c1-ca10-79b0-9f51-9b30b6b10c16", () => {
    const input = [
      {
        id: "11KmaujSL-ON1e8P2rKtmQk_0",
        type: "function_call",
        call_id: "call_11KmaujSL-ON1e8P2rKtmQk_1",
        name: "exec_command",
        arguments: "{}",
      },
      {
        type: "function_call_output",
        call_id: "call_11KmaujSL-ON1e8P2rKtmQk_1",
        output: "ok",
      },
    ]

    const result = sanitizeInputItemIds(input)
    expect(result.changed).toBe(true)
    expect(result.renamedCount).toBe(1)
    const [fc, fco] = result.input as Array<Record<string, unknown>>
    expect(fc.id).toBe("fc_11KmaujSL-ON1e8P2rKtmQk_0")
    expect(fc.call_id).toBe("call_11KmaujSL-ON1e8P2rKtmQk_1")
    expect(fco.call_id).toBe("call_11KmaujSL-ON1e8P2rKtmQk_1")
  })

  it("normalizes message, reasoning, and custom_tool_call IDs", () => {
    const input = [
      { id: "raw_msg", type: "message", role: "user", content: "hi" },
      { id: "raw_rs", type: "reasoning", encrypted_content: "agdata1.xyz" },
      { id: "raw_ctc", type: "custom_tool_call", name: "tool", input: "x" },
    ]
    const result = sanitizeInputItemIds(input)
    expect(result.changed).toBe(true)
    const [msg, rs, ctc] = result.input as Array<Record<string, unknown>>
    expect(msg.id).toBe("msg_raw_msg")
    expect(rs.id).toBe("rs_raw_rs")
    expect(ctc.id).toBe("ctc_raw_ctc")
  })

  it("is idempotent and leaves compliant IDs unchanged", () => {
    const input = [
      { id: "fc_123", type: "function_call" },
      { id: "msg_456", type: "message" },
      { id: "rs_789", type: "reasoning" },
      { id: "ctc_abc", type: "custom_tool_call" },
      { id: "ctco_def", type: "custom_tool_call_output" },
    ]
    const result = sanitizeInputItemIds(input)
    expect(result.changed).toBe(false)
    expect(result.input).toBe(input)

    // Second run
    const second = sanitizeInputItemIds(result.input)
    expect(second.changed).toBe(false)
  })

  it("handles non-array or missing id safely", () => {
    expect(sanitizeInputItemIds("string input").changed).toBe(false)
    expect(sanitizeInputItemIds(null).changed).toBe(false)
    expect(sanitizeInputItemIds([{ type: "unknown_type", id: "123" }]).changed).toBe(false)
    expect(sanitizeInputItemIds([{ type: "message" }]).changed).toBe(false)
  })

  it("resolves collisions deterministically", () => {
    const input = [
      { id: "fc_foo", type: "function_call" },
      { id: "foo", type: "function_call" },
    ]
    const result = sanitizeInputItemIds(input)
    expect(result.changed).toBe(true)
    const [first, second] = result.input as Array<Record<string, unknown>>
    expect(first.id).toBe("fc_foo")
    expect(second.id).toMatch(/^fc_foo_[a-f0-9]{8}$/)
  })

  it("updates matching item_reference items", () => {
    const input = [
      { id: "raw_1", type: "message" },
      { id: "raw_1", type: "item_reference" },
    ]
    const result = sanitizeInputItemIds(input)
    expect(result.changed).toBe(true)
    const [msg, ref] = result.input as Array<Record<string, unknown>>
    expect(msg.id).toBe("msg_raw_1")
    expect(ref.id).toBe("msg_raw_1")
  })
})
