#!/usr/bin/env node

import { defineCommand } from "citty"
import clipboard from "clipboardy"
import consola from "consola"
import path from "node:path"
import { serve } from "srvx"
import invariant from "tiny-invariant"

import { deepSeekCodexModel } from "~/providers/deepseek/models"

import { createCodexCredentialStore } from "./lib/codex-credentials"
import {
  loadBaseCatalog,
  type BaseCatalog,
  refreshUpstreamCatalog,
  writePublishedCatalog,
} from "./lib/codex-models"
import { assertModelRoutingConflicts } from "./lib/model-routing"
import {
  buildPublishedModels,
  findUnconfiguredCodexModels,
  type PublishedModels,
} from "./lib/model-sources"
import { ensureCodexAuthDir, ensurePaths, PATHS } from "./lib/paths"
import { initProxyFromEnv } from "./lib/proxy"
import { setRequestLogFile } from "./lib/request-log"
import { loadRuntimeConfig, type RuntimeConfig } from "./lib/runtime-config"
import { generateEnvScript } from "./lib/shell"
import { state } from "./lib/state"
import { setupCopilotToken, setupGitHubToken } from "./lib/token"
import { cacheModels, cacheVSCodeVersion } from "./lib/utils"
import { server } from "./server"
import { antigravityCodexModels } from "./services/antigravity/models"

interface RunServerOptions {
  port: number
  hostname?: string
  verbose: boolean
  accountType: string
  manual: boolean
  rateLimit?: number
  rateLimitWait: boolean
  githubToken?: string
  claudeCode: boolean
  showToken: boolean
  proxyEnv: boolean
  responsesStableItemIds: boolean
  configPath?: string
  environment?: string
}

type CodexProviderConfig = RuntimeConfig["providers"]["codex"]

/**
 * Startup side effects of each provider. Extracted so a Codex-only install can
 * be verified to never touch GitHub or the Copilot token exchange.
 */
export interface ProviderBootstrap {
  cacheModels: () => Promise<void>
  cacheVSCodeVersion: () => Promise<void>
  ensureCodexAuthDir: () => Promise<string>
  ensurePaths: () => Promise<void>
  setupCopilotToken: () => Promise<void>
  setupGitHubToken: () => Promise<void>
}

export async function bootstrapProviders(
  config: RuntimeConfig,
  options: { githubToken?: string },
  dependencies: ProviderBootstrap = {
    cacheModels,
    cacheVSCodeVersion,
    ensureCodexAuthDir,
    ensurePaths,
    setupCopilotToken,
    setupGitHubToken,
  },
): Promise<void> {
  if (config.providers.codex.enabled) await dependencies.ensureCodexAuthDir()
  if (!config.providers.copilot.enabled) return

  await dependencies.ensurePaths()
  await dependencies.cacheVSCodeVersion()

  if (options.githubToken) {
    state.githubToken = options.githubToken
    consola.info("Using provided GitHub token")
  } else {
    await dependencies.setupGitHubToken()
  }

  await dependencies.setupCopilotToken()
  await dependencies.cacheModels()
}

/**
 * The service starts without a Codex login so an unattended restart is not
 * blocked; requests that need the missing credential are rejected instead.
 */
async function reportCodexReadiness(codex: CodexProviderConfig): Promise<void> {
  try {
    const store = createCodexCredentialStore({
      directory: await ensureCodexAuthDir(),
    })
    const credential = await store.read(codex.authProfile)
    if (credential === undefined) {
      consola.warn(
        `No Codex credentials for profile "${codex.authProfile}"; run "codex-auth login" before using Codex models. Codex requests fail until then.`,
      )
      return
    }
    consola.info(
      `Codex provider ready (profile "${codex.authProfile}", models: ${codex.models.join(", ")})`,
    )
  } catch (error) {
    consola.warn(
      `Could not read Codex credentials for profile "${codex.authProfile}": ${error instanceof Error ? error.message : "unknown error"}`,
    )
  }
}

interface CodexCatalogPaths {
  cacheFile: string
  catalogFile: string
  customFiles: Array<string>
}

const codexCatalogPaths = (cwd: string): CodexCatalogPaths => ({
  cacheFile: path.join(cwd, "codex-models-upstream.json"),
  catalogFile: path.join(cwd, "codex-models.json"),
  customFiles: [path.join(cwd, "codex-models-custom.json")],
})

/**
 * Loads the raw model definitions and fails early when the enabled Codex
 * provider has nothing to publish. A missing upstream catalog is fatal there,
 * because silently serving an empty picker would look like a working setup.
 */
async function loadCodexBaseCatalog(
  config: RuntimeConfig,
  paths: CodexCatalogPaths,
): Promise<BaseCatalog> {
  await refreshUpstreamCatalog({ cacheFile: paths.cacheFile })
  const base = await loadBaseCatalog({
    customFiles: paths.customFiles,
    extensionModels: [
      ...(config.providers.deepseek.enabled ?
        deepSeekExtensionModels(config)
      : []),
            ...(config.providers.antigravity.enabled ? antigravityCodexModels : []),
    ],
    upstreamCacheFile: paths.cacheFile,
  })

  if (config.providers.codex.enabled) {
    if (
      config.providers.codex.models.length === 0
      && base.officialModels.length === 0
    ) {
      throw new Error(
        `No official Codex model catalog is available (cache: ${paths.cacheFile}); connect to the network or restore the cache before enabling the Codex provider`,
      )
    }
    const missing = findUnconfiguredCodexModels(config, [
      ...base.officialModels,
      ...base.customModels,
    ])
    if (missing.length > 0) {
      throw new Error(
        `Codex models have no catalog definition: ${missing.join(", ")}. Add them to codex-models-custom.json or adjust providers.codex.models`,
      )
    }
  }

  return base
}

const deepSeekExtensionModels = (
  config: RuntimeConfig,
): Array<Record<string, unknown>> =>
  config.providers.deepseek.models.map((slug) => deepSeekCodexModel(slug))

/**
 * Publishes the public model ids once the Copilot catalogue is known, writes
 * the catalog Codex reads, and keeps the mapping every request resolves
 * against in memory.
 */
async function publishModels(
  config: RuntimeConfig,
  base: BaseCatalog,
  catalogFile: string,
): Promise<PublishedModels> {
  const published = buildPublishedModels({
    catalog: base.entries,
    config,
    copilotModels:
      config.providers.copilot.enabled ?
        (state.models?.data.map((model) => model.id) ?? [])
      : [],
    customModels: base.customModels,
    officialModels: base.officialModels,
  })
  state.publishedModels = published
  await writePublishedCatalog({
    base,
    deepSeekModels: config.providers.deepseek.models,
    outputFile: catalogFile,
    published,
  })
  consola.info(
    published.suffixMode ?
      `Published ${published.entries.size} source-suffixed model ids`
    : "Source suffixes disabled; publishing a single unsuffixed model list",
  )
  return published
}

export async function runServer(options: RunServerOptions): Promise<void> {
  state.verbose = options.verbose

  setRequestLogFile(PATHS.REQUEST_LOG_PATH)
  consola.info(`Incoming requests are appended to ${PATHS.REQUEST_LOG_PATH}`)

  if (options.proxyEnv) {
    initProxyFromEnv()
  }

  if (options.verbose) {
    consola.level = 5
    consola.info("Verbose logging enabled")
  }

  state.accountType = options.accountType
  if (options.accountType !== "individual") {
    consola.info(`Using ${options.accountType} plan GitHub account`)
  }

  state.manualApprove = options.manual
  state.rateLimitSeconds = options.rateLimit
  state.rateLimitWait = options.rateLimitWait
  state.showToken = options.showToken
  state.responsesStableItemIds = options.responsesStableItemIds

  const runtimeConfig = await loadRuntimeConfig({
    configPath: options.configPath,
    environment: options.environment,
  })
  state.runtimeConfig = runtimeConfig
  // Static conflicts fail before any directory or network work happens.
  assertModelRoutingConflicts(runtimeConfig)
  const catalogPaths = codexCatalogPaths(process.cwd())
  const baseCatalog = await loadCodexBaseCatalog(runtimeConfig, catalogPaths)
  if (
    runtimeConfig.providers.deepseek.enabled
    && !runtimeConfig.providers.deepseek.apiKey.trim()
  )
    throw new Error("Missing DeepSeek API key")

  await bootstrapProviders(runtimeConfig, {
    ...(options.githubToken === undefined ?
      {}
    : { githubToken: options.githubToken }),
  })

  if (runtimeConfig.providers.codex.enabled) {
    await reportCodexReadiness(runtimeConfig.providers.codex)
  }

  await publishModels(runtimeConfig, baseCatalog, catalogPaths.catalogFile)

  consola.info(
    `Available models: \n${state.models?.data.map((model) => `- ${model.id}`).join("\n")}`,
  )

  const hostname = options.hostname ?? "127.0.0.1"
  const serverUrl = `http://localhost:${options.port}`

  if (options.claudeCode) {
    if (!runtimeConfig.providers.copilot.enabled) {
      throw new Error("Claude Code mode requires the Copilot provider")
    }
    invariant(state.models, "Models should be loaded by now")

    const selectedModel = await consola.prompt(
      "Select a model to use with Claude Code",
      {
        type: "select",
        options: state.models.data.map((model) => model.id),
      },
    )

    const selectedSmallModel = await consola.prompt(
      "Select a small model to use with Claude Code",
      {
        type: "select",
        options: state.models.data.map((model) => model.id),
      },
    )

    const command = generateEnvScript(
      {
        ANTHROPIC_BASE_URL: serverUrl,
        ANTHROPIC_AUTH_TOKEN: "dummy",
        ANTHROPIC_MODEL: selectedModel,
        ANTHROPIC_DEFAULT_SONNET_MODEL: selectedModel,
        ANTHROPIC_SMALL_FAST_MODEL: selectedSmallModel,
        ANTHROPIC_DEFAULT_HAIKU_MODEL: selectedSmallModel,
        DISABLE_NON_ESSENTIAL_MODEL_CALLS: "1",
        CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
      },
      "claude",
    )

    try {
      clipboard.writeSync(command)
      consola.success("Copied Claude Code command to clipboard!")
    } catch {
      consola.warn(
        "Failed to copy to clipboard. Here is the Claude Code command:",
      )
      consola.log(command)
    }
  }

  consola.box(
    `🌐 Usage Viewer: https://ericc-ch.github.io/copilot-api?endpoint=${serverUrl}/usage`,
  )

  serve({
    fetch: server.fetch,
    hostname,
    port: options.port,
  })
}

export const start = defineCommand({
  meta: {
    name: "start",
    description: "Start the Copilot API server",
  },
  args: {
    port: {
      alias: "p",
      type: "string",
      default: "4141",
      description: "Port to listen on",
    },
    verbose: {
      alias: "v",
      type: "boolean",
      default: false,
      description: "Enable verbose logging",
    },
    "account-type": {
      alias: "a",
      type: "string",
      default: "individual",
      description: "Account type to use (individual, business, enterprise)",
    },
    manual: {
      type: "boolean",
      default: false,
      description: "Enable manual request approval",
    },
    "rate-limit": {
      alias: "r",
      type: "string",
      description: "Rate limit in seconds between requests",
    },
    wait: {
      alias: "w",
      type: "boolean",
      default: false,
      description:
        "Wait instead of error when rate limit is hit. Has no effect if rate limit is not set",
    },
    "github-token": {
      alias: "g",
      type: "string",
      description:
        "Provide GitHub token directly (must be generated using the `auth` subcommand)",
    },
    "claude-code": {
      alias: "c",
      type: "boolean",
      default: false,
      description:
        "Generate a command to launch Claude Code with Copilot API config",
    },
    "show-token": {
      type: "boolean",
      default: false,
      description: "Show GitHub and Copilot tokens on fetch and refresh",
    },
    "proxy-env": {
      type: "boolean",
      default: false,
      description: "Initialize proxy from environment variables",
    },
    "responses-stable-item-ids": {
      type: "boolean",
      default: true,
      description: "Stabilize Responses output item IDs",
    },
    config: {
      type: "string",
      description: "Path to the copilot-api JSON configuration file",
    },
    env: {
      type: "string",
      description: "Configuration environment name",
    },
    host: {
      type: "string",
      default: "127.0.0.1",
      description:
        "Host to bind. Defaults to loopback; set explicitly to expose the proxy",
    },
  },
  run({ args }) {
    const rateLimitRaw = args["rate-limit"]
    const rateLimit =
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      rateLimitRaw === undefined ? undefined : Number.parseInt(rateLimitRaw, 10)

    return runServer({
      hostname: args.host,
      port: Number.parseInt(args.port, 10),
      verbose: args.verbose,
      accountType: args["account-type"],
      manual: args.manual,
      rateLimit,
      rateLimitWait: args.wait,
      githubToken: args["github-token"],
      claudeCode: args["claude-code"],
      showToken: args["show-token"],
      proxyEnv: args["proxy-env"],
      responsesStableItemIds: args["responses-stable-item-ids"],
      configPath: args.config,
      environment: args.env,
    })
  },
})
