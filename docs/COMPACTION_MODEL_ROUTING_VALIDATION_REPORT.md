# Compaction model routing validation

## Implemented behavior

The proxy supports version 1 `defaults.compaction` and environment overrides with `enabled` and `model`. Built-in configuration disables routing. Enabling requires a trimmed nonblank target and a configured, enabled provider. Existing config files remain valid. The proxy now automatically loads a working-directory `config.json` when present; explicit `--config` and then `COPILOT_API_CONFIG` take precedence. Missing default files are skipped; explicit missing files and invalid/unreadable files fail startup. Restarting is required after configuration edits.

Only the existing POST Responses routes inspect the exact `request_kind: "compaction"` marker. The JSON-valued header is authoritative; serialized body client metadata is a fallback only when the header is absent. Invalid optional metadata and prompt text never activate the override.

The selected model goes through existing alias/provider routing and payload validation. Copilot requests preserve all other JSON values, session/thread headers and encrypted strings; no-op models preserve original bytes. Original request bytes remain available for diagnostics and incoming dumps. Routing adds no stream buffering, response model rewrite, retry or session model mutation.

Dedicated compact endpoints and WebSockets are outside scope. Target compatibility with reasoning settings, existing ciphertext and subsequent original-model continuation remains a live validation concern.

## Automated evidence

- Focused config/detection/route/dump suite: 77 passed, 0 failed, 261 assertions. Existing config subprocess fixtures required sandbox escalation.
- `bun run typecheck`: passed after routing/test implementation.
- Tests cover default-off behavior, strict config and merge/provider ordering, metadata precedence and malformed forms, prompt false positives, both routes, aliases, no-op bytes, unknown/nested fields, ciphertext, session headers and content length, effective DeepSeek restrictions, concurrent normal turns, upstream errors without retry, streamed delivery before completion, existing item normalization and linked dump models/hashes.
- `bun run typecheck`, `bun run lint`, and `bun run build`: passed after final code formatting and test typing fixes.
- Complete suite: 144 passed, 0 failed, 435 assertions across 15 files; run with sandbox escalation for existing subprocess fixtures.
- Diff review checked configuration default/merge order, header precedence, per-request routing, original-body diagnostics, transport content-length handling, unchanged ciphertext and existing streaming/normalization. No unresolved code findings. Extracted configuration validation to meet the existing complexity limit and used typed test payload/stream reads to satisfy strict lint.
- After the automatic `config.json` loading update: 61 config/route/dump regression tests passed, including discovery, explicit-path precedence, missing-file handling and invalid default files. Focused lint, typecheck and build passed. A direct loader check from the repository confirmed its local `config.json` enables `gpt-6-luna` without specifying a path.
- At board closure: complete suite passed with 159 tests and 473 assertions. Compaction request/response logs now have distinct prefixes, including when the override is disabled; 31 route tests, focused lint, typecheck and build passed for that change. Route fixtures isolate package-root config discovery from the local enabled configuration.

## Live acceptance

Live probes used the built CLI on an isolated proxy at `localhost:4142` with existing credentials, request dumping and catalog refresh disabled. An isolated Codex app-server home and ephemeral read-only sessions ran synthetic memory questions, actual `thread/compact/start`, and original-model follow-ups. The test instructions prohibited tools, delegation and edits. The user's normal proxy and Codex configuration were not changed.

| Probe | Result | Compaction trace |
| --- | --- | --- |
| Disabled Sol baseline | Sol normal turn, Sol compaction, Sol continuation completed; test key and color recalled. | `e1cb9436-3fd8-4bda-9c88-732e34729da4` |
| Sol → Luna → Sol | Actual manual compaction completed on Luna; subsequent Sol turn completed and recalled both test values. | `237a6a83-66ec-4a21-9736-41df33b50e97` |
| GPT-6.1 Sol → Luna → GPT-6.1 Sol | Actual manual compaction completed on Luna; original-model turn completed and recalled both test values. | `49172d7e-419d-44e2-8eea-b69fef033156` |
| Astra | Initial ordinary turn failed with upstream HTTP 400 `model_not_supported`; compaction and continuation could not be tested. | Ordinary-turn trace `82899b42-8619-4653-80e1-cc8827690743` |
| Disabled Sol restoration | After restarting the test proxy without the enabled environment, normal turn, Sol compaction and Sol continuation completed. | `51eba283-b8bf-4334-9b57-ceb6f40ba026` |

Paired captures confirm the exact manual-compaction discriminator, original incoming models and selected upstream models. Across successful probes, parsed bodies match after excluding only top-level `model`; session/thread headers match. Ordinary turns and disabled compactions retain identical bytes. Enabled compactions have different hashes because only the model is rewritten.

Completion evidence comes from Codex `turn/completed` with `status: completed` and correct original-model follow-up responses, rather than HTTP 200 alone. These synthetic histories do not establish compatibility for every prior incident's encrypted handoff payload or large production history.

All isolated proxy/app-server processes were stopped after validation; local probe config remains disabled by default. Automatic compaction was not exercised live; detection is covered by synthetic metadata tests. On October 5, 2026, the user confirmed that compaction routing is verified, closing the live acceptance gate based on the successful Sol and GPT-6.1 Sol checks and user verification. Astra remains unavailable upstream and was not validated. No private dumps or credentials are committed.
