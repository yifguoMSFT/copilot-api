import { describe, expect, test } from "bun:test"

import { normalizeResponsesItemIds } from "../src/routes/responses/sse-item-id-normalizer"

const encoder = new TextEncoder()

const stream = (text: string): ReadableStream<Uint8Array> =>
  new ReadableStream({
    start(controller) {
      for (const byte of encoder.encode(text))
        controller.enqueue(Uint8Array.of(byte))
      controller.close()
    },
  })

describe("Responses item-ID normalizer", () => {
  test("uses the first item ID for the complete lifecycle", async () => {
    const input = [
      '{"type":"response.output_item.added","output_index":0,"item":{"id":"first"}}',
      '{"type":"response.content_part.added","output_index":0,"item_id":"second"}',
      '{"type":"response.output_text.delta","output_index":0,"item_id":"third","delta":"OK"}',
      '{"type":"response.output_text.done","output_index":0,"item_id":"fourth","text":"OK"}',
      '{"type":"response.content_part.done","output_index":0,"item_id":"fifth"}',
      '{"type":"response.output_item.done","output_index":0,"item":{"id":"sixth"}}',
      '{"type":"response.completed","response":{"output":[{"id":"seventh"}]}}',
    ]
      .map((data) => `data: ${data}\n\n`)
      .join("")

    const output = await new Response(
      normalizeResponsesItemIds(stream(input)),
    ).text()

    expect(output.match(/first/g)).toHaveLength(7)
    expect(output).toContain('"delta":"OK"')
    expect(output).not.toContain("second")
    expect(output).not.toContain("seventh")
  })

  test("keeps output indices independent", async () => {
    const input =
      'data: {"type":"response.output_item.added","output_index":0,"item":{"id":"zero"}}\n\ndata: {"type":"response.output_item.added","output_index":1,"item":{"id":"one"}}\n\ndata: {"type":"response.output_item.done","output_index":0,"item":{"id":"zero-done"}}\n\ndata: {"type":"response.output_item.done","output_index":1,"item":{"id":"one-done"}}\n\n'

    const output = await new Response(
      normalizeResponsesItemIds(stream(input)),
    ).text()

    expect(output.match(/"id":"zero"/g)).toHaveLength(2)
    expect(output.match(/"id":"one"/g)).toHaveLength(2)
  })

  test("passes unknown and malformed events through", async () => {
    const input =
      'event: future\r\ndata: {"type":"future","item_id":"unchanged"}\r\n\r\ndata: not-json\n\n'

    const output = await new Response(
      normalizeResponsesItemIds(stream(input)),
    ).text()

    expect(output).toBe(input)
  })
})
