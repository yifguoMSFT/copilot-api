import { describe, expect, test } from "bun:test"

import {
  convertInteractionsResponseToResponses as response,
  convertResponsesRequestToInteractions as request,
} from "../src/services/interactions/convert"

describe("Interactions reference continuation", () => {
  test("rejects a persistent conversation instead of dropping its context", () => {
    for (const conversation of ["conv_1", { id: "conv_1" }]) {
      expect(() => request({ model: "g", input: "x", conversation })).toThrow(
        "conversation has no Interactions equivalent",
      )
    }
    expect(
      request({ model: "g", input: "x", conversation: null }).body,
    ).not.toHaveProperty("conversation")
  })

  test("carries a real parent id and only the new instructions", () => {
    const plain = request({
      model: "g",
      input: "next",
      store: false,
      previous_response_id: "v1_parent",
    })
    expect(plain.body.previous_interaction_id).toBe("v1_parent")
    expect(plain.body.store).toBe(false)
    expect(plain.body).not.toHaveProperty("system_instruction")
    const redirected = request({
      model: "g",
      input: "next",
      instructions: "new rules",
      previous_response_id: "v1_parent",
    })
    expect(redirected.body.previous_interaction_id).toBe("v1_parent")
    expect(redirected.body.system_instruction).toBe("new rules")
  })

  test("refuses a blank parent id instead of querying an empty resource", () => {
    for (const id of ["", "   ", "\t"]) {
      expect(() =>
        request({ model: "g", input: "x", previous_response_id: id }),
      ).toThrow("previous_response_id must be a non-empty interaction id")
    }
  })

  test("reports items that need the OpenAI store as unsupported", () => {
    expect(() =>
      request({ model: "g", input: [{ type: "item_reference", id: "msg_1" }] }),
    ).toThrow("item_reference has no Interactions equivalent")
    expect(() =>
      request({
        model: "g",
        input: [
          { type: "compaction", id: "cmp_1", encrypted_content: "gAAAAAB" },
        ],
      }),
    ).toThrow("compaction has no Interactions equivalent")
  })

  test("falls back to full history when the response omits its id", () => {
    const converted = response(
      { model: "gemini", status: "completed", steps: [] },
      { requestedModel: "g" },
    )
    expect(converted.id).toBe("")
    expect(() =>
      request({
        model: "g",
        input: "next",
        previous_response_id: converted.id,
      }),
    ).toThrow("previous_response_id must be a non-empty interaction id")
    expect(request({ model: "g", input: "next" }).body).not.toHaveProperty(
      "previous_interaction_id",
    )
  })
})
