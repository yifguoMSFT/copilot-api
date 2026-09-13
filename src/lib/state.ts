import type { AntigravityCredentialStore } from "~/services/antigravity/auth"
import type { CodexAuthManager } from "~/services/codex/auth-manager"
import type { ModelsResponse } from "~/services/copilot/get-models"

import type { PublishedModels } from "./model-sources"
import type { RuntimeConfig } from "./runtime-config"

export interface State {
  /** Overrides the shared Codex auth manager; used by tests and tooling. */
  codexAuthManager?: CodexAuthManager
  antigravityCredentialStore?: AntigravityCredentialStore
  githubToken?: string
  copilotToken?: string

  accountType: string
  models?: ModelsResponse
  vsCodeVersion?: string
  runtimeConfig?: RuntimeConfig
  /** Resolved public model ids, including source suffixes while Codex is on. */
  publishedModels?: PublishedModels

  manualApprove: boolean
  rateLimitWait: boolean
  responsesStableItemIds: boolean
  showToken: boolean
  verbose: boolean

  // Rate limiting configuration
  rateLimitSeconds?: number
  lastRequestTimestamp?: number
}

export const state: State = {
  accountType: "individual",
  manualApprove: false,
  rateLimitWait: false,
  responsesStableItemIds: true,
  showToken: false,
  verbose: false,
}
