---
title: Responses Stream Item-ID Experiment Report
status: active
started: 2026-09-04
baseline_commit: c6e1f657f2f79ca011400195ebc0389bbb1277c0
---

# Responses Stream Item-ID Experiment Report

## Confirmed baseline

- Affected Codex Desktop session CLI version: `0.153.0-alpha.5`.
- Local Responses endpoint: `http://127.0.0.1:4141/v1/responses`.
- Prompt: `Reply with exactly OK.`
- The route calls the upstream Responses API once and returns its body once.
- The supplied screenshot shows duplicate commentary and final output.
- The affected transcript stores each logical item as one `event_msg/item_completed` record and one same-ID `response_item/message` record.
- A pre-upgrade transcript contains the same paired representation, so paired storage alone does not explain the rendering regression.

No credential, authorization header, private prompt, reasoning text, tool argument, or raw opaque item ID is included in this report.

## Raw stream captures

Three direct requests per model returned HTTP 200 and the same nine-event lifecycle with sequence numbers `0..8`:

1. `response.created`
2. `response.in_progress`
3. `response.output_item.added`
4. `response.content_part.added`
5. `response.output_text.delta`
6. `response.output_text.done`
7. `response.content_part.done`
8. `response.output_item.done`
9. `response.completed`

| Model | Trials | Item references per trial | Unique item IDs per trial | Duplicate events |
| --- | ---: | ---: | ---: | ---: |
| `gpt-5.6-sol` | 3 | 7 | 7 | 0 |
| `gpt-5.6-sol-fast` | 3 | 7 | 7 | 0 |

The item-ID mismatch is present in both models and is not Sol Fast-specific.

## Fresh Codex CLI control

Three disposable `codex exec` runs per model used CLI `0.149.1`. Every run:

- emitted one logical `OK` result;
- stored one same-ID pair of transcript envelopes;
- logged `item completed without a recorded start timestamp`.

This confirms a client-visible lifecycle-correlation failure. It does not reproduce or disprove the Desktop rendering bug.

## Unavailable controls

- Restarting or redirecting the active Desktop process would terminate this task, so a controlled Desktop A/B run has not happened.
- No separately authorized official Responses API credential is available. No credential was requested or persisted.

## Minimal stable-ID experiment

The experiment added only `--responses-stable-item-ids`. Enabled mode keeps a response-local map from `output_index` to the first observed ID and rewrites the known item-ID fields. Unknown, malformed, and unsupported frames pass through unchanged. It does not observe, log, deduplicate, retry, or add global state beyond the existing server option.

Validation against the simplified code passed:

- 16 focused normalizer and route tests;
- strict TypeScript;
- focused ESLint, apart from the repository's stale browser-data notice;
- `git diff --check`.

### Paired direct HTTP trials

Three trials per model and mode used `Reply with exactly OK.`:

| Mode | Model | Trials | Events | Sequence | Item references | Unique IDs | Text |
| --- | --- | ---: | ---: | --- | ---: | ---: | --- |
| Raw | Sol | 3 | 9 | `0..8` | 7 | 7 | `OK` |
| Raw | Sol Fast | 3 | 9 | `0..8` | 7 | 7 | `OK` |
| Normalized | Sol | 3 | 9 | `0..8` | 7 | 1 | `OK` |
| Normalized | Sol Fast | 3 | 9 | `0..8` | 7 | 1 | `OK` |

Normalization changed only item-ID correlation in these captures.

### Paired disposable Codex trials

Three fresh `codex exec` processes per model and mode used CLI `0.149.1`:

| Mode | Model | Trials | One completed `OK` item | Missing-start warning | Session envelopes |
| --- | --- | ---: | ---: | ---: | --- |
| Raw | Sol | 3 | 3/3 | 3/3 | One same-ID pair per trial |
| Raw | Sol Fast | 3 | 3/3 | 3/3 | One same-ID pair per trial |
| Normalized | Sol | 3 | 3/3 | 0/3 | One same-ID pair per trial |
| Normalized | Sol Fast | 3 | 3/3 | 0/3 | One same-ID pair per trial |

Stable IDs remove Codex's lifecycle-correlation warning without adding a logical item or transcript envelope. The CLI also emitted unrelated plugin and PowerShell snapshot warnings in both modes; these do not vary with item-ID normalization.

### Desktop evidence gap

The affected Desktop session continued to render duplicate responses in raw mode. After the user restarted `copilot-api` on the same endpoint with `--responses-stable-item-ids`, a direct probe confirmed one unique item ID and the user confirmed that the next Codex response no longer duplicated. The Codex session itself was not restarted, so client state remained affected while only proxy behavior changed.

## Current conclusion

Stable IDs are causal for both Codex lifecycle correlation and the observed Desktop double rendering. They removed the missing-start warning in repeated CLI trials and removed duplication in the already-affected Desktop session after only the proxy mode changed. Normalization is now the default; `--no-responses-stable-item-ids` restores raw passthrough.

## Evidence locations

- Affected transcript: `C:\Users\yifguo\.codex\sessions\2026\09\04\rollout-2026-09-04T09-03-46-01a069ba-8351-7c51-b4c5-9adc5705e841.jsonl`
- Screenshot: `C:\Users\yifguo\AppData\Local\Temp\codex-clipboard-ae068ff0-5031-4601-8d1b-dfe96116ebdb.png`
