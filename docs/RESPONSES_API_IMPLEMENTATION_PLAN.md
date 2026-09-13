# Native Responses API Proxy Plan

## Objective

Add Codex-compatible `POST /responses` and `POST /v1/responses` endpoints that
proxy GitHub Copilot's native Responses endpoint:

```text
Codex
  -> http://localhost:4141/v1/responses
  -> https://api.githubcopilot.com/responses
```

Preserve the request body and upstream response body, including SSE framing,
without translating through Chat Completions. This retains native reasoning,
tool, usage, status, and lifecycle data.

The implementation should reuse the project's existing authentication, token
refresh, account routing, Copilot headers, rate limiting, manual approval,
proxy configuration, server lifecycle, and error logging. It should add only
the thin transport layer that is currently missing.

## Key Decision

Use GitHub Copilot's native `POST /responses` endpoint instead of implementing a
Responses-to-Chat-Completions adapter.

This supersedes the earlier translation design. Translation would introduce a
large compatibility surface and necessarily lose Responses-only information.
Direct passthrough is smaller and more faithful when the selected Copilot model
supports the native endpoint.

The endpoint has not yet been validated with a live inference request in this
workspace. The first milestone is a minimal non-streaming probe. If GitHub
rejects the native payload or existing headers, stop and reassess before adding
more code around an unverified contract.

## Existing Logic to Reuse

| Concern | Existing owner | Reuse strategy |
| --- | --- | --- |
| GitHub login | `src/lib/token.ts` | No change |
| Copilot token exchange and refresh | `src/lib/token.ts` | Read the latest `state.copilotToken` for every request |
| Runtime state | `src/lib/state.ts` | Reuse `state`; add no Responses token storage |
| Account-aware host selection | `copilotBaseUrl` in `src/lib/api-config.ts` | Build `${copilotBaseUrl(state)}/responses` |
| Authorization and client metadata | `copilotHeaders` in `src/lib/api-config.ts` | Reuse directly; never forward caller authorization upstream |
| Environment proxy | `src/lib/proxy.ts` and startup | Add no endpoint-specific proxy code |
| Local throttling | `checkRateLimit` in `src/lib/rate-limit.ts` | Call before the upstream request |
| Manual approval | `awaitApproval` in `src/lib/approval.ts` | Call when enabled |
| Local/network error envelope | `forwardError` in `src/lib/error.ts` | Reuse only when no upstream response exists |
| Hono routing | Existing `route.ts` files | Follow the same thin route wrapper |
| Build and validation | Existing Bun scripts | Reuse focused and repository-wide commands |

Do not reuse `createChatCompletions`, Chat Completions payload types, token
counting, output-token defaults, or translation code under
`src/routes/messages/`. Those abstractions alter protocol data and would make
the proxy less compatible.

## Proposed File Layout

```text
src/services/copilot/create-responses.ts
src/routes/responses/handler.ts
src/routes/responses/route.ts
tests/
  create-responses.test.ts
  responses-route.test.ts
```

No Responses schema, request translator, response translator, or streaming
state machine is needed. GitHub owns the native wire contract and Codex already
speaks it.

## Request and Response Flow

Add `createResponses(body, signal)` beside the existing Copilot services. It
should:

1. Fail locally when `state.copilotToken` is absent.
2. POST to `${copilotBaseUrl(state)}/responses`.
3. Build headers with `copilotHeaders(state)`.
4. Forward the request body unchanged.
5. Pass the request cancellation signal to `fetch`.
6. Return the upstream `Response` for every HTTP status.

Returning the raw `Response` is deliberate. Throwing `HTTPError` for non-2xx
responses would pass the body through `forwardError`, which currently wraps and
stringifies upstream errors.

The handler should run rate limiting and optional manual approval, read the body
without changing its JSON representation, call `createResponses`, and return a
new response backed by the upstream body stream.

Do not inject defaults, rename fields, validate against a local subset, or strip
unknown fields. GitHub should validate the native request, and Codex should
receive GitHub's original response.

Forward only response headers needed by clients and streaming behavior:

- `content-type`
- `cache-control`
- `openai-processing-ms`, when present
- `x-request-id`, when present

Let the runtime calculate transfer framing. Do not forward `connection`,
`transfer-encoding`, or `content-length`.

Use one raw-body path for both JSON and SSE. Do not parse SSE with
`fetch-event-stream` or reconstruct it with Hono's `streamSSE`; doing so risks
changing event framing or dropping fields understood by newer Codex versions.

The caller's local `Authorization` header is ignored. Upstream authorization
always comes from the refreshed Copilot token in `state`.

If live validation proves that `X-Initiator` is required, extract one shared
helper in `src/lib/api-config.ts` and use it from both Chat Completions and
Responses. Do not duplicate initiator logic or parse the full Responses schema
speculatively.

## Handler and Routing

Follow the existing thin route-wrapper pattern:

1. Run `checkRateLimit(state)`.
2. Run `awaitApproval()` when `state.manualApprove` is enabled.
3. Read and forward the request body without JSON reserialization.
4. Call `createResponses` with the request cancellation signal.
5. Return the upstream status, body stream, and safe response headers.

Mount the same route object at both paths:

```ts
server.route("/responses", responseRoutes)
server.route("/v1/responses", responseRoutes)
```

Codex uses the versioned route with
`base_url = "http://localhost:4141/v1"`. The unversioned route matches the
project's existing OpenAI-compatible route layout.

## Error Handling

Handle two distinct error classes:

1. Return upstream HTTP responses unchanged for every status, including 4xx,
   429, and 5xx responses.
2. Use the existing `forwardError` path for failures that occur before an
   upstream response exists, such as a missing token, body-read failure, or
   network error.

Do not log request or response bodies by default. Responses traffic can contain
source code, tool output, and reasoning data. Never expose GitHub or Copilot
tokens in payloads, responses, or normal logs.

## Test Plan

### Service tests

- uses the account-aware Copilot `/responses` URL
- replaces caller authorization with the current Copilot token
- reuses Copilot client metadata headers
- sends request bytes unchanged
- propagates the cancellation signal
- returns JSON and SSE responses without parsing
- returns upstream 400, 401, 429, and 5xx responses instead of throwing
- fails clearly when no Copilot token exists

### Route integration tests

- `/responses` and `/v1/responses` are registered
- unknown request fields and original request bytes are preserved
- non-stream status, body, and content type are preserved
- SSE body, event framing, and content type are preserved
- upstream error status and body are preserved
- hop-by-hop and stale body-size headers are removed
- rate limiting and manual approval remain active
- cancellation reaches the upstream fetch
- local failures retain the existing local error envelope

### Regression tests

- Chat Completions behavior remains unchanged
- Anthropic Messages behavior remains unchanged
- Models and Embeddings behavior remains unchanged
- refreshed Copilot tokens are used by subsequent Responses requests

## Implementation Sequence

### Phase 0: Prove the upstream contract

Use the existing authenticated runtime to send one minimal non-stream request:

```json
{
  "model": "<responses-capable-model>",
  "input": "Reply with OK.",
  "stream": false
}
```

Confirm that GitHub returns a Responses object, accepts existing
`copilotHeaders(state)`, and requires no first-party-only credential or header.
This probe may consume a Copilot request, so report status and object type
without printing credentials or full generated content.

Do not test end-to-end streaming yet; that requires the route added in Phase 2.

### Phase 1: Service

1. Add `createResponses` using `copilotBaseUrl`, `copilotHeaders`, and `state`.
2. Add focused URL, header, body, signal, status, and missing-token tests.
3. Run `bun test tests/create-responses.test.ts` and `bun run typecheck`.

### Phase 2: Routes

1. Add the thin handler and route wrapper.
2. Mount both route aliases.
3. Add JSON, SSE, error, policy, header, and cancellation route tests.
4. Repeat the live probe with `stream: true` and verify incremental event
  delivery and terminal behavior through Bun, srvx, and Hono.
5. Run `bun test tests/responses-route.test.ts`, `bun run typecheck`, and
   `bun run lint`.

### Phase 3: Codex integration

1. Start the server and verify `/v1/models` and `/v1/responses`.
2. Configure the installed Codex runtime:

   ```toml
   model_provider = "copilot-api"
   model = "<supported-model-id>"

   [model_providers.copilot-api]
   name = "Copilot API"
   base_url = "http://localhost:4141/v1"
   wire_api = "responses"
   experimental_bearer_token = "dummy"
   ```

3. Validate plain text, streaming, a function call, function output, and a normal
  Codex coding turn.

### Phase 4: Documentation and regression

1. Document the endpoint and tested Codex configuration in `README.md`.
2. State that model support is controlled by GitHub Copilot; this proxy does not
  convert unsupported models.
3. Run `bun test`, `bun run typecheck`, `bun run lint:all`, and `bun run build`.

## Acceptance Criteria

- Codex completes a text turn through `http://localhost:4141/v1` with
  `wire_api = "responses"`.
- A streamed response arrives incrementally without protocol translation.
- A function-call round trip completes and continues after tool output.
- Native reasoning and tool items are neither discarded nor fabricated.
- Upstream success and error status, body, and content type are preserved.
- The caller's dummy bearer token is never sent to GitHub.
- GitHub and Copilot tokens never reach clients or normal logs.
- Existing tests, typecheck, lint, and build pass.

## Main Risks

1. **Endpoint entitlement or model support:** `/responses` may be limited by
  Copilot plan or model. Prove it in Phase 0 and preserve GitHub's error.
2. **Integration metadata:** GitHub may require a Responses-specific integration
  ID, intent, or initiator. Add only headers demonstrated by the live probe and
  implement shared header logic rather than duplication.
3. **Stream buffering:** Bun, srvx, or Hono could transform the body. Verify
  incremental delivery with both a focused test and live probe.
4. **Codex configuration drift:** experimental authentication settings can
  change. Document the exact installed runtime version used for validation.
5. **Private API stability:** keep the proxy thin so upstream protocol changes
  pass through without requiring local schema or translation updates.

## Out of Scope

- Responses-to-Chat-Completions translation
- Synthesizing Responses SSE lifecycle events
- Local response storage or `previous_response_id` emulation
- Local Open Responses schema validation
- Rewriting reasoning, tool, image, or hosted-tool items
- Selecting fallback models when GitHub rejects `/responses`
- Exposing the Copilot bearer token directly to Codex