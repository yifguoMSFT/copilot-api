import { expect, test } from "bun:test"

import { stripReasoningContent } from "../src/routes/responses/gpt-reasoning-content"

const reasoningItem = (index: number, parts: number) => ({
  type: "reasoning",
  id: `reasoning-${index}`,
  summary: [],
  encrypted_content: `cipher-${index}`,
  content: Array.from({ length: parts }, (_, part) => ({
    type: "reasoning_text",
    text: `hidden-${index}-${part}`,
  })),
})

const messageItem = (index: number) => ({
  type: "message",
  role: "user",
  content: [{ type: "input_text", text: `message-${index}` }],
})

test("clears only the reported reasoning content at index 40", () => {
  const input: Array<unknown> = Array.from({ length: 41 }, (_, index) =>
    index === 40 ? reasoningItem(index, 1) : messageItem(index),
  )

  const result = stripReasoningContent(input)

  expect(result.changed).toBe(true)
  expect(result.indices).toEqual([40])
  expect(result.contentParts).toBe(1)
  expect(result.encryptedContent).toBe(1)
  expect((result.input[40] as Record<string, unknown>).content).toEqual([])
  expect((result.input[40] as Record<string, unknown>).id).toBe("reasoning-40")
  expect((result.input[40] as Record<string, unknown>).summary).toEqual([])
  expect(
    Object.hasOwn(
      result.input[40] as Record<string, unknown>,
      "encrypted_content",
    ),
  ).toBe(false)
  expect((result.input[0] as Record<string, unknown>).content).toEqual([
    { type: "input_text", text: "message-0" },
  ])
  expect(result.input[0]).toBe(input[0])
})

test("clears every matching reasoning item and counts all parts", () => {
  const input: Array<unknown> = [
    messageItem(0),
    reasoningItem(1, 2),
    reasoningItem(2, 3),
    messageItem(3),
  ]

  const result = stripReasoningContent(input)

  expect(result.changed).toBe(true)
  expect(result.indices).toEqual([1, 2])
  expect(result.contentParts).toBe(5)
  expect(result.encryptedContent).toBe(2)
  expect((result.input[3] as Record<string, unknown>).content).toEqual([
    { type: "input_text", text: "message-3" },
  ])
  expect(result.input).toHaveLength(4)
})

test.each([
  ["string item", ["plain" as unknown]],
  ["null item", [null as unknown]],
  ["array item", [[1, 2] as unknown]],
  ["nested array item", [[[1], reasoningItem(1, 1)] as unknown]],
  ["missing content", [{ type: "reasoning" } as unknown]],
  ["empty content", [{ type: "reasoning", content: [] } as unknown]],
  ["non-array content", [{ type: "reasoning", content: "text" } as unknown]],
  ["non-reasoning item", [messageItem(0)]],
])("leaves %s untouched", (_label, input: Array<unknown>) => {
  const result = stripReasoningContent(input)

  expect(result.changed).toBe(false)
  expect(result.indices).toEqual([])
  expect(result.contentParts).toBe(0)
  expect(result.encryptedContent).toBe(0)
  expect(result.input).toBe(input)
})

test.each([{}, { content: [] }])(
  "strips encrypted reasoning with missing or empty content: %j",
  (content) => {
    const item = {
      type: "reasoning",
      id: "reasoning-native",
      summary: [],
      encrypted_content: "cipher-native",
      ...content,
    }

    const result = stripReasoningContent([item])

    expect(result.changed).toBe(true)
    expect(result.encryptedContent).toBe(1)
    expect(result.input[0]).not.toHaveProperty("encrypted_content")
    expect(item.encrypted_content).toBe("cipher-native")
  },
)

test("counts zero encrypted payloads when the item has none", () => {
  const result = stripReasoningContent([
    {
      type: "reasoning",
      id: "reasoning-plain",
      content: [{ type: "reasoning_text", text: "hidden" }],
    },
  ])

  expect(result.changed).toBe(true)
  expect(result.contentParts).toBe(1)
  expect(result.encryptedContent).toBe(0)
})

test("does not mutate the input and is idempotent", () => {
  const item = reasoningItem(0, 1)
  const input: Array<unknown> = [item]

  const first = stripReasoningContent(input)
  expect(item.content).toHaveLength(1)
  expect(item.encrypted_content).toBe("cipher-0")
  expect(first.changed).toBe(true)

  const second = stripReasoningContent(first.input)
  expect(second.changed).toBe(false)
  expect(second.input).toBe(first.input)
})
