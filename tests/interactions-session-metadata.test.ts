import { describe, expect, test } from "bun:test"

import {
  convertInteractionsResponseToResponses as response,
  convertResponsesRequestToInteractions as request,
  type JsonObject,
} from "../src/services/interactions/convert"

const payload = (overrides: JsonObject = {}) => ({
  model: "client-alias",
  input: "hello",
  prompt_cache_key: "cache-1",
  client_metadata: {
    "x-codex-turn-metadata": { turn: "t1", nested: [1, 2] },
  },
  ...overrides,
})

const cached = (usage: unknown) =>
  response({
    id: "v1_cache",
    model: "gemini",
    status: "completed",
    steps: [],
    usage,
  }).usage as JsonObject

describe("Interactions session metadata", () => {
  test("keeps caller context out of the upstream body", () => {
    const converted = request(payload(), {
      upstreamModel: "gemini",
      metadata: { "session-id": "session-1" },
    })
    expect(converted.metadata).toEqual({
      "session-id": "session-1",
      prompt_cache_key: "cache-1",
      client_metadata: {
        "x-codex-turn-metadata": { turn: "t1", nested: [1, 2] },
      },
    })
    expect(converted.body).toEqual({
      model: "gemini",
      input: [
        { type: "user_input", content: [{ type: "text", text: "hello" }] },
      ],
      store: true,
    })
    const wire = JSON.stringify(converted.body)
    for (const value of ["cache-1", "session-1", "x-codex-turn-metadata"])
      expect(wire).not.toContain(value)
  })

  test("copies the payload metadata instead of aliasing it", () => {
    const input = payload()
    const before = structuredClone(input)
    const converted = request(input)
    const client = converted.metadata.client_metadata as JsonObject
    const turn = client["x-codex-turn-metadata"] as JsonObject
    turn.turn = "mutated"
    ;(turn.nested as Array<number>).push(3)
    expect(input).toEqual(before)
  })

  test("keeps interleaved requests and repeated conversions independent", () => {
    const a = request(payload({ client_metadata: { turn: "a" } }), {
      metadata: { "session-id": "s-a" },
    })
    const b = request(
      payload({ input: "other", client_metadata: { turn: "b" } }),
      { metadata: { "session-id": "s-b" } },
    )
    expect(a.metadata).toEqual({
      "session-id": "s-a",
      prompt_cache_key: "cache-1",
      client_metadata: { turn: "a" },
    })
    expect(b.metadata).toEqual({
      "session-id": "s-b",
      prompt_cache_key: "cache-1",
      client_metadata: { turn: "b" },
    })
    const again = request(payload({ client_metadata: { turn: "a" } }), {
      metadata: { "session-id": "s-a" },
    })
    expect(again.body).toEqual(a.body)
    expect(again.metadata).toEqual(a.metadata)
    expect(again.metadata).not.toBe(a.metadata)
    expect(again.metadata.client_metadata).not.toBe(a.metadata.client_metadata)
  })

  test("maps cache counters from the raw upstream values", () => {
    expect(
      cached({ total_cached_tokens: 128, total_input_tokens: 900 }),
    ).toEqual({
      input_tokens: 900,
      input_tokens_details: { cached_tokens: 128 },
    })
    expect(cached({ total_cached_tokens: 0, total_input_tokens: 5 })).toEqual({
      input_tokens: 5,
      input_tokens_details: { cached_tokens: 0 },
    })
    expect(cached({ total_input_tokens: 5 })).toEqual({ input_tokens: 5 })
    expect(cached(undefined)).toBeNull()
  })
})
