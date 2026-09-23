# Copilot API Project Context

Updated: 2026-09-23. Based on the current checkout at `E:\workshop\copilot-api` (branch `main`, HEAD `7471bea`, committed 2026-09-15) and its source, tests, configuration, and documentation. HEAD is unchanged since the previous context refresh; the working tree contains documentation/planning changes. This is a project orientation document; historical experiment results are attributed to their reports rather than treated as fresh validation.

## Purpose and stack

`copilot-api` is a reverse-engineered GitHub Copilot HTTP proxy with OpenAI Chat Completions, OpenAI Responses, embeddings, and Anthropic Messages interfaces. This checkout also supports routing configured Responses models to DeepSeek. Typical clients include Codex and Claude Code. The default port is `4141`.

- Package: `copilot-api`, version `0.7.1`; upstream repository: <https://github.com/ericc-ch/copilot-api>.
- Development runtime: Bun 1.2 or newer; language: strict TypeScript with ES modules.
- HTTP: Hono routing and middleware, served by `srvx`; upstream requests use `fetch`.
- CLI: `citty`; logging/prompts: `consola`; validation: Zod; token estimates: `gpt-tokenizer`.
- Streaming: native response streams for Responses, `fetch-event-stream` and Hono SSE helpers for Chat Completions/Messages.
- Build: `tsdown`, targeting Node/ES2022 ESM with source maps. The executable maps to `dist/main.js`.
- Copilot requires a GitHub account with an active subscription. A DeepSeek-only configuration can skip GitHub authentication.

## Repository map

| Location | Responsibility |
| --- | --- |
| `src/main.ts` | CLI entry point: `start`, `auth`, `check-usage`, `debug`. |
| `src/start.ts` | Configuration, provider initialization, catalog refresh, authentication, optional Claude Code setup, server startup. |
| `src/server.ts` | Hono app, CORS, health response, route registration. |
| `src/routes/chat-completions/` | OpenAI chat handler, aliases, token estimation, JSON/SSE responses. |
| `src/routes/messages/` | Anthropic request/response types, translation, streaming translation, token counting. |
| `src/routes/responses/` | Provider selection, native Responses forwarding, Copilot SSE item-ID normalization. |
| `src/routes/models/`, `embeddings/`, `usage/`, `token/` | Model listing, embedding requests, quota lookup, current token endpoint. |
| `src/services/copilot/` | Copilot models, chat completions, embeddings, and native Responses transport. |
| `src/services/deepseek/create-responses.ts` | Separate DeepSeek Responses transport and authentication. |
| `src/services/github/` | Device login, access-token polling, user lookup, Copilot token and usage lookup. |
| `src/lib/runtime-config.ts` | Strict versioned JSON configuration, layer merging, path resolution, environment overrides. |
| `src/lib/model-routing.ts`, `model-aliases.ts` | Provider routing and model alias definitions. |
| `src/lib/codex-models.ts` | Fetch, cache, merge, and atomically write the Codex model catalog. |
| `src/providers/deepseek/models.ts` | Bundled metadata for supported DeepSeek catalog entries. |
| `src/lib/state.ts`, `token.ts`, `paths.ts`, `api-config.ts` | Process state, token lifecycle/storage, application paths, upstream identity headers. |
| `src/lib/proxy-headers.ts`, `proxy.ts` | HTTP header filtering and optional outbound environment proxy setup. |
| `src/lib/error.ts`, `rate-limit.ts`, `approval.ts` | Error envelopes, request pacing, interactive request approval. |
| `tests/` | Bun tests for translations, transports, routing, catalogs, configuration, and stream compatibility. |
| `pages/index.html` | Static usage dashboard, deployed separately through GitHub Pages. |
| `docs/API_RESPONSE_STATISTICS_SQLITE_DESIGN.md` | Draft model/session usage-metrics proposal; no tracking implementation exists yet. |
| `docs/`, root plans/reports, `kanban-archive/` | Design rationale, troubleshooting, experiment evidence, and planning artifacts. |

## Startup and authentication

`src/start.ts` performs these steps before serving requests:

1. Apply CLI options to the shared `state`, optionally initialize outbound proxy support, and load runtime configuration.
2. Require the configured DeepSeek API-key environment variable when DeepSeek is enabled.
3. Create Copilot application/token paths when Copilot is enabled.
4. Refresh the Codex catalog when enabled. Refresh failures are logged and do not abort startup.
5. For Copilot, cache the VS Code version, obtain the GitHub token, exchange it for a Copilot token, schedule refresh, and cache upstream models.
6. Optionally prompt for Claude Code models and generate a launch command, then serve the Hono app.

GitHub authentication uses the device-code flow unless a saved token or `--github-token` is supplied. `copilot-api auth` performs authentication separately. The saved GitHub token is at `<home>/.local/share/copilot-api/github_token`, including on Windows. The Copilot token is held in process memory and refreshed using the upstream refresh interval minus 60 seconds.

The default Copilot endpoint is `https://api.githubcopilot.com`; other account types use `https://api.<account-type>.githubcopilot.com`. Shared request headers identify the proxy as a VS Code Copilot Chat client.

The process holds tokens, cached models, runtime settings, and rate-limit timing in a singleton. It does not maintain a shared conversation store or merge client sessions.

## HTTP surface and request flows

| Method and path | Behavior |
| --- | --- |
| `GET /` | Returns `Server running`; also used by the Docker health check. |
| `POST /chat/completions`, `/v1/chat/completions` | Copilot Chat Completions, streaming or non-streaming. |
| `POST /responses`, `/v1/responses` | Native Responses forwarding to Copilot or configured DeepSeek models. |
| `GET /models`, `/v1/models` | Cached Copilot models, available aliases, and configured enabled DeepSeek models. |
| `POST /embeddings`, `/v1/embeddings` | Copilot embeddings. |
| `POST /v1/messages` | Translate Anthropic Messages to Copilot Chat Completions and translate results back. |
| `POST /v1/messages/count_tokens` | Estimate tokens using translated content and model-specific adjustments. |
| `GET /usage` | GitHub Copilot quota/usage lookup. |
| `GET /token` | Returns the process's current Copilot token. |

Only Messages is mounted exclusively under `/v1`; there is no registered bare `/messages` route. DeepSeek routing applies to Responses only. Listing a model does not establish support for every API or capability.

Chat requests resolve aliases, estimate tokens when model metadata is available, and fill a missing `max_tokens` from the model limit. The Copilot chat service sets vision headers for image content and `X-Initiator` based on whether assistant/tool history is present. Messages uses dedicated non-streaming and streaming translators rather than the native Responses route.

Responses reads the body, resolves the model/provider, and forwards to that provider's `/responses`. With no alias rewrite, it preserves the original request bytes after inspecting the JSON. Upstream status and body are returned directly, including upstream error responses. Local exceptions use `forwardError`: `HTTPError` preserves its status; other exceptions currently become a JSON error envelope with status 500. Local routing/validation failures therefore do not necessarily produce a 400.

Manual approval and rate limiting are invoked by the chat, Messages, and Responses handlers, not by global middleware. Rate limiting is process-wide timestamp-based pacing; `--wait` waits instead of returning 429. It is not a per-client quota system.

## Responses compatibility and logging

Copilot Responses forwards client session, turn-state, tracing, and extension headers. The proxy replaces authentication and Copilot identity headers, preserves a supplied `x-request-id`, and generates one when absent. It strips local cookies, host, content length, hop-by-hop headers, and headers named by `Connection`. Response forwarding also strips `Set-Cookie` and content encoding because fetch/stream transformations can alter the body representation. DeepSeek uses its own small request/response header policy.

The request cancellation signal is passed upstream unless it is already aborted after request-body consumption; the handler explicitly ignores that condition as a compatibility workaround.

`responsesStableItemIds` is enabled by default. For Copilot SSE only, `sse-item-id-normalizer.ts` maps each `output_index` to its first observed item ID, then rewrites supported lifecycle references and completed output items consistently. It preserves event order, sequence numbers, text, response IDs, and tool `call_id`; JSON serialization can change. Unknown or malformed frames pass through. DeepSeek bypasses this normalization.

Use `--no-responses-stable-item-ids` for a raw-stream comparison and `--responses-stable-item-ids` to enable it. The workaround addresses observed inconsistent Copilot IDs; it does not deduplicate events or repair every possible Responses event type.

The alias `codex-auto-review` resolves to `gpt-5.6-luna` in the Chat Completions and Responses handlers. Model listing adds the alias when the target Copilot model is available. Aliased requests receive input/output logs. Responses input sanitization removes `encrypted_content`; recognized completed output is summarized into final content, status, usage, and errors. Fallback output logging is broader. These logs are not a general secret-redaction mechanism, and verbose handlers may log payload content.

## Runtime configuration and provider routing

See `config.example.json` and `src/lib/runtime-config.ts`.

- Configuration file: `--config <file>` overrides `COPILOT_API_CONFIG`; no file is implicitly selected from the checkout.
- Environment: `--env <name>` overrides `COPILOT_API_ENV`, otherwise `default`.
- Merge order: built-in defaults, file `defaults`, selected `environments` entry, then supported `COPILOT_API_*` overrides. Arrays are replaced.
- Schema requires `version: 1` and rejects unknown configuration fields. An explicitly selected environment must exist when a config file is supplied.
- File catalog paths resolve relative to that config file, not the process working directory.
- At least one provider must be enabled.

Built-in defaults enable Copilot and catalog refresh, disable DeepSeek, and use no custom catalog files. Catalog output defaults to `<home>/.local/share/copilot-api/codex-models.json`. DeepSeek defaults to `https://api.deepseek.com`, key variable `DEEPSEEK_API_KEY`, and model names `deepseek-flash` and `deepseek-v4-pro`.

Supported runtime overrides:

| Variable | Meaning |
| --- | --- |
| `COPILOT_API_CONFIG`, `COPILOT_API_ENV` | Select config file and environment. |
| `COPILOT_API_COPILOT_ENABLED`, `COPILOT_API_DEEPSEEK_ENABLED` | Enable/disable providers; only literal `true` or `false`. |
| `COPILOT_API_DEEPSEEK_BASE_URL` | Override DeepSeek base URL. |
| `COPILOT_API_CATALOG_ENABLED` | Enable/disable refresh; only literal `true` or `false`. |
| `COPILOT_API_CATALOG_OUTPUT_FILE` | Absolute output path. |
| `COPILOT_API_CATALOG_CUSTOM_FILES` | JSON array of absolute custom-file paths. |

DeepSeek model names and the API-key variable name are configured in JSON. The key itself is read from the proxy process environment. Exact configured DeepSeek names select DeepSeek; disabled or unknown `deepseek-` models fail without falling back to Copilot. Other model names use Copilot if enabled, with alias resolution.

DeepSeek transport uses only its own bearer key and content negotiation headers, requires HTTPS except for localhost/127.0.0.1, rejects URL credentials/query/fragment, and disables automatic redirects. The handler rejects stored `previous_response_id`/`conversation` state and tool types other than function tools or custom `apply_patch`. It does not convert arbitrary cross-provider opaque history. Use a fresh conversation or complete compatible history when switching providers.

## Codex model catalog

`src/lib/codex-models.ts` fetches the upstream Codex `models.json` with a 10-second timeout, then merges entries by `slug` in this precedence order:

1. Upstream catalog, including its top-level metadata.
2. Bundled metadata for enabled, recognized DeepSeek models.
3. Configured custom files, in order; later entries replace matching slugs.

Custom files use `{ "models": [...] }`. Missing files are skipped. Invalid custom data or other outer refresh failures keep the existing output and log a warning. A failed remote fetch falls back to `codex-models-upstream.json` beside the output, or an empty upstream catalog if no valid cache exists. Valid local sources can therefore generate output offline. Output is written to a temporary sibling and renamed atomically; the upstream cache is written separately.

The generated catalog and `/models` serve different purposes: the catalog supplies client metadata/instructions, while `/models` reports provider model IDs. Catalog presence does not guarantee provider availability. Merely placing a custom file in the repository does not load it; list it in configuration. The example config selects `./codex-models-custom.json` and writes `./generated/codex-models.json`.

The README documents configuring Codex's top-level `model_catalog_json` to the generated absolute path, restarting the client to load the snapshot, and checking the effective catalog. Refer to the README for the checkout's Gemini custom-entry notes; model metadata should be checked against the selected provider before changing advertised capabilities.

## Planned model and session usage metrics

[Model and Session Usage Metrics Pipeline](docs/API_RESPONSE_STATISTICS_SQLITE_DESIGN.md), last updated 2026-09-17, is a **draft for discussion**, with ownership and runtime choices still open. It is not implemented: there are no `src/lib/tracking/` modules or `/stats` routes, and the strict runtime configuration schema does not accept the proposed `tracking` block. The existing `/usage` endpoint continues to return a GitHub Copilot quota snapshot, not this proxy's historical consumption.

The proposal covers Responses, Chat Completions, Messages, and embeddings:

- Persist calculated aggregates only, with no raw payloads, per-request records, or durable event queue. Group model metrics by routed `(provider, model)`, so aliases contribute to their upstream model.
- Attribute session totals using the incoming `session_id` header and `(session_id, provider, model)` keys. Missing or invalid session IDs affect model totals only. Session IDs are lookup dimensions, not credentials.
- Observe upstream usage before Responses item-ID normalization or Messages translation. Finalize one delta per request at EOF, cancellation, or error; terminal usage snapshots replace provisional values rather than adding to them. Preserve forwarded stream bytes and distinguish reported zero, missing usage, and partial usage.
- Feed a bounded in-memory queue into one processor worker with the sole writable SQLite connection. Update daily, weekly, monthly, and session aggregates with a batch checkpoint in one transaction. The proposed bounds are 5,000 deltas and 8 MiB, with batches of up to 100 deltas or 250 ms.
- Keep inference available if tracking fails. Saturation drops new metrics with diagnostics; crashes can lose uncommitted data. Checkpoints prevent duplicate application during retained-batch retries, but do not make the volatile queue durable.
- Retain 60 calendar dates, 53 Monday-start weeks, and 12 calendar months independently. Proposed session retention expires an entire session after 365 inactive days, preserving all model rows while that session remains active. Use one persisted IANA timezone per database, defaulting to UTC with Asia/Tokyo proposed for this installation.
- Expose proposed `/stats/series` and `/stats/session` reads over committed aggregates, including reporting coverage and queue/loss diagnostics. Use integer counters with BigInt arithmetic and decimal strings for token/unit totals; never sum overlapping day/week/month views together.

The proposed implementation order is: freeze metric/session contracts and prototype the runtime driver/worker; build the queue and atomic processor; instrument inference; add retention and query APIs; then validate and enable an opt-in local trial. Suggested modules live under `src/lib/tracking/`, with a worker entry and `src/routes/stats/route.ts`, plus changes to configuration, startup/shutdown, debug output, and inference paths.

Open decisions include the session inactivity period, additional clients' stable session headers, the minimum supported Node version and SQLite driver, and JSON/CLI versus dashboard presentation. Tracking is proposed to start disabled. Performance targets and acceptance tests in the design are planned work, not measured results.

## Development and local CLI installation

Run from this repository in PowerShell:

```powershell
bun install
bun run dev -- start --port 4141
```

Production-mode source execution:

```powershell
bun run start -- start --port 4141
```

Both scripts launch `src/main.ts`, whose CLI uses subcommands. Building and globally linking this modified checkout is separate:

```powershell
bun run build
bun link
copilot-api --help
copilot-api debug
copilot-api start --port 4141
```

Rebuild after source edits; the global link continues to target this checkout's `dist/main.js`. Use `bun unlink` from the repository to unregister it. On Windows, Bun's binary directory is normally `%USERPROFILE%\.bun\bin`; use `Get-Command copilot-api` to check resolution. Installing the published npm package does not include unshipped checkout changes.

Other useful commands:

```powershell
copilot-api auth
copilot-api check-usage
copilot-api debug --json
copilot-api start --config ./config.example.json --env development
```

The last command enables DeepSeek through the example environment and requires its API key. Other start options include `--verbose`, `--account-type`, `--manual`, `--rate-limit`, `--wait`, `--github-token`, `--claude-code`, `--show-token`, and `--proxy-env`.

Validation commands:

```powershell
bun test
bun test tests/responses-route.test.ts
bun run lint:all
bun run typecheck
bun run build
```

CI runs install, `lint:all`, typecheck, all tests, and build on pull requests and pushes to `master`. `bun run lint` invokes cached ESLint; pass `--fix` when fixes are intended. `bunx lint-staged` handles staged files. Follow `AGENTS.md`: strict explicit types, no unused symbols or switch fallthrough, ES imports, and `~/*` aliases for `src/*`. The current build uses tsdown even though `AGENTS.md` still calls it tsup; its example `tests/claude-request.test.ts` is also stale (current translation tests are `anthropic-request.test.ts` and `anthropic-response.test.ts`).

## Tests and evidence

- `anthropic-request.test.ts`, `anthropic-response.test.ts`: request validation and translation, thinking blocks, text/tool response conversion, streaming events.
- `create-chat-completions.test.ts`, `model-aliases.test.ts`: initiator headers and alias behavior.
- `create-responses.test.ts`, `responses-route.test.ts`: native body/status/stream forwarding, session/header isolation, aliases/logging, cancellation, approval, pacing, errors.
- `responses-sse-item-id-normalizer.test.ts`: consistent lifecycle IDs, independent output indices, unknown/malformed passthrough.
- `runtime-config.test.ts`, `model-routing.test.ts`, `deepseek-responses.test.ts`: configuration precedence/paths, provider selection, separate credentials and redirect behavior.
- `codex-models.test.ts`: catalog merging, missing/invalid custom files, offline behavior, portable configuration.

The 2026-09-23 refresh checked repository guidance, package/CI configuration, startup and route wiring, Responses/provider routing, runtime configuration, the test inventory, experiment reports, the metrics proposal, and Git state. Documentation links and diff whitespace were checked. It did not run tests, lint, typecheck, build, authentication, or live provider requests. Existing reports contain historical validation and do not establish current live provider behavior. No metrics-pipeline tests exist yet.

## Deployment and operational boundaries

The Dockerfile builds with Bun `1.2.19-alpine`, installs production dependencies, copies `dist`, exposes port 4141, and health-checks `/`. Its entrypoint already supplies `start`: pass flags such as `--port 4141`, not another `start` argument. `--auth` selects authentication; `GH_TOKEN` is translated to `-g` by the entrypoint. The source CLI does not directly use `GH_TOKEN` as its token option. The Dockerfile has no explicit `USER` directive, despite the README claiming a non-root setup.

Persist the application data directory for GitHub credentials. For configured catalog output in containers, mount config/custom sources read-only and provide a writable output directory; the host client's catalog path must correspond to that mount. See the README and DeepSeek design for deployment/migration examples.

The Hono app enables CORS and has no client-authentication middleware. `/token` exposes the current upstream token. This is a material deployment boundary when deciding who can reach the server. Token counts are heuristic and the Messages counting route returns `input_tokens: 1` when model lookup/counting fails. Copilot is reverse-engineered and upstream contracts can change; recorded compatibility fixes have bounded evidence.

## Local checkout notes and reading order

The existing context recorded a locally disabled pre-commit hook. Inspection confirmed `.git/hooks/pre-commit` currently exits successfully before `bunx lint-staged`; `package.json` still configures that hook through `simple-git-hooks`, and `bun install` may regenerate it. Four lint-staged backup stashes were present during this refresh. They were not modified; inspect contents before any future restore/drop operation.

At refresh time, `main` points to `7471bea` (2026-09-15). Recent history includes `c58d3ac` (DeepSeek routing/configuration) and `1f0c9d1` (stable Responses item IDs by default). There are no working-tree modifications to `src/`, `tests/`, or `package.json`.

The working tree already contained these documentation/planning changes:

- Modified `context.md`, refreshed again by this update.
- Deleted root `DEEPSEEK_ROUTING_AND_ENV_CONFIG_DESIGN.md`, with its replacement untracked under `docs/`.
- Deleted root `deepseek-routing-env-config-implementation.kanban.json`, with its replacement untracked under `kanban-archive/`.
- Untracked `.kanbansession.log`, `LUNA_RESPONSES_ITEM_ID_EXPERIMENT_REPORT.md`, and `docs/API_RESPONSE_STATISTICS_SQLITE_DESIGN.md`.

Only `context.md` was edited for this refresh. Consult `git status` for current state rather than assuming this snapshot stays current; these changes have not been committed by this refresh.

Recommended reading:

1. [README](README.md), [package scripts](package.json), [repository instructions](AGENTS.md), and [example runtime config](config.example.json).
2. [Startup](src/start.ts), [route registration](src/server.ts), and [Responses handler](src/routes/responses/handler.ts).
3. [DeepSeek/environment design](docs/DEEPSEEK_ROUTING_AND_ENV_CONFIG_DESIGN.md); a design argument, to be compared with current code for implemented scope.
4. [Native Responses implementation plan](RESPONSES_API_IMPLEMENTATION_PLAN.md); original rationale for using native upstream Responses.
5. [Item-ID troubleshooting](docs/troubleshoot/copilot-responses-item-ids.md), [compatibility experiment report](RESPONSES_STREAM_COMPATIBILITY_EXPERIMENT_REPORT.md), and [Luna reproduction report](LUNA_RESPONSES_ITEM_ID_EXPERIMENT_REPORT.md).
6. [Model/session usage-metrics proposal](docs/API_RESPONSE_STATISTICS_SQLITE_DESIGN.md); planned aggregate-only SQLite tracking, with implementation and runtime decisions still pending.

The troubleshooting note reports 6/6 raw CLI trials with an item-timing warning versus 0/6 normalized trials, plus narrower Desktop evidence. Its September 15 Luna reproduction found seven IDs for one item in each of three captures, reduced to one by normalization while preserving other parsed fields. Those trials did not establish tool-call or multi-turn behavior. Root `*.kanban.*` files and `kanban-archive/` retain task history rather than runtime configuration.
