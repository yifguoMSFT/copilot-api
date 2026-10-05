import { realpathSync } from "node:fs"
import fs from "node:fs/promises"
import path from "node:path"
import { z } from "zod"

import {
  assertCodexProfileName,
  DEFAULT_CODEX_PROFILE,
} from "~/lib/codex-credentials"
import {
  assertModelRoutingConflicts,
  resolveModelRoute,
} from "~/lib/model-routing"

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
      codex: codexSchema.optional(),
      copilot: providerSchema.optional(),
      deepseek: deepSeekSchema.optional(),
      antigravity: z
        .strictObject({
          enabled: z.boolean().optional(),
          credentialPath: z.string().min(1).optional(),
          oauthClientSecret: z.string().trim().min(1).optional(),
        })
        .optional(),
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
    antigravity: {
      enabled: boolean
      credentialPath?: string
      oauthClientSecret?: string
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

/** Built-in provider defaults, also used when no configuration was loaded. */
export const defaultProviderConfig = (
  packageRoot = resolvePackageRoot(),
): Omit<RuntimeConfig, "environment" | "source"> => ({
  compaction: { enabled: false },
  providers: {
    codex: {
      authProfile: DEFAULT_CODEX_PROFILE,
      baseUrl: `${CODEX_UPSTREAM_ORIGIN}/backend-api/codex`,
      enabled: false,
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
    antigravity: {
      enabled: false,
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
  let layer = defaultProviderConfig(packageRoot)

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
  if (
    !config.providers.copilot.enabled
    && !config.providers.deepseek.enabled
    && !config.providers.codex.enabled
    && !config.providers.antigravity.enabled
  ) {
    throw new Error("At least one model provider must be enabled")
  }
  assertCodexProvider(config.providers.codex)
  assertModelRoutingConflicts(config)
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
      codex: { ...base.providers.codex, ...overlay?.providers?.codex },
      copilot: { ...base.providers.copilot, ...overlay?.providers?.copilot },
      deepseek: { ...base.providers.deepseek, ...overlay?.providers?.deepseek },
      antigravity: {
        ...base.providers.antigravity,
        ...overlay?.providers?.antigravity,
      },
    },
    catalog: { ...base.catalog, ...overlay?.catalog },
    compaction: { ...base.compaction, ...overlay?.compaction },
  }
}

/**
 * Rejects a Codex provider that could not serve requests safely: an upstream that is not the verified origin, or a profile name that
 * could escape the credential directory. An omitted model list is valid and
 * means "every official catalog model"; the catalog itself is loaded later.
 */
function assertCodexProvider(codex: RuntimeConfig["providers"]["codex"]): void {
  if (!codex.enabled) return

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
  config.catalog.enabled =
    parseBoolean("COPILOT_API_CATALOG_ENABLED", env.COPILOT_API_CATALOG_ENABLED)
    ?? config.catalog.enabled
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
  config.providers.antigravity.enabled =
    parseBoolean(
      "COPILOT_API_ANTIGRAVITY_ENABLED",
      env.COPILOT_API_ANTIGRAVITY_ENABLED,
    ) ?? config.providers.antigravity.enabled
  if (env.COPILOT_API_ANTIGRAVITY_CREDENTIAL_PATH !== undefined) {
    config.providers.antigravity.credentialPath =
      env.COPILOT_API_ANTIGRAVITY_CREDENTIAL_PATH
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
