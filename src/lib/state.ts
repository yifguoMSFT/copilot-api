import type { CodexAuthManager } from "~/services/codex/auth-manager"
import type { ModelsResponse } from "~/services/copilot/get-models"

import type { RuntimeConfig } from "./runtime-config"

export interface State {
  /** Overrides the shared Codex auth manager; used by tests and tooling. */
  codexAuthManager?: CodexAuthManager
  githubToken?: string
  copilotToken?: string

  accountType: string
  models?: ModelsResponse
  vsCodeVersion?: string
  runtimeConfig?: RuntimeConfig

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
