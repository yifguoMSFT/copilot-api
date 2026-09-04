Focused [[RESPONSES_STREAM_COMPATIBILITY_EXPERIMENT_PLAN.md]] task `freeze_and_reproduce_the_raw-stream_baseline` at commit `c6e1f657f2f79ca011400195ebc0389bbb1277c0`.

Created [[RESPONSES_STREAM_COMPATIBILITY_EXPERIMENT_REPORT.md]] and recorded Codex Desktop CLI version `0.153.0-alpha.5`, the affected transcript and supplied screenshot paths, repository passthrough evidence, and a sanitized six-trial live capture table.

Live command issued three streaming requests each for `gpt-5.6-sol` and `gpt-5.6-sol-fast` with prompt `Reply with exactly OK.`. Every response was HTTP 200 with nine events, sequence numbers `0..8`, seven item references, seven unique opaque item IDs, and no duplicate lifecycle events.

Affected transcript lines 471/472 and 480/481 use paired `event_msg/item_completed` and `response_item/message` envelopes with identical logical item IDs and text. The supplied screenshot visibly confirms duplicate commentary and final rendering.

Fresh-process trials are unavailable because restarting Codex would terminate this active run. The official-provider control is unavailable because no separately authorized credential and equivalent route are present. Both limitations are explicit in the report.

Implemented the diagnostic observer task with an opt-in `--responses-observer` flag. Added `src/routes/responses/sse-observer.ts`, route wiring, state/CLI configuration, and focused tests. The pull-based wrapper preserves original byte chunks and backpressure while parsing a side copy. It fingerprints rather than logs opaque IDs and excludes all semantic content.

Validation: 17 focused tests passed, strict TypeScript passed, and focused ESLint passed. Tests cover one-byte/UTF-8/CRLF chunking, multi-line data, unknown and malformed events, repeated and non-monotonic sequences, cancellation propagation, and exact route bytes.

Validated observer transparency on isolated port 4142 against raw port 4141 with three direct trials per model and three disposable Codex CLI trials per model. Direct response headers, lifecycle, sequence numbers, item cardinality, and deterministic byte lengths matched raw mode. Median timings were within normal upstream variance. Every CLI trial emitted one `item.completed` but warned `item completed without a recorded start timestamp`, linking the upstream ID mismatch to client correlation.

Found and fixed a terminal-cancellation edge case: Codex cancels after receiving `response.completed` but before the wrapper reads transport EOF. Passing that late cancellation into Bun 1.3.14 crashed the isolated server. Terminal events now cause an EOF drain; true mid-stream cancellation still propagates. Post-fix validation passed 18 focused tests, type checking, lint, and repeated live Sol Fast CLI runs without a crash.

Desktop visual comparison remains unavailable without restarting or reconfiguring the active Desktop process. Disposable CLI behavior is recorded as a client control, not a claim about the Desktop renderer.

Implemented the off-by-default stable item-ID experiment with `--responses-stable-item-ids`. The normalizer selects the first ID for each response-scoped `output_index` and rewrites only the documented item-ID fields, including the corresponding `response.completed.response.output` entry. Raw mode bypasses the parser; unknown or malformed frames remain unchanged; missing indices and response-identity changes fail open with sanitized diagnostics; event cardinality and text are never deduplicated.

Implementation validation passed 24 focused stream/route tests, strict TypeScript, and focused ESLint (apart from the repository's stale browser-data notice). Coverage includes all known event shapes, independent output indices, arbitrary byte chunking, completed-response IDs, unknown/malformed frames, changed response identity, raw passthrough, cancellation, and terminal EOF draining.

Completed the available Codex-state controls with six fresh `codex exec` processes on CLI 0.149.1, three per model. Each emitted one logical completed JSON item, logged the missing-start correlation warning, and stored exactly one `event_msg` plus one same-ID `response_item` envelope in its session JSONL. Added the exact unavailable-control reasons to the report: no safe in-run Desktop restart/redirection and no separately authorized official-provider credential. No credential was persisted.
