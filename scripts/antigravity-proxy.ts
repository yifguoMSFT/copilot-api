/**
 * Standalone Antigravity entry point: Google login plus a transparent
 * Interactions proxy.
 *
 * This file is the only place that touches both `src/services/antigravity/*`
 * modules. It holds no business logic: `login` runs the authorization-code
 * flow, `serve` starts the byte-exact forwarder. It is never imported by
 * copilot-api routing, and the Responses/Interactions converters do not
 * reference it. See [[ANTIGRAVITY_NATIVE_INTERACTIONS_PROXY_PLAN_CN.md]].
 */
import { homedir } from "node:os"
import { join } from "node:path"

import {
  ANTIGRAVITY_OAUTH,
  AntigravityCredentialStore,
  runAntigravityLogin,
} from "../src/services/antigravity/auth"
import {
  assertLoopbackHost,
  createAntigravityProxyServer,
  resolveUpstreamOrigin,
} from "../src/services/antigravity/proxy"

export const DEFAULT_UPSTREAM_ORIGIN =
  "https://generativelanguage.googleapis.com"
export const DEFAULT_LISTEN_HOST = "127.0.0.1"
export const DEFAULT_LISTEN_PORT = 51_234
export const DEFAULT_CREDENTIAL_PATH = join(
  homedir(),
  ".cli-proxy-api",
  "antigravity.json",
)

const LOGIN_FLAGS = new Set(["--credential-file", "--port"])
const SERVE_FLAGS = new Set([
  "--credential-file",
  "--host",
  "--port",
  "--upstream",
])

export type AntigravityProxyCommand =
  | { credentialPath: string; kind: "login"; port: number }
  | {
      credentialPath: string
      host: string
      kind: "serve"
      port: number
      upstreamOrigin: string
    }

export class AntigravityProxyUsageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AntigravityProxyUsageError"
  }
}

export function formatUsage(): string {
  return [
    "Antigravity login and transparent Interactions proxy.",
    "",
    "Usage:",
    "  bun scripts/antigravity-proxy.ts login [--credential-file <path>] [--port <n>]",
    "  bun scripts/antigravity-proxy.ts serve [--credential-file <path>] [--upstream <origin>] [--host <address>] [--port <n>]",
    "",
    "login  Runs the Google authorization-code flow and writes the credential file.",
    "serve  Forwards loopback HTTP requests to the fixed upstream origin with the",
    "       account bearer injected. Method, path, query, body bytes, status, and",
    "       response bytes are passed through unchanged.",
    "",
    "Defaults:",
    `  --credential-file ${DEFAULT_CREDENTIAL_PATH}`,
    `  --upstream        ${DEFAULT_UPSTREAM_ORIGIN}`,
    `  --host            ${DEFAULT_LISTEN_HOST}`,
    `  --port            ${DEFAULT_LISTEN_PORT}`,
    "",
    "Only a loopback listen address is accepted, and the upstream origin must be",
    "an HTTPS origin without a path, query, fragment, or userinfo.",
    "",
  ].join("\n")
}

export function parseAntigravityProxyArgs(
  argv: ReadonlyArray<string>,
): AntigravityProxyCommand {
  const [operation, ...rest] = argv
  if (operation !== "login" && operation !== "serve")
    throw new AntigravityProxyUsageError(
      "Expected the login or serve operation.",
    )

  const allowed = operation === "login" ? LOGIN_FLAGS : SERVE_FLAGS
  const flags = parseFlags(rest)
  for (const name of flags.keys())
    if (!allowed.has(name))
      throw new AntigravityProxyUsageError(
        `${name} is not a ${operation} option.`,
      )

  const credentialPath =
    flags.get("--credential-file") ?? DEFAULT_CREDENTIAL_PATH
  const port = parsePort(flags.get("--port"))
  if (credentialPath === "")
    throw new AntigravityProxyUsageError("--credential-file must not be empty.")

  if (operation === "login")
    return {
      credentialPath,
      kind: "login",
      port: port ?? ANTIGRAVITY_OAUTH.defaultCallbackPort,
    }

  const host = flags.get("--host") ?? DEFAULT_LISTEN_HOST
  assertLoopbackHost(host)
  const upstream = resolveUpstreamOrigin(
    flags.get("--upstream") ?? DEFAULT_UPSTREAM_ORIGIN,
  )
  return {
    credentialPath,
    host,
    kind: "serve",
    port: port ?? DEFAULT_LISTEN_PORT,
    upstreamOrigin: upstream.origin,
  }
}

export async function runAntigravityProxyCli(
  argv: ReadonlyArray<string>,
): Promise<number> {
  let command: AntigravityProxyCommand
  try {
    command = parseAntigravityProxyArgs(argv)
  } catch (error) {
    process.stderr.write(`${messageOf(error)}\n\n${formatUsage()}`)
    return 2
  }

  if (command.kind === "login") {
    try {
      await runAntigravityLogin({
        credentialPath: command.credentialPath,
        onAuthorizationUrl: (url) => {
          process.stdout.write(`Open this URL to authorize:\n${url}\n`)
        },
        port: command.port,
      })
    } catch (error) {
      process.stderr.write(`login failed: ${messageOf(error)}\n`)
      return 1
    }
    process.stdout.write(`credential written: ${command.credentialPath}\n`)
    return 0
  }

  const credentialStore = new AntigravityCredentialStore(command.credentialPath)
  const server = createAntigravityProxyServer({
    credentialStore,
    host: command.host,
    upstreamOrigin: command.upstreamOrigin,
  })
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(command.port, command.host, () => resolve())
  })
  const address = server.address()
  const port =
    typeof address === "object" && address !== null ?
      address.port
    : command.port
  process.stdout.write(
    `antigravity proxy: http://${command.host}:${port} -> ${command.upstreamOrigin}\n`,
  )

  await new Promise<void>((resolve) => {
    for (const signal of ["SIGINT", "SIGTERM"] as const)
      process.once(signal, () => {
        server.close(() => resolve())
      })
  })
  return 0
}

function parseFlags(argv: ReadonlyArray<string>): Map<string, string> {
  const flags = new Map<string, string>()
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token.startsWith("--"))
      throw new AntigravityProxyUsageError(`Unexpected argument ${token}.`)
    const separator = token.indexOf("=")
    if (separator !== -1) {
      flags.set(token.slice(0, separator), token.slice(separator + 1))
      continue
    }
    if (index + 1 >= argv.length || argv[index + 1].startsWith("--"))
      throw new AntigravityProxyUsageError(`${token} needs a value.`)
    flags.set(token, argv[index + 1])
    index += 1
  }
  return flags
}

function parsePort(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined
  const port = Number(raw)
  if (!Number.isInteger(port) || port < 1 || port > 65_535)
    throw new AntigravityProxyUsageError(
      `--port must be an integer between 1 and 65535, received ${raw}.`,
    )
  return port
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

if (import.meta.main)
  process.exitCode = await runAntigravityProxyCli(process.argv.slice(2))
