import { realpathSync } from "node:fs"
import fs from "node:fs/promises"
import path from "node:path"
import { z } from "zod"

import { resolveModelRoute } from "./model-routing"

const providerSchema = z.strictObject({ enabled: z.boolean().optional() })
const deepSeekSchema = z.strictObject({
  enabled: z.boolean().optional(),
  baseUrl: z.url().optional(),
  apiKeyEnv: z.string().min(1).optional(),
  models: z.array(z.string().min(1)).min(1).optional(),
})
const catalogSchema = z.strictObject({
  enabled: z.boolean().optional(),
  customFiles: z.array(z.string().min(1)).optional(),
  disabledModels: z.array(z.string().trim().min(1)).optional(),
  outputFile: z.string().min(1).optional(),
})
const compactionSchema = z.strictObject({
  enabled: z.boolean().optional(),
  model: z.string().trim().min(1).optional(),
})
const layerSchema = z.strictObject({
  providers: z
    .strictObject({
      copilot: providerSchema.optional(),
      deepseek: deepSeekSchema.optional(),
    })
    .optional(),
  catalog: catalogSchema.optional(),
  compaction: compactionSchema.optional(),
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
    copilot: { enabled: boolean }
    deepseek: {
      enabled: boolean
      baseUrl: string
      apiKeyEnv: string
      models: Array<string>
    }
  }
  catalog: {
    enabled: boolean
    customFiles: Array<string>
    disabledModels: Array<string>
    outputFile: string
  }
  compaction: { enabled: boolean; model?: string }
}

interface LoadRuntimeConfigOptions {
  configPath?: string
  environment?: string
  cwd?: string
  packageRoot?: string
  env?: Record<string, string | undefined>
}

const defaults = (
  packageRoot: string,
): Omit<RuntimeConfig, "environment" | "source"> => ({
  compaction: { enabled: false },
  providers: {
    copilot: { enabled: true },
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
    disabledModels: [],
    outputFile: path.join(packageRoot, "codex-models.json"),
  },
})

export async function loadRuntimeConfig(
  options: LoadRuntimeConfigOptions = {},
): Promise<RuntimeConfig> {
  const env = options.env ?? process.env
  const cwd = options.cwd ?? process.cwd()
  const packageRoot = resolvePackageRoot(options.packageRoot)
  const selectedPath = options.configPath ?? env.COPILOT_API_CONFIG
  const environment = options.environment ?? env.COPILOT_API_ENV ?? "default"
  const file = await readConfigFile(cwd, packageRoot, selectedPath)
  const source = file?.source
  let layer = defaults(packageRoot)

  if (file !== undefined) {
    const parsed = fileSchema.parse(JSON.parse(file.content))
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
  validateCompactionConfig(config)
  return config
}

function resolvePackageRoot(override?: string): string {
  return (
    override
    ?? path.resolve(
      path.dirname(realpathSync(process.argv[1] ?? process.execPath)),
      "..",
    )
  )
}

async function readConfigFile(
  cwd: string,
  packageRoot: string,
  selectedPath?: string,
): Promise<{ source: string; content: string } | undefined> {
  const source =
    selectedPath === undefined ?
      path.join(packageRoot, "config.json")
    : path.resolve(cwd, selectedPath)
  try {
    return { source, content: await fs.readFile(source, "utf8") }
  } catch (error) {
    if (
      selectedPath === undefined
      && (error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return undefined
    }
    throw error
  }
}

function validateCompactionConfig(config: RuntimeConfig): void {
  if (!config.compaction.enabled) return
  if (config.compaction.model === undefined) {
    throw new Error("compaction.model is required when compaction is enabled")
  }
  resolveModelRoute(config.compaction.model, config)
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
    compaction: { ...base.compaction, ...overlay?.compaction },
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
