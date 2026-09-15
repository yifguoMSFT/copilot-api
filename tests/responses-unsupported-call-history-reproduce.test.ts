import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test"

import { state } from "../src/lib/state"
import { server } from "../src/server"

/*
 * Replays the history of session 01a0a04e-12db-7083-ac79-6b4bd0324af7 (fork of
 * 01a09a81-e641-7030-8bfe-edf14b6c25c9). The model called
 * `mcp__kanban_execution::kanban_update`, the client answered
 * `unsupported call: mcp__kanban_execution::kanban_update`, and the model then retried with the
 * flat `kanban_update` name, which succeeded. Both the rejected call and its output are still in
 * the replayed input today.
 */
const rejectedCallId = "call_00_ET_i8i9KqqHtcBMDWPFRmfm5014"
const retryCallId = "call_00_dLVHiwu6sfupENaZsDr13485"

const rejectedCall = {
  type: "function_call",
  id: "9ebb480d-06e9-457e-af25-62082aa1c8f5",
  name: "mcp__kanban_execution::kanban_update",
  arguments:
    '{"blueprint_path": "I:/Cache/workshop/home-server/llm-gateway/docs/antigravity-new-api-integration.kanban.json", "task_id": "建立_new-api_范围基线", "action": "progress"}',
  call_id: rejectedCallId,
  internal_chat_message_metadata_passthrough: {
    turn_id: "01a0a032-5127-72b2-a51a-77f11ebda725",
  },
}

const rejectedOutput = {
  type: "function_call_output",
  id: "fco_01a0a033-9fb3-7f23-9756-6688f6d51cb7",
  call_id: rejectedCallId,
  output: "unsupported call: mcp__kanban_execution::kanban_update",
  internal_chat_message_metadata_passthrough: {
    turn_id: "01a0a032-5127-72b2-a51a-77f11ebda725",
    create_time: 1789394132.9156864,
  },
}

const retryCall = {
  type: "function_call",
  id: "bffe5ec6-ab43-4397-90c9-cf66919ba650",
  name: "kanban_update",
  namespace: "mcp__kanban_execution",
  arguments:
    '{"action": "progress", "blueprint_path": "I:/Cache/workshop/home-server/llm-gateway/docs/antigravity-new-api-integration.kanban.json", "summary": "no changes to commit", "task_id": "建立_new-api_范围基线"}',
  call_id: retryCallId,
  internal_chat_message_metadata_passthrough: {
    turn_id: "01a0a032-5127-72b2-a51a-77f11ebda725",
  },
}

const retryOutput = {
  type: "function_call_output",
  id: "fco_01a0a033-d1f9-7232-8a35-b5000a3fbbad",
  call_id: retryCallId,
  output:
    'Wall time: 4.1354 seconds\nOutput:\n{"result":"# Kanban Update Recorded\\n\\nThe update was saved to the execution JSON."}',
  internal_chat_message_metadata_passthrough: {
    turn_id: "01a0a032-5127-72b2-a51a-77f11ebda725",
    create_time: 1789394145.785845,
  },
}

const replayedHistory = [
  {
    type: "reasoning",
    id: "c5072146-4c69-44b6-bbd8-46ac3259cb04",
    summary: [],
    content: [
      {
        type: "reasoning_text",
        text: "Now start the execution: call kanban_execution overview, then focus the baseline task.",
      },
    ],
    encrypted_content: "284a995d-f180-48e9-a963-a1bac6c53d30-0",
  },
  rejectedCall,
  rejectedOutput,
  retryCall,
  retryOutput,
]

const originalFetch = globalThis.fetch
const fetchMock = mock((_input: string | URL | Request, _init?: RequestInit) =>
  Promise.resolve(Response.json({ object: "response" })),
)

globalThis.fetch = fetchMock as unknown as typeof fetch

beforeEach(() => {
  fetchMock.mockClear()
  fetchMock.mockImplementation(() =>
    Promise.resolve(Response.json({ object: "response" })),
  )
  state.accountType = "individual"
  state.copilotToken = "test-copilot-token"
  state.vsCodeVersion = "1.0.0"
  state.manualApprove = false
  state.rateLimitSeconds = undefined
  state.rateLimitWait = false
  state.responsesStableItemIds = true
  state.lastRequestTimestamp = undefined
})

afterAll(() => {
  globalThis.fetch = originalFetch
})

describe("Rejected tool call replay", () => {
  test("does not replay the call the client answered with unsupported call", async () => {
    const response = await server.request(
      new Request("http://localhost/v1/responses", {
        method: "POST",
        headers: {
          authorization: "Bearer local-dummy-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({ model: "gpt-copilot", input: replayedHistory }),
      }),
    )

    expect(response.status).toBe(200)
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    const forwarded = JSON.parse(await new Response(init.body).text()) as {
      input: Array<Record<string, unknown>>
    }
    const callIds = forwarded.input.map((item) => item.call_id)

    expect(callIds).not.toContain(rejectedCallId)
    expect(callIds).toContain(retryCallId)
    expect(
      forwarded.input.some(
        (item) =>
          item.type === "function_call_output"
          && item.call_id === rejectedCallId,
      ),
    ).toBe(false)
    expect(forwarded.input).toHaveLength(replayedHistory.length - 2)
  })
})
