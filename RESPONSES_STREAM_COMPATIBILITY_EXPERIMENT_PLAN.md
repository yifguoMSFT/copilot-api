---
title: Responses Stream Compatibility Experiment and Fix Plan
status: draft
owner: TBD
last_updated: 2026-09-04
---

# Responses Stream Compatibility Experiment and Fix Plan

## Summary

Codex desktop may render each assistant item twice when consuming GitHub Copilot's Responses stream through `copilot-api`. Session history shows that each visible duplicate is one logical generated item recorded in two transcript envelopes, rather than two model generations. Direct stream captures do not contain duplicate lifecycle events, but they do assign different item IDs to events that describe the same output item.

This plan isolates a Codex rendering regression from a Responses wire-compatibility problem before changing production behavior. The first experiments add observation only. A feature-gated compatibility transform will be prototyped only if stable item IDs eliminate the duplication. Raw passthrough remains the default and immediate rollback path.

## Background and problem

After a Codex desktop upgrade, intermediate assistant messages began rendering twice. A Codex restart temporarily removed the visible duplication, and later observation confirmed that final messages also duplicate but may be folded by default. Public issue searches did not reveal a matching report, making a local interaction between Codex desktop and `copilot-api` plausible.

The repository currently treats Responses streams as opaque data:

- `src/services/copilot/create-responses.ts` returns GitHub Copilot's response without parsing its SSE body.
- `src/routes/responses/handler.ts` forwards that body once.
- `tests/responses-route.test.ts` asserts exact SSE passthrough.
- The implementation has not changed since commit `55e50e4` on 2026-08-25.

OpenAI's Responses protocol uses typed semantic SSE events. Events referring to one output item are expected to remain correlated as that item moves through added, delta, done, and completed states. The observed GitHub Copilot stream has the expected event order and cardinality, but not a stable item ID across those states.

## Evidence

### Confirmed facts

1. In the affected session transcript, commentary and final assistant items are each stored twice: once as `event_msg/item_completed` and once as `response_item/message`. Each pair has the same generated item ID and exact text.
2. A pre-upgrade transcript from 2026-09-02 already contains the same dual journal representation. It has 322 `event_msg` agent messages, 334 `response_item` assistant messages, and 322 same-ID pairs. Older Codex behavior therefore coalesced records that the upgraded UI may now render independently.
3. Minimal live captures for both `gpt-5.6-sol` and `gpt-5.6-sol-fast` each contain nine ordered SSE events with monotonic `sequence_number` values from 0 through 8. No lifecycle event is duplicated.
4. In each capture, the seven event locations referring to the single output item contain seven different item IDs. In particular, the ID in `response.output_item.added` does not equal the IDs in `response.output_item.done` or `response.completed`.
5. `copilot-api` forwards the upstream Responses body once and does not currently manufacture either transcript envelope.

### Hypotheses

| ID | Hypothesis | Evidence that would support it | Evidence that would weaken it |
| --- | --- | --- | --- |
| H1 | The upgraded Codex UI stopped coalescing the two transcript envelopes. | Duplication occurs with an official Responses provider whose item IDs are stable, or restarting Codex changes rendering without any wire change. | A stable-ID compatibility stream consistently renders once in fresh and already-affected processes. |
| H2 | Unstable upstream item IDs cause Codex to treat lifecycle events as separate items, exposing a new or stricter client path. | Normalizing IDs alone removes duplication while raw passthrough reproduces it. | Duplication remains after verified normalization, or official streams show the same ID behavior without duplication. |
| H3 | The fault requires both a Codex client-state regression and the upstream ID mismatch. | Raw streams duplicate only after a state transition in a running Codex process, while normalized streams remain stable. | Either factor independently and consistently explains the outcome. |
| H4 | Sol Fast has a model-specific stream defect. | Sol Fast differs from Sol under otherwise identical captures and client state. | Both models produce and render the same behavior, as current minimal captures suggest. |

The item-ID mismatch is confirmed; its role in rendering duplication is not.

## Goals

- Produce a repeatable reproduction with saved Codex version, process state, model, request, wire stream, screenshot, and session transcript.
- Determine whether duplication is caused by Codex client state, upstream Responses semantics, or their interaction.
- Verify whether stable item IDs are sufficient to restore one rendered assistant item per logical output item.
- Define a reversible compatibility layer that preserves streaming, tools, continuations, cancellation, and unknown events.
- Gather evidence suitable for an upstream Codex or GitHub Copilot report if the local proxy cannot safely fix the root cause.

## Non-goals

- Deduplicating assistant text based on equal content.
- Permanently hiding a Codex UI defect without identifying the triggering protocol difference.
- Changing model discovery or the availability of Sol, Terra, Luna, or Sol Fast.
- Replacing the Responses endpoint with Chat Completions as the production fix.
- Changing unrelated request translation or authentication behavior.

## Experimental design

### Recorded variables

Every run must record:

- Codex desktop version and whether the process is freshly started or already affected.
- `copilot-api` commit and experiment mode.
- Model and exact minimal prompt.
- Request ID, response ID, ordered event types, sequence numbers, and every item-ID field.
- Whether commentary and final messages render once or twice.
- The corresponding session JSONL entries and generated item IDs.
- Whether the task includes plain text, reasoning/commentary, a tool call, or a continuation.

Use a new Codex task for each run so transcript evidence cannot be confused with prior state. Preserve raw captures as test fixtures after removing credentials and unrelated prompt content.

### Controlled matrix

| Case | Provider path | Proxy behavior | Model | Codex process state | Purpose |
| --- | --- | --- | --- | --- | --- |
| A | GitHub Copilot | Current raw passthrough | Sol | Fresh | Establish baseline. |
| B | GitHub Copilot | Current raw passthrough | Sol Fast | Fresh | Detect model-specific behavior. |
| C | GitHub Copilot | Current raw passthrough | Sol and Sol Fast | Already affected | Test client-state dependence. |
| D | GitHub Copilot | Diagnostic observer only | Sol and Sol Fast | Fresh and affected | Prove observation does not alter behavior and correlate UI with wire data. |
| E | GitHub Copilot | Stable item-ID experiment | Sol and Sol Fast | Fresh and affected | Test H2 without other semantic changes. |
| F | Official Responses API, if credentials and the same client routing are available | No transform | Closest available model | Fresh and affected | Separate Codex behavior from GitHub Copilot behavior. |

Run each available matrix cell at least three times. A single restart-dependent success is not sufficient to claim a fix.

### Phase 1: Freeze the baseline

1. Record the installed Codex desktop version and `copilot-api` commit.
2. Reproduce with one deterministic short prompt through current raw passthrough.
3. Save the raw SSE stream, screenshot, and relevant session JSONL excerpt.
4. Repeat after a full Codex restart and then after the client reaches the affected state, if that transition can be reproduced.
5. Confirm that the server receives one request and writes one response body for each UI action.

Decision gate: if the server receives or sends the request twice, investigate transport or retry behavior before any SSE compatibility work.

### Phase 2: Add a diagnostic-only observer

Introduce an experiment-only observer that parses SSE framing for structured logs while forwarding the original bytes unchanged. It should report:

- response and request correlation;
- event type and `sequence_number`;
- `output_index`, `content_index`, and all `item.id` or `item_id` values;
- repeated event types or non-monotonic sequences;
- stream termination, cancellation, and parse failures.

The observer must not log authorization headers, full user prompts, reasoning content, or tool arguments. A parse failure must be visible in diagnostics and leave the raw stream path available.

Decision gate: proceed only after byte-for-byte comparison confirms that observer mode does not change a captured stream.

### Phase 3: Stable item-ID experiment

Add a local, off-by-default mode that changes only item correlation. For each streamed response, allocate one client-facing item ID for each logical `(response identity, output_index)` pair when the item first appears. Rewrite that value consistently in known event shapes:

- `response.output_item.added.item.id`;
- `response.content_part.added.item_id`;
- `response.output_text.delta.item_id` and corresponding done events;
- `response.content_part.done.item_id`;
- `response.output_item.done.item.id`;
- matching items in `response.completed.response.output`.

Preserve event order, sequence numbers, text, status, indices, headers, and all unknown fields. Do not suppress events and do not deduplicate equal text.

If an event cannot be assigned unambiguously, fail open to raw passthrough for that response and emit a sanitized diagnostic. Do not partially normalize a response after ambiguity is detected.

Decision gate: consider ID normalization causal only if Case E renders one item while paired raw-passthrough cases reproduce duplication, with identical prompts and client-state categories across repeated runs.

### Phase 4: Compatibility and regression canaries

If Phase 3 passes its decision gate, validate:

1. plain final text;
2. commentary followed by final text;
3. multiple output items, if upstream can produce them;
4. a tool call and tool result round trip;
5. a continuation that references prior response state;
6. cancellation mid-stream and immediate next request;
7. malformed and unknown SSE events;
8. both Sol and Sol Fast.

Inspect subsequent Codex requests to determine whether it echoes upstream output item IDs. If it does, either maintain a bounded reverse mapping for fields that require upstream IDs or stop the rollout until the continuation contract is understood.

## Success and failure criteria

The experiment succeeds when all of the following hold:

- One logical assistant item produces one rendered Codex item for both commentary and final output.
- Session history contains no additional logical assistant generation; dual internal envelopes may remain if Codex normally uses them.
- Event sequence numbers remain monotonic and event cardinality remains unchanged.
- Every event that refers to the same `(response identity, output_index)` uses the same client-facing item ID.
- Tool calls, tool results, continuations, cancellation, and backpressure behave as under raw passthrough.
- Unknown event types and fields remain preserved.
- Disabling the feature flag immediately restores exact raw passthrough.

The experiment fails or is inconclusive if:

- normalization does not reliably change rendering;
- restarting Codex changes the result more strongly than the stream mode;
- a tool call or continuation requires an opaque upstream ID that cannot be safely mapped;
- the parser changes content, ordering, timing materially, or unknown events;
- the official provider control duplicates despite stable IDs.

An inconclusive result should produce an upstream bug report with captures, not a default-on workaround.

## Proposed compatibility architecture

This architecture is conditional on the stable-ID experiment passing.

1. Keep current raw passthrough as the public default.
2. Add an explicitly named Responses compatibility feature flag scoped to GitHub Copilot streams.
3. Insert an incremental SSE transform between the upstream body and the existing response writer.
4. Parse complete SSE frames across arbitrary network chunk boundaries while preserving comments, event names, unknown fields, and event order.
5. Maintain response-scoped correlation from `(response identity, output_index)` to a stable client-facing ID.
6. Rewrite only known item-ID locations. Serialize transformed JSON back into the original SSE event structure.
7. Bound and release mapping state on completion, cancellation, connection close, and timeout.
8. Preserve or translate opaque upstream IDs in later requests only when evidence shows Codex echoes them.
9. Expose sanitized counters for parse failures, ambiguous mappings, transformed responses, and fail-open responses.

The same public Responses route, request contract, model behavior, and raw-passthrough option do not change. Existing request translation and authentication remain unchanged.

## Test strategy

### Unit and fixture tests

- Stable ID across every known event shape and `response.completed` output.
- Independent IDs for multiple `output_index` values.
- SSE frames split at every plausible chunk boundary, including UTF-8 boundaries.
- Multiple frames in one chunk and multi-line `data:` fields.
- Comments, blank lines, optional `event:` fields, and terminal markers.
- Unknown event types and unknown JSON fields pass through unchanged.
- Malformed JSON and ambiguous correlation trigger the defined fail-open behavior.
- No text-based or event-type-based deduplication.
- Mapping cleanup on completion, error, cancellation, and disconnect.

### Route and stream tests

- Raw mode remains byte-for-byte compatible with the existing passthrough test.
- Observer mode remains byte-for-byte compatible with raw mode.
- Compatibility mode preserves headers, ordering, backpressure, and cancellation.
- Slow consumers do not cause unbounded buffering.
- Concurrent responses do not share item mappings.

### End-to-end tests

- Compare screenshots and session histories for paired raw and normalized runs.
- Assert one rendered UI item per logical output item, including folded final messages.
- Run the tool-call and continuation canaries before enabling the flag beyond a single local task.
- Repeat after a Codex restart and in a process that previously displayed duplication.

## Rollout and rollback

1. Land diagnostic fixtures and observer coverage without changing default behavior.
2. Keep the compatibility transform local and off by default.
3. Enable it for one disposable Codex task and one model.
4. Expand to Sol and Sol Fast only after repeated plain-text success.
5. Run tool-call and continuation canaries.
6. Consider opt-in use only after all success criteria pass. Default-on behavior requires stronger cross-version evidence and a documented upstream position.

Rollback is immediate: disable the feature flag and return to the existing raw body passthrough. If transformed streams cause protocol errors, continuation failures, or missing UI content, stop the experiment and preserve the failing capture.

## Risks and mitigations

| Risk | Consequence | Mitigation |
| --- | --- | --- |
| Opaque IDs are referenced by later requests. | Tools or continuations fail. | Inspect follow-up requests; add a bounded reverse mapping only for proven fields, otherwise do not ship. |
| Choosing the final upstream ID requires buffering. | Streaming latency increases and commentary is delayed. | Allocate a client-facing ID at the first item event; never wait for completion. |
| Incremental parsing corrupts new event types. | Content is lost after an upstream protocol change. | Preserve unknown events and fields, test arbitrary chunking, and retain raw rollback. |
| Mapping state leaks after disconnects. | Memory grows over long-running use. | Scope state per response and clean it on every terminal path with a defensive timeout. |
| The issue is purely a Codex UI regression. | Proxy complexity treats a symptom without fixing the cause. | Require paired experimental evidence and use the official provider control when available. |
| Fail-open produces a partially transformed stream. | One response contains mixed identities. | Decide transformability before emitting affected frames where possible; otherwise abort the transformed response visibly rather than silently mixing IDs. |
| Diagnostics expose sensitive content. | Local secrets or prompts enter logs. | Log event metadata and hashes only; explicitly exclude headers and semantic payloads. |

## Alternatives considered

- **Restart Codex when duplication appears.** Useful as a temporary mitigation and experimental variable, but unreliable and not explanatory.
- **Report only a Codex UI bug.** Appropriate if stable official streams duplicate or normalization has no effect. Premature until the known item-ID deviation is isolated.
- **Buffer the entire stream and emit a canonical completed response.** Rejected because it removes the streaming experience and changes timing substantially.
- **Deduplicate equal text or repeated event types.** Rejected because identical text can be legitimate and the observed stream does not duplicate lifecycle events.
- **Switch production traffic to Chat Completions.** May serve as a control, but changes protocol capabilities and does not resolve Responses compatibility.
- **Always normalize IDs.** Rejected until tool and continuation semantics prove that opaque upstream IDs can be rewritten safely.

## Open questions

- Does Codex include assistant output item IDs in later tool-result or continuation requests?
- Can the same Codex build be tested against an official Responses provider with an equivalent model and prompt?
- What exact action moves a fresh Codex process into the visibly affected state?
- Does duplication correlate with a specific Codex desktop version, rendering mode, or task folding state?
- Should the experiment flag be an environment variable, configuration field, or private route option? Choose only after confirming causality.
- Does GitHub Copilot document its item-ID behavior or consider the observed IDs a protocol defect?

## Appendix A: Observed stream shape

Both captured models produced the following single-item lifecycle:

| Sequence | Event | Item-ID location | Observation |
| ---: | --- | --- | --- |
| 0 | `response.created` | None | Once |
| 1 | `response.in_progress` | None | Once |
| 2 | `response.output_item.added` | `item.id` | Unique value 1 |
| 3 | `response.content_part.added` | `item_id` | Unique value 2 |
| 4 | `response.output_text.delta` | `item_id` | Unique value 3 |
| 5 | `response.output_text.done` | `item_id` | Unique value 4 |
| 6 | `response.content_part.done` | `item_id` | Unique value 5 |
| 7 | `response.output_item.done` | `item.id` | Unique value 6 |
| 8 | `response.completed` | `response.output[0].id` | Unique value 7 |

For both `gpt-5.6-sol` and `gpt-5.6-sol-fast`, `UniqueItemIds = 7`, `AddedEqualsDone = false`, and `AddedEqualsCompleted = false`.

## Appendix B: Session-history evidence

Affected transcript:

`C:\Users\yifguo\.codex\sessions\2026\09\04\rollout-2026-09-04T09-03-46-01a069ba-8351-7c51-b4c5-9adc5705e841.jsonl`

- Lines 471 and 472 contain the same commentary item as `event_msg/item_completed` and `response_item/message`.
- Lines 480 and 481 contain the same final item in those two envelopes.

Pre-upgrade comparison transcript:

`C:\Users\yifguo\.codex\sessions\2026\09\02\rollout-2026-09-02T10-38-53-01a05b6b-2468-7db3-bf3f-f2e01c20eec2_01a05fc4-e1fb-7843-a513-bc020d250b6e.jsonl`

- 322 `event_msg` agent messages.
- 334 `response_item` assistant messages.
- 322 same-ID pairs.

These records confirm the duplicate representation but do not, by themselves, identify whether Codex or the upstream stream is responsible for visible double rendering.

## References

- [Streaming API responses](https://developers.openai.com/api/docs/guides/streaming-responses)
- [Responses API reference](https://developers.openai.com/api/reference/resources/responses)
- [Responses streaming events](https://developers.openai.com/api/reference/resources/responses/streaming-events)
- [Codex troubleshooting](https://developers.openai.com/codex/troubleshooting)
