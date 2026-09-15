import { join } from "node:path"
import { homedir } from "node:os"
import { AntigravityCredentialStore, ANTIGRAVITY_ENDPOINTS } from "../src/services/antigravity/auth"
import { createAntigravityResponses } from "../src/services/antigravity/create-responses"

const CREDENTIAL_PATH = join(homedir(), ".cli-proxy-api", "antigravity.json")
const store = new AntigravityCredentialStore(CREDENTIAL_PATH)

console.log("Testing live createAntigravityResponses with new typed item IDs...")

const payload = {
  model: "gemini-3.8-flash-tiered",
  stream: true,
  input: [
    {
      type: "message",
      role: "user",
      content: [{ type: "input_text", text: "Say hello!" }],
    },
  ],
}

try {
  const resp = await createAntigravityResponses(JSON.stringify(payload), {
    credentialStore: store,
  })
  console.log("Status:", resp.status)
  const text = await resp.text()
  console.log("Output snippet:\n", text.slice(0, 500))
  if (text.includes("msg_")) {
    console.log("SUCCESS: Output contains typed msg_ item ID!")
  }
} catch (e) {
  console.error("Error connecting to Antigravity:", e)
}
