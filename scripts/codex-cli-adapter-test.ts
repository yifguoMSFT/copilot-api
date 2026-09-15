import { createServer } from "node:http"
import { spawn } from "node:child_process"
import { join } from "node:path"
import { homedir, tmpdir } from "node:os"
import { writeFile, mkdir } from "node:fs/promises"

import {
  ANTIGRAVITY_ENDPOINTS,
  AntigravityCredentialStore,
} from "../src/services/antigravity/auth"
import { createAntigravityProxyServer } from "../src/services/antigravity/proxy"
import { createAntigravityResponsesServer } from "./antigravity-responses"

const CREDENTIAL_PATH = join(homedir(), ".cli-proxy-api", "antigravity.json")
const UPSTREAM_ORIGIN = ANTIGRAVITY_ENDPOINTS.daily

async function main() {
  console.log("Starting Antigravity auth proxy and Responses adapter for Codex CLI test...")

  // 1. Auth proxy
  const store = new AntigravityCredentialStore(CREDENTIAL_PATH)
  const proxyServer = createAntigravityProxyServer({
    credentialStore: store,
    host: "127.0.0.1",
    upstreamOrigin: UPSTREAM_ORIGIN,
  })
  await new Promise<void>((resolve) => proxyServer.listen(0, "127.0.0.1", () => resolve()))
  const proxyAddr = proxyServer.address() as any
  const proxyPort = proxyAddr.port
  console.log(`Proxy listening on 127.0.0.1:${proxyPort}`)

  // 2. Adapter
  const adapterServer = createAntigravityResponsesServer({
    proxyOrigin: `http://127.0.0.1:${proxyPort}`,
    defaultModel: "gemini-3.8-flash-medium",
  })
  await new Promise<void>((resolve) => adapterServer.listen(0, "127.0.0.1", () => resolve()))
  const adapterAddr = adapterServer.address() as any
  const adapterPort = adapterAddr.port
  console.log(`Adapter listening on 127.0.0.1:${adapterPort}`)

  // 3. Create a temporary config.toml for Codex CLI
  const testDir = join(tmpdir(), `codex-adapter-test-${Date.now()}`)
  await mkdir(testDir, { recursive: true })
  const configPath = join(testDir, "config.toml")

  const tomlContent = `
model_provider = "test_adapter"
model = "gemini-3.8-flash-medium"

[model_providers.test_adapter]
name = "Antigravity Adapter"
base_url = "http://127.0.0.1:${adapterPort}/v1"
wire_api = "responses"
requires_openai_auth = false
supports_websockets = false
`
  await writeFile(configPath, tomlContent, "utf-8")
  console.log(`Created test config at ${configPath}`)

  // 4. Run Codex CLI exec command
  console.log("Executing: codex exec \"Reply with exactly: CODEX_CLI_TEST_OK\"")
  const child = spawn("codex", [
    "-c", `model_provider="test_adapter"`, "-c", `model_providers.test_adapter.name="test_adapter"`, "-c", `model_providers.test_adapter.base_url="http://127.0.0.1:${adapterPort}/v1"`, "-c", `model_providers.test_adapter.requires_openai_auth=false`, "-c", `model_providers.test_adapter.supports_websockets=false`, "-c", `model_providers.test_adapter.wire_api="responses"`, "-c", `model="gemini-3.8-flash-medium"`,
    "exec",
    "Reply with exactly: CODEX_CLI_TEST_OK",
  ], {
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
  })

  let stdout = ""
  let stderr = ""
  child.stdout.on("data", (d) => { stdout += d.toString() })
  child.stderr.on("data", (d) => { stderr += d.toString() })

  const code = await new Promise<number>((resolve) => {
    child.on("close", resolve)
  })

  console.log(`Codex exit code: ${code}`)
  console.log(`Codex stdout:\n${stdout}`)
  if (stderr) console.log(`Codex stderr:\n${stderr}`)

  await new Promise<void>((resolve) => adapterServer.close(() => resolve()))
  await new Promise<void>((resolve) => proxyServer.close(() => resolve()))

  if (stdout.includes("CODEX_CLI_TEST_OK")) {
    console.log("SUCCESS: Codex CLI successfully interacted via Antigravity Responses adapter!")
    process.exit(0)
  } else {
    console.error("FAIL: Did not get expected output from Codex CLI")
    process.exit(1)
  }
}

main().catch((err) => {
  console.error("Error in runner:", err)
  process.exit(1)
})
