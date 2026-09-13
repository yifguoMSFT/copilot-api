import { describe, expect, mock, test } from "bun:test"

import {
  defaultProviderConfig,
  type RuntimeConfig,
} from "../src/lib/runtime-config"
import { bootstrapProviders, type ProviderBootstrap } from "../src/start"

const createDependencies = (): ProviderBootstrap & {
  cacheModels: ReturnType<typeof mock>
  cacheVSCodeVersion: ReturnType<typeof mock>
  ensureCodexAuthDir: ReturnType<typeof mock>
  ensurePaths: ReturnType<typeof mock>
  setupCopilotToken: ReturnType<typeof mock>
  setupGitHubToken: ReturnType<typeof mock>
} => ({
  cacheModels: mock(() => Promise.resolve()),
  cacheVSCodeVersion: mock(() => Promise.resolve()),
  ensureCodexAuthDir: mock(() => Promise.resolve("/tmp/codex-auth")),
  ensurePaths: mock(() => Promise.resolve()),
  setupCopilotToken: mock(() => Promise.resolve()),
  setupGitHubToken: mock(() => Promise.resolve()),
})

const configWith = (
  providers: Partial<RuntimeConfig["providers"]>,
): RuntimeConfig => ({
  environment: "test",
  providers: { ...defaultProviderConfig().providers, ...providers },
})

describe("provider bootstrap", () => {
  test("boots a Codex-only install without touching GitHub or Copilot", async () => {
    const dependencies = createDependencies()
    const config = configWith({
      codex: {
        ...defaultProviderConfig().providers.codex,
        enabled: true,
        models: ["codex-test-model"],
      },
      copilot: { enabled: false, stripReasoningContentForGpt: true },
    })

    await bootstrapProviders(config, {}, dependencies)

    expect(dependencies.ensureCodexAuthDir).toHaveBeenCalledTimes(1)
    expect(dependencies.ensurePaths).not.toHaveBeenCalled()
    expect(dependencies.setupGitHubToken).not.toHaveBeenCalled()
    expect(dependencies.setupCopilotToken).not.toHaveBeenCalled()
    expect(dependencies.cacheModels).not.toHaveBeenCalled()
    expect(dependencies.cacheVSCodeVersion).not.toHaveBeenCalled()
  })

  test("keeps the existing Copilot bootstrap path untouched", async () => {
    const dependencies = createDependencies()
    const config = configWith({
      copilot: { enabled: true, stripReasoningContentForGpt: true },
    })

    await bootstrapProviders(config, {}, dependencies)

    expect(dependencies.ensureCodexAuthDir).not.toHaveBeenCalled()
    expect(dependencies.ensurePaths).toHaveBeenCalledTimes(1)
    expect(dependencies.cacheVSCodeVersion).toHaveBeenCalledTimes(1)
    expect(dependencies.setupGitHubToken).toHaveBeenCalledTimes(1)
    expect(dependencies.setupCopilotToken).toHaveBeenCalledTimes(1)
    expect(dependencies.cacheModels).toHaveBeenCalledTimes(1)
  })

  test("uses an explicitly provided GitHub token instead of prompting", async () => {
    const dependencies = createDependencies()
    const config = configWith({
      copilot: { enabled: true, stripReasoningContentForGpt: true },
    })

    await bootstrapProviders(
      config,
      { githubToken: "provided-token" },
      dependencies,
    )

    expect(dependencies.setupGitHubToken).not.toHaveBeenCalled()
    expect(dependencies.setupCopilotToken).toHaveBeenCalledTimes(1)
  })

  test("creates Codex storage alongside an enabled Copilot provider", async () => {
    const dependencies = createDependencies()
    const config = configWith({
      codex: {
        ...defaultProviderConfig().providers.codex,
        enabled: true,
        models: ["codex-test-model"],
      },
    })

    await bootstrapProviders(config, {}, dependencies)

    expect(dependencies.ensureCodexAuthDir).toHaveBeenCalledTimes(1)
    expect(dependencies.cacheModels).toHaveBeenCalledTimes(1)
  })
})

test("publishes antigravity model only when antigravity is enabled", async () => {
  const { antigravityCodexModels } = await import("../src/services/antigravity/models")
  expect(antigravityCodexModels.length).toBeGreaterThan(0)
  expect(antigravityCodexModels[0].slug).toBe("gemini-3.8-flash-tiered")
})
