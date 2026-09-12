import { describe, expect, test } from "bun:test"

import {
  convertInteractionsResponseToResponses as response,
  convertResponsesRequestToInteractions as request,
  type JsonObject,
} from "../src/services/interactions/convert"
import cliRequest from "./fixtures/interactions/codex-cli-request.json"

describe("Codex CLI request contract", () => {
  test("converts a captured CLI request with its namespace tools", () => {
    const converted = request(cliRequest)
    const tools = converted.body.tools as Array<JsonObject>
    expect(tools).toHaveLength(33)
    expect(new Set(tools.map((tool) => tool.name)).size).toBe(33)
    expect(tools.every((tool) => tool.type === "function")).toBe(true)
    const steps = converted.body.input as Array<JsonObject>
    expect(steps).toHaveLength(2)
    expect(steps.map((step) => step.type)).toEqual(["user_input", "user_input"])
    expect(converted.body.system_instruction).toStartWith(
      "[synthetic] Codex CLI system prompt omitted from this fixture.",
    )
    expect(converted.body.stream).toBe(true)
    expect(converted.body.store).toBe(false)
    expect(converted.body).not.toHaveProperty("client_metadata")
    expect(converted.body).not.toHaveProperty("parallel_tool_calls")
    expect(converted.tools.size).toBe(33)
    expect(converted.body.generation_config).toEqual({
      tool_choice: "auto",
      thinking_level: "low",
      thinking_summaries: "auto",
    })
  })

  test("restores the namespace of every flattened CLI tool", () => {
    const converted = request(cliRequest)
    const options = {
      requestedModel: "gemini-3.8-flash",
      tools: converted.tools,
    }
    const namespaced = [...converted.tools].filter(
      ([, identity]) => identity.namespace !== undefined,
    )
    expect(namespaced).toHaveLength(23)
    for (const [upstream, identity] of namespaced) {
      const output = response(
        {
          id: "v1",
          model: "gemini-3.8-flash",
          status: "completed",
          steps: [
            {
              type: "function_call",
              id: "call_1",
              name: upstream,
              arguments: {},
            },
          ],
        },
        options,
      ).output as Array<JsonObject>
      expect(output[0]?.namespace).toBe(identity.namespace)
      expect(output[0]?.name).toBe(identity.name)
    }
  })
})
