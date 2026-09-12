import fs from "node:fs/promises"
import path from "node:path"
import { z } from "zod"

import {
  assertCodexProfileName,
  DEFAULT_CODEX_PROFILE,
} from "~/lib/codex-credentials"
import { assertModelRoutingConflicts } from "~/lib/model-routing"

const providerSchema = z.strictObject({
  enabled: z.boolean().optional(),
  stripReasoningContentForGpt: z.boolean().optional(),
})
const codexSchema = z.strictObject({
  authProfile: z.string().min(1).optional(),
  baseUrl: z.url().optional(),
  enabled: z.boolean().optional(),
  models: z.array(z.string().min(1)).min(1).optional(),
  transport: z.literal("http").optional(),
})
const deepSeekSchema = z.strictObject({
  enabled: z.boolean().optional(),
  baseUrl: z.url().optional(),
  apiKey: z.string().min(1).optional(),
  models: z.array(z.string().min(1)).min(1).optional(),
})
const layerSchema = z.strictObject({
  providers: z
    .strictObject({
      codex: codexSchema.optional(),
      copilot: providerSchema.optional(),
      deepseek: deepSeekSchema.optional(),
    })
    .optional(),
})
const fileSchema = z.strictObject({
  version: z.literal(1),
  defaults: layerSchema.optional(),
  environments: z.record(z.string(), layerSchema).optional(),
})

/** The ChatGPT credential may only ever be sent to the verified Codex origin. */
export const CODEX_UPSTREAM_ORIGIN = "https://chatgpt.com"

export interface RuntimeConfig {
  environment: string
  source?: string
  providers: {
    codex: {
      authProfile: string
      baseUrl: string
      enabled: boolean
      gatewayApiKey: string
      models: Array<string>
      transport: "http"
    }
    copilot: { enabled: boolean; stripReasoningContentForGpt: boolean }
    deepseek: {
      enabled: boolean
      baseUrl: string
      apiKey: string
      models: Array<string>
    }
  }
}

interface LoadRuntimeConfigOptions {
  configPath?: string
  environment?: string
  cwd?: string
  env?: Record<string, string | undefined>
}

/** Built-in provider defaults, also used when no configuration was loaded. */
export const defaultProviderConfig = (): Omit<
  RuntimeConfig,
  "environment" | "source"
> => ({
  providers: {
    codex: {
      authProfile: DEFAULT_CODEX_PROFILE,
      baseUrl: `${CODEX_UPSTREAM_ORIGIN}/backend-api/codex`,
      enabled: false,
      gatewayApiKey: "",
      models: [],
      transport: "http",
    },
    copilot: { enabled: true, stripReasoningContentForGpt: true },
    deepseek: {
      enabled: false,
      baseUrl: "https://api.deepseek.com",
      apiKey: "",
      models: ["deepseek-flash", "deepseek-v4-pro"],
    },
  },
})

export async function loadRuntimeConfig(
  options: LoadRuntimeConfigOptions = {},
): Promise<RuntimeConfig> {
  const env = options.env ?? process.env
  const cwd = options.cwd ?? process.cwd()
  const selectedPath = options.configPath ?? env.COPILOT_API_CONFIG
  const environment = options.environment ?? env.COPILOT_API_ENV ?? "default"
  const defaultPath = path.resolve(cwd, "config.json")
  const source =
    selectedPath === undefined ?
      await fs
        .access(defaultPath)
        .then(() => defaultPath)
        .catch(() => undefined)
    : path.resolve(cwd, selectedPath)
  let layer = defaultProviderConfig()

  if (source !== undefined) {
    const parsed = fileSchema.parse(
      // eslint-disable-next-line unicorn/prefer-json-parse-buffer
      JSON.parse(await fs.readFile(source, "utf8")),
    )
    layer = mergeLayer(layer, parsed.defaults)
    const environmentLayer = parsed.environments?.[environment]
    if (
      (options.environment !== undefined || env.COPILOT_API_ENV !== undefined)
      && environmentLayer === undefined
    ) {
      throw new Error(`Unknown copilot-api environment: ${environment}`)
    }
    layer = mergeLayer(layer, environmentLayer)
  }

  const config: RuntimeConfig = {
    ...layer,
    environment,
    source,
  }

  applyEnvironment(config, env)
  if (
    !config.providers.copilot.enabled
    && !config.providers.deepseek.enabled
    && !config.providers.codex.enabled
  ) {
    throw new Error("At least one model provider must be enabled")
  }
  assertCodexProvider(config.providers.codex)
  assertModelRoutingConflicts(config)
  return config
}

function mergeLayer(
  base: Omit<RuntimeConfig, "environment" | "source">,
  overlay?: z.infer<typeof layerSchema>,
): Omit<RuntimeConfig, "environment" | "source"> {
  return {
    providers: {
      codex: { ...base.providers.codex, ...overlay?.providers?.codex },
      copilot: { ...base.providers.copilot, ...overlay?.providers?.copilot },
      deepseek: { ...base.providers.deepseek, ...overlay?.providers?.deepseek },
    },
  }
}

/**
 * Rejects a Codex provider that could not serve requests safely: no gateway
 * key, an upstream that is not the verified origin, or a profile name that
 * could escape the credential directory. An omitted model list is valid and
 * means "every official catalog model"; the catalog itself is loaded later.
 */
function assertCodexProvider(codex: RuntimeConfig["providers"]["codex"]): void {
  if (!codex.enabled) return

  if (codex.gatewayApiKey.trim().length === 0) {
    throw new Error(
      "Missing Codex gateway API key; set COPILOT_API_GATEWAY_API_KEY before enabling the Codex provider",
    )
  }

  if (new URL(codex.baseUrl).origin !== CODEX_UPSTREAM_ORIGIN) {
    throw new Error(
      `Codex base URL must stay on ${CODEX_UPSTREAM_ORIGIN}: ${codex.baseUrl}`,
    )
  }

  try {
    assertCodexProfileName(codex.authProfile)
  } catch {
    throw new Error(
      `Invalid Codex authProfile in configuration: ${JSON.stringify(codex.authProfile)}`,
    )
  }
}

function parseBoolean(name: string, value?: string): boolean | undefined {
  if (value === undefined) return undefined
  if (value === "true") return true
  if (value === "false") return false
  throw new Error(`${name} must be true or false`)
}

function applyEnvironment(
  config: RuntimeConfig,
  env: Record<string, string | undefined>,
): void {
  config.providers.copilot.enabled =
    parseBoolean("COPILOT_API_COPILOT_ENABLED", env.COPILOT_API_COPILOT_ENABLED)
    ?? config.providers.copilot.enabled
  config.providers.deepseek.enabled =
    parseBoolean(
      "COPILOT_API_DEEPSEEK_ENABLED",
      env.COPILOT_API_DEEPSEEK_ENABLED,
    ) ?? config.providers.deepseek.enabled
  config.providers.codex.enabled =
    parseBoolean("COPILOT_API_CODEX_ENABLED", env.COPILOT_API_CODEX_ENABLED)
    ?? config.providers.codex.enabled
  if (env.COPILOT_API_DEEPSEEK_BASE_URL !== undefined) {
    config.providers.deepseek.baseUrl = z
      .url()
      .parse(env.COPILOT_API_DEEPSEEK_BASE_URL)
  }
  if (env.COPILOT_API_CODEX_BASE_URL !== undefined) {
    config.providers.codex.baseUrl = z
      .url()
      .parse(env.COPILOT_API_CODEX_BASE_URL)
  }
  if (env.COPILOT_API_CODEX_AUTH_PROFILE !== undefined) {
    config.providers.codex.authProfile = env.COPILOT_API_CODEX_AUTH_PROFILE
  }
  if (env.COPILOT_API_GATEWAY_API_KEY !== undefined) {
    config.providers.codex.gatewayApiKey = env.COPILOT_API_GATEWAY_API_KEY
  }
}
