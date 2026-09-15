import { Hono } from "hono"
import { state } from "~/lib/state"
import { handleResponse } from "~/routes/responses/handler"

console.log("Testing Responses handler with legacy un-prefixed ID fixture...")

let capturedBody: any
const origFetch = globalThis.fetch
globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
  if (String(url).includes("responses") || String(url).includes("api.deepseek.com")) {
    capturedBody = typeof init?.body === "string" ? JSON.parse(init.body) : init?.body
    return new Response(JSON.stringify({ id: "resp_1", choices: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })
  }
  return origFetch(url, init)
}) as typeof fetch

state.runtimeConfig = {
  environment: "production",
  providers: {
    copilot: {
      defaultModel: "gpt-4o",
      stripReasoningContentForGpt: false,
    },
    codex: {
      authProfile: "default",
      endpoint: "https://chatgpt.com/backend-api",
    },
    deepseek: {
      apiKey: "sk-test",
      baseUrl: "https://api.deepseek.com",
      enabled: true,
      models: ["deepseek-chat"],
    },
    antigravity: {
      enabled: false,
    },
  },
}

const app = new Hono()
app.post("/responses", handleResponse)

const payload = {
  model: "deepseek-chat",
  input: [
    {
      id: "11KmaujSL-ON1e8P2rKtmQk_0",
      type: "function_call",
      call_id: "call_11KmaujSL-ON1e8P2rKtmQk_1",
      name: "exec_command",
      arguments: "{\"cmd\":\"echo 1\"}",
    },
    {
      type: "function_call_output",
      call_id: "call_11KmaujSL-ON1e8P2rKtmQk_1",
      output: "1\n",
    },
    {
      id: "raw_rs_item",
      type: "reasoning",
      encrypted_content: "agdata1.dummy_content",
    }
  ],
}

const res = await app.request("/responses", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(payload),
})

console.log("Status:", res.status)
console.log("Captured input[0]:", capturedBody?.input?.[0])
console.log("Captured input[1]:", capturedBody?.input?.[1])
console.log("Captured input[2]:", capturedBody?.input?.[2])

if (
  capturedBody?.input?.[0]?.id === "fc_11KmaujSL-ON1e8P2rKtmQk_0" &&
  capturedBody?.input?.[0]?.call_id === "call_11KmaujSL-ON1e8P2rKtmQk_1" &&
  capturedBody?.input?.[1]?.call_id === "call_11KmaujSL-ON1e8P2rKtmQk_1" &&
  capturedBody?.input?.[2]?.id === "rs_raw_rs_item" &&
  capturedBody?.input?.[2]?.encrypted_content === "agdata1.dummy_content"
) {
  console.log("SUCCESS: Sanitizer perfectly cleaned legacy fixture IDs while preserving call_id and encrypted_content!")
} else {
  console.error("FAIL: Validation did not match expected structure")
  process.exit(1)
}
