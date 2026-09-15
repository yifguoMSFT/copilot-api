import { describe, expect, it } from "bun:test"
import { createGenerateContentEventStream } from "~/services/generate-content/stream"
import { convertInteractionStep } from "~/services/interactions/convert"

describe("Responses item IDs protocol compatibility reproduction", () => {
  it("reproduces un-prefixed IDs in GenerateContent SSE converter", () => {
    const sse = [
      `data: ${JSON.stringify({
        responseId: "11KmaujSL-ON1e8P2rKtmQk",
        candidates: [
          {
            content: {
              role: "model",
              parts: [
                {
                  functionCall: {
                    name: "exec_command",
                    args: { cmd: "echo 1" },
                  },
                },
              ],
            },
            finishReason: "STOP",
          },
        ],
      })}\n\n`,
    ].join("")

    const stream = createGenerateContentEventStream({
      tools: new Map([["exec_command", { name: "exec_command", custom: false }]]),
    })

    const raw = stream.push(new TextEncoder().encode(sse))
    const events: Array<Record<string, unknown>> = []
    for (const frame of raw.split("\n\n")) {
      for (const line of frame.split("\n")) {
        if (line.startsWith("data: ")) {
          events.push(JSON.parse(line.slice(6)))
        }
      }
    }

    const added = events.find((e) => e.type === "response.output_item.added")
    const item = added?.item as Record<string, unknown> | undefined

    // In current unpatched code, this will fail because item.id is "11KmaujSL-ON1e8P2rKtmQk_0"
    expect(item?.type).toBe("function_call")
    expect(item?.id).toMatch(/^fc_/)
  })

  it("reproduces un-prefixed IDs in Interactions convertStep", () => {
    const step = {
      type: "function_call",
      id: "call_123",
      name: "test_tool",
      arguments: {},
    }
    const converted = convertInteractionStep(step, 0, {
      itemIdScope: "11KmaujSL-ON1e8P2rKtmQk",
      tools: new Map([["test_tool", { name: "test_tool", custom: false }]]),
    })

    // Expected by OpenAI Responses: begins with "fc_"
    expect(converted?.type).toBe("function_call")
    expect(converted?.id).toMatch(/^fc_/)
  })
})