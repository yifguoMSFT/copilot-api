import fs from "node:fs/promises"
import path from "node:path"
import { z } from "zod"

import { PATHS } from "./paths"

const providerSchema = z.strictObject({
  enabled: z.boolean().optional(),
  stripReasoningContentForGpt: z.boolean().optional(),
})
const deepSeekSchema = z.strictObject({
  enabled: z.boolean().optional(),
  baseUrl: z.url().optional(),
  apiKeyEnv: z.string().min(1).optional(),
  models: z.array(z.string().min(1)).min(1).optional(),
})
const catalogSchema = z.strictObject({
  enabled: z.boolean().optional(),
  customFiles: z.array(z.string().min(1)).optional(),
  outputFile: z.string().min(1).optional(),
})
const layerSchema = z.strictObject({
  providers: z
    .strictObject({
      copilot: providerSchema.optional(),
      deepseek: deepSeekSchema.optional(),
    })
    .optional(),
  catalog: catalogSchema.optional(),
})
const fileSchema = z.strictObject({
  version: z.literal(1),
  defaults: layerSchema.optional(),
  environments: z.record(z.string(), layerSchema).optional(),
})

export interface RuntimeConfig {
  environment: string
  source?: string
  providers: {
    copilot: { enabled: boolean; stripReasoningContentForGpt: boolean }
    deepseek: {
      enabled: boolean
      baseUrl: string
      apiKeyEnv: string
      models: Array<string>
    }
  }
  catalog: { enabled: boolean; customFiles: Array<string>; outputFile: string }
}

interface LoadRuntimeConfigOptions {
  configPath?: string
  environment?: string
  cwd?: string
  env?: Record<string, string | undefined>
}

const defaults = (): Omit<RuntimeConfig, "environment" | "source"> => ({
  providers: {
    copilot: { enabled: true, stripReasoningContentForGpt: true },
    deepseek: {
      enabled: false,
      baseUrl: "https://api.deepseek.com",
      apiKeyEnv: "DEEPSEEK_API_KEY",
      models: ["deepseek-flash", "deepseek-v4-pro"],
    },
  },
  catalog: {
    enabled: true,
    customFiles: [],
    outputFile: path.join(PATHS.APP_DIR, "codex-models.json"),
  },
})

export async function loadRuntimeConfig(
  options: LoadRuntimeConfigOptions = {},
): Promise<RuntimeConfig> {
  const env = options.env ?? process.env
  const cwd = options.cwd ?? process.cwd()
  const selectedPath = options.configPath ?? env.COPILOT_API_CONFIG
  const environment = options.environment ?? env.COPILOT_API_ENV ?? "default"
  const source =
    selectedPath === undefined ? undefined : path.resolve(cwd, selectedPath)
  let layer = defaults()

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

  const baseDirectory = source === undefined ? cwd : path.dirname(source)
  const config: RuntimeConfig = {
    ...layer,
    environment,
    source,
    catalog: {
      ...layer.catalog,
      customFiles: layer.catalog.customFiles.map((value) =>
        path.resolve(baseDirectory, value),
      ),
      outputFile: path.resolve(baseDirectory, layer.catalog.outputFile),
    },
  }

  applyEnvironment(config, env)
  if (!config.providers.copilot.enabled && !config.providers.deepseek.enabled) {
    throw new Error("At least one model provider must be enabled")
  }
  return config
}

function mergeLayer(
  base: Omit<RuntimeConfig, "environment" | "source">,
  overlay?: z.infer<typeof layerSchema>,
): Omit<RuntimeConfig, "environment" | "source"> {
  return {
    providers: {
      copilot: { ...base.providers.copilot, ...overlay?.providers?.copilot },
      deepseek: { ...base.providers.deepseek, ...overlay?.providers?.deepseek },
    },
    catalog: { ...base.catalog, ...overlay?.catalog },
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
  config.catalog.enabled =
    parseBoolean("COPILOT_API_CATALOG_ENABLED", env.COPILOT_API_CATALOG_ENABLED)
    ?? config.catalog.enabled
  if (env.COPILOT_API_DEEPSEEK_BASE_URL !== undefined) {
    config.providers.deepseek.baseUrl = z
      .url()
      .parse(env.COPILOT_API_DEEPSEEK_BASE_URL)
  }
  if (env.COPILOT_API_CATALOG_OUTPUT_FILE !== undefined) {
    if (!path.isAbsolute(env.COPILOT_API_CATALOG_OUTPUT_FILE)) {
      throw new Error("COPILOT_API_CATALOG_OUTPUT_FILE must be absolute")
    }
    config.catalog.outputFile = path.normalize(
      env.COPILOT_API_CATALOG_OUTPUT_FILE,
    )
  }
  if (env.COPILOT_API_CATALOG_CUSTOM_FILES !== undefined) {
    const files = z
      .array(z.string().min(1))
      .parse(JSON.parse(env.COPILOT_API_CATALOG_CUSTOM_FILES))
    if (files.some((file) => !path.isAbsolute(file))) {
      throw new Error(
        "COPILOT_API_CATALOG_CUSTOM_FILES entries must be absolute",
      )
    }
    config.catalog.customFiles = files.map((file) => path.normalize(file))
  }
}
