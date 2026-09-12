import { describe, expect, test } from "bun:test"

import {
  convertInteractionsResponseToResponses as response,
  convertResponsesRequestToInteractions as request,
  type JsonObject,
  NAMESPACE_SEPARATOR,
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
    expect(converted.toolNamespaces.size).toBe(23)
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
      toolNamespaces: converted.toolNamespaces,
      customTools: converted.customTools,
    }
    for (const [upstream, namespace] of converted.toolNamespaces) {
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
      expect(output[0]?.namespace).toBe(namespace)
      expect(output[0]?.name).toBe(
        upstream.slice(namespace.length + NAMESPACE_SEPARATOR.length),
      )
    }
  })
})
