# Compaction model routing: implementation and test plan

## Goal

Allow an operator to route Codex compaction requests to a configured model, such as `gpt-6-luna`. Control the feature through the existing JSON configuration system and disable it by default. Ordinary Responses requests continue using their requested model.

This document is a plan; it does not enable or implement the feature.

## Captured request format

The October 5, 2026 manual compaction capture establishes the format used by the installed Codex app:

- Trace: `8c5b08dc-1751-4b54-b3e9-9127a5a0a3bc` in `C:\Users\yifguo\logs\requests.sqlite`.
- Incoming endpoint: `POST /v1/responses`; upstream endpoint: `POST https://api.githubcopilot.com/responses`.
- Requested model: `gpt-6.1-sol`; `stream: true`; `store: false`.
- The JSON-valued `x-codex-turn-metadata` header contains the following fields. The same serialized metadata appears in `client_metadata["x-codex-turn-metadata"]` in the body.

```json
{
  "request_kind": "compaction",
  "compaction": {
    "trigger": "manual",
    "reason": "user_requested",
    "implementation": "responses",
    "phase": "standalone_turn",
    "strategy": "memento"
  }
}
```

The final input is a user message starting with `You are performing a CONTEXT CHECKPOINT COMPACTION`. That text also occurs in historical messages in this capture, so searching the entire body for the phrase would misclassify requests.

Both boundaries returned HTTP 200 and captured identical request bytes. The dump records response headers, not response bodies or stream completion.

## Configuration contract

Extend the version 1 configuration layer with a `compaction` object, supported in both `defaults` and named `environments`:

```json
{
  "version": 1,
  "defaults": {
    "compaction": {
      "enabled": false,
      "model": "gpt-6-luna"
    }
  },
  "environments": {
    "luna-compaction": {
      "compaction": {
        "enabled": true
      }
    }
  }
}
```

Load this file using the existing `--config` option or `COPILOT_API_CONFIG`. Select the named environment through the existing environment selector. Merely placing a file named `config.json` in the working directory does not currently load it.

| Setting | Behavior |
| --- | --- |
| `compaction.enabled` | Boolean; built-in default is `false`. |
| `compaction.model` | Optional model identifier; required after merging when enabled. There is no implicit target model. |
| Missing `compaction` | Feature remains disabled; older configuration files stay valid. |
| Environment overlay | Merge individual fields over defaults, following existing config precedence. |

Use strict schema validation for keys and types. Reject empty or whitespace-only models; normalize surrounding whitespace. A supplied invalid model value is a configuration error even when disabled. Validate the required model after merging, so an environment can inherit the model from defaults. Add no new CLI flag or feature-specific environment variable.

When enabled, validate the effective target through `resolveModelRoute` after existing provider environment overrides have been applied. Reject a disabled target provider or an unconfigured `deepseek-*` target at startup. Existing routing does not establish whether a Copilot model is available to the account; upstream rejection remains authoritative and must be surfaced. Configuration changes take effect on restart.

## Detection and routing behavior

Apply the override only to the existing POST Responses routes (`/responses` and `/v1/responses`).

1. Parse and validate the request using the existing handler. Missing or invalid request models retain their existing behavior; the override does not repair malformed requests.
2. If the feature is disabled or runtime configuration is absent, use the existing model routing unchanged.
3. Read `x-codex-turn-metadata` from the request headers. When present, it is authoritative. Safely parse it as a JSON object and require the exact value `request_kind === "compaction"`.
4. Only when that header is absent, inspect the serialized metadata string at `payload.client_metadata["x-codex-turn-metadata"]` using the same rule.
5. Missing, malformed, non-object, or differently marked metadata means no override. A malformed header must not fall back to conflicting body metadata. Do not reject an otherwise valid request because optional detection metadata is malformed.
6. For a match, select `compaction.model` before calling `resolveModelRoute`. Apply existing alias resolution, provider selection, and provider-specific payload validation to the selected model.
7. Replace only the top-level `model` with the resolved upstream model. If it already equals the payload model, preserve the original body bytes. Otherwise serialize the parsed payload once, preserving every other JSON value.

Use `request_kind` as the discriminator; do not require the captured manual trigger, phase, or strategy. This permits automatic compaction carrying the same discriminator. Do not infer compaction from prompt text or the mere presence of a `compaction` object.

Preserve session/thread headers, prompt cache keys, client metadata, reasoning options, tools, history, and encrypted content under the existing provider behavior. Preserve the original request body for diagnostics and incoming dumps. Keep existing transport header handling so a rewritten body does not forward a stale content length.

Do not rewrite response model fields, buffer the stream, strip ciphertext, retry against the original model, or change stream normalization. Upstream errors follow the existing error path. The override is per request and does not update the session's model or global mutable routing state.

## Implementation steps

1. **Configuration — `src/lib/runtime-config.ts`.** Extend the layer schema, `RuntimeConfig`, built-in defaults, field-level merge, and post-merge validation. Use `compaction: { enabled: boolean; model?: string }` in runtime configuration. Update typed fixtures and the legacy config fallback in the Responses handler to explicitly disable the feature.
2. **Detection — `src/lib/compaction-routing.ts` (new).** Add a small, pure helper accepting request headers and the parsed payload. Return whether the request has the explicit discriminator. Keep metadata parsing defensive and separate from provider routing.
3. **Request routing — `src/routes/responses/handler.ts`.** Pass headers into model resolution, choose the effective model before provider resolution, and return the original requested model plus the resolved target for accurate logging. Retain DeepSeek validation when the effective provider is DeepSeek. Reuse the existing service adapters.
4. **Observability.** For an enabled matching request, log original model, configured target, resolved upstream model, provider, and metadata source. Update the request model label to show the actual destination. Do not add prompt, ciphertext, or full metadata logging. Existing linked dumps should show the original incoming model and effective upstream model; differing body hashes are expected when overridden.
5. **Documentation.** Add configuration usage and restart behavior to `README.md`, and explain the expected model/body difference in `docs/troubleshoot/request-dumps.md`.

No change is required to the captured endpoint or model alias table. Dedicated `/responses/compact` support and WebSocket support are outside this feature. Such requests must not be redirected to an incompatible normal Responses endpoint.

## Automated test plan

Use Bun tests and synthetic fixtures matching the captured structure, with placeholder ciphertext. Do not commit the private dump or replay its full history as a unit-test fixture.

| Area | Required checks |
| --- | --- |
| Configuration defaults | No config, old config, and absent `compaction` produce disabled routing. Supplying a model alone does not enable it. |
| Config merging | Defaults supply the model and an environment enables it; an environment can disable an enabled default or replace its model. |
| Config validation | Reject wrong types, unknown keys, blank models, and enabled configuration without a merged model. Reject disabled target providers and unknown DeepSeek targets. Accept a disabled config without a model. |
| Metadata detection | Match the captured header and body-only fallback; match automatic compaction with `request_kind: "compaction"`. |
| Nonmatches | Absent metadata, normal turn metadata, malformed JSON, arrays, null, non-string body metadata, and a compaction object without the discriminator do not match. |
| Metadata precedence | Normal or malformed header plus compaction body metadata does not override; compaction header plus normal body metadata does override. |
| Historical text | Compaction prompt text anywhere in an ordinary request, including the final message, does not override without explicit metadata. |
| Enabled route | Both Responses paths send the configured resolved target to a mock upstream. Verify aliases and configured provider routing. DeepSeek targets retain existing payload restrictions. |
| Disabled route | A genuine compaction request retains existing model/alias behavior and body preservation. |
| Preservation | For an override, deep-compare payloads after excluding only top-level `model`; verify encrypted strings, unknown fields, nested model fields, and session/thread headers. Verify no stale content length. |
| No-op target | A target resolving to the existing payload model preserves original bytes, including whitespace. |
| Isolation | A compaction request followed by or concurrent with a normal request leaves the normal request's model unchanged. |
| Error and stream behavior | Mock upstream errors remain visible without retry; SSE is streamed with existing normalization behavior and response model fields remain unchanged. |
| Dumps | Incoming/upstream records retain their shared trace, show original/effective models, and preserve all non-model body values. Capture still works when routing is disabled. |

Extend `tests/runtime-config.test.ts`, `tests/responses-route.test.ts`, and `tests/request-dump.test.ts`. Add `tests/compaction-routing.test.ts` for detection and precedence. Reuse existing mock upstream and state-cleanup patterns.

Run focused tests during implementation, then these completion checks:

```powershell
bun test tests/runtime-config.test.ts tests/compaction-routing.test.ts tests/responses-route.test.ts tests/request-dump.test.ts
bun run typecheck
bun run lint
bun test
bun run build
```

## Live verification and acceptance

1. Restart with the feature disabled and dumping enabled. Run a normal turn and manual `/compact`; confirm both retain their requested model.
2. Enable the feature with `model: "gpt-6-luna"`, restart, and run manual `/compact` from a Sol session. Verify explicit compaction metadata, the incoming Sol model, the upstream Luna model, matching session/thread headers, and unchanged non-model JSON values.
3. Confirm Codex receives a complete summary, then send a normal follow-up. Verify it routes to the session's original model and successfully uses the compacted context. This checks cross-model encrypted-state compatibility, which the original HTTP 200 dump does not establish.
4. Repeat with an Astra session. Exercise automatic compaction when practical and confirm its actual metadata; report it as unverified if no automatic capture is available.
5. Disable the feature, restart, and confirm compaction returns to the session's requested model.

The implementation is complete when configuration is opt-in, the automated checks pass, and live manual compaction plus subsequent original-model continuation succeeds. Record automatic-compaction coverage separately. If the configured target cannot accept existing reasoning settings, history, or encrypted state, surface that upstream failure and document the limitation; any payload transformation requires a separate, evidenced change.
