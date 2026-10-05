# GPT-5.6 Luna Responses item-ID experiment

The item-ID mismatch reproduced in all three direct Copilot requests. Keep the Copilot item-ID normalizer enabled.

## Method

- Completed: 2026-09-15 05:30:41 UTC (14:30:41 JST).
- Requested model: `gpt-5.6-luna`.
- Endpoint: `https://api.githubcopilot.com/responses`.
- Prompt: `Reply with exactly OK.`
- Request options: `stream: true`, `store: false`.
- Three sequential requests, each with a fresh session ID and client request ID, with 1.5 seconds between requests.
- Used the existing Copilot login and the current `createResponses` service directly, bypassing the route's automatic normalization. The editor-version header used the repository fallback, `vscode/1.104.3`.
- Compared each raw capture with that same capture passed through `normalizeResponsesItemIds`. This required three model calls total.
- Workspace base: `f662a30`, with the current uncommitted header-forwarding changes. The normalizer itself was unchanged.

## Results

| Trial | HTTP | Output | Events | Sequence numbers | References to output item 0 | Raw unique IDs | Normalized unique IDs |
| --- | --- | --- | ---: | --- | ---: | ---: | ---: |
| 1 | 200 | `OK` | 9 | `0..8` | 7 | 7 | 1 |
| 2 | 200 | `OK` | 9 | `0..8` | 7 | 7 | 1 |
| 3 | 200 | `OK` | 9 | `0..8` | 7 | 7 | 1 |

All three streams completed. The same anonymized lifecycle appeared in each:

| Sequence | Event | Raw item ID | Normalized item ID |
| ---: | --- | --- | --- |
| 0 | `response.created` | — | — |
| 1 | `response.in_progress` | — | — |
| 2 | `response.output_item.added` | item-1 | item-1 |
| 3 | `response.content_part.added` | item-2 | item-1 |
| 4 | `response.output_text.delta` | item-3 | item-1 |
| 5 | `response.output_text.done` | item-4 | item-1 |
| 6 | `response.content_part.done` | item-5 | item-1 |
| 7 | `response.output_item.done` | item-6 | item-1 |
| 8 | `response.completed` output[0] | item-7 | item-1 |

For each trial, a deep equality assertion verified that the parsed events were identical after excluding item-ID fields. Event count, order, sequence numbers, response IDs, text, and all other event fields were preserved. This verifies semantic preservation, not byte-for-byte JSON formatting.

## Conclusion and limits

The current Copilot endpoint still emits inconsistent IDs for one Luna output item, even when a session ID is supplied. The existing normalizer corrects the inconsistency in all three captures.

This is a live wire-protocol reproduction. It does not repeat the Codex Desktop rendering experiment or test tool calls, multi-turn continuation, or every model. The earlier Desktop and CLI evidence is recorded in [the original experiment report](RESPONSES_STREAM_COMPATIBILITY_EXPERIMENT_REPORT.md).

Only aggregate results and anonymized IDs are recorded here. Credentials and raw opaque IDs were not printed or persisted. The disposable probe and sanitized JSON summary are in `dist/luna-item-id-probe.ts` and `dist/luna-item-id-probe-results.json`; build output cleanup may remove them.
