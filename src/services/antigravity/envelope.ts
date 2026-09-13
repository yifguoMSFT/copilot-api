import { randomUUID } from "node:crypto"
import type { JsonObject } from "~/services/generate-content/convert"

export const DEFAULT_REQUEST_TYPE = "agent"
export const DEFAULT_USER_AGENT = "antigravity"

export interface CloudCodeEnvelopeOptions {
  model: string
  project: string
  requestBody: JsonObject
  sessionId: string
  requestId?: string
  requestType?: string
  userAgent?: string
}

export function buildCloudCodeEnvelope(
  options: CloudCodeEnvelopeOptions,
): JsonObject {
  return {
    model: options.model,
    project: options.project,
    request: {
      ...options.requestBody,
      sessionId: options.sessionId,
    },
    requestId: options.requestId ?? `agent-${randomUUID()}`,
    requestType: options.requestType ?? DEFAULT_REQUEST_TYPE,
    userAgent: options.userAgent ?? DEFAULT_USER_AGENT,
  }
}
