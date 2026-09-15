import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import path from "node:path"

/**
 * Ensures local internal root CA certificates are trusted by Bun's native fetch.
 * Bun on Windows uses BoringSSL and does not automatically query the Windows CryptoAPI
 * certificate store for fetch(). It requires NODE_EXTRA_CA_CERTS at process startup.
 * If NODE_EXTRA_CA_CERTS is not set, copilot-api detects known local CA roots and
 * re-executes the process once with NODE_EXTRA_CA_CERTS set, completely transparent to the user.
 */
function ensureSystemCaTrust(): void {
  if (process.env.NODE_EXTRA_CA_CERTS || process.env.__COPILOT_API_CA_SPAWNED === "1") {
    return
  }

  const candidatePaths = [
    path.resolve("I:/Cache/workshop/home-server/cert/jeff-server-home-root-ca.crt"),
    path.resolve(process.cwd(), "cert/jeff-server-home-root-ca.crt"),
  ]

  const caPath = candidatePaths.find((p) => existsSync(p))
  if (!caPath) {
    return
  }

  const res = spawnSync(process.execPath, process.argv.slice(1), {
    env: {
      ...process.env,
      NODE_EXTRA_CA_CERTS: caPath,
      __COPILOT_API_CA_SPAWNED: "1",
    },
    stdio: "inherit",
  })

  process.exit(res.status ?? 0)
}

ensureSystemCaTrust()
