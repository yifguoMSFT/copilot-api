# Inconsistent output item IDs in Copilot Responses streams

Last verified: 2026-09-15.

Copilot can return different item IDs across events for the same output item, even though it exposes the OpenAI Responses API format. This can prevent Codex from associating an item's completion with its start. The proxy's item-ID normalizer compensates for this observed incompatibility.

## Official OpenAI references

The [OpenAI Responses API reference](https://developers.openai.com/api/reference/resources/responses/) defines these fields:

| Object or event | Field | Official definition |
| --- | --- | --- |
| [Output message](https://developers.openai.com/api/reference/resources/responses/#%28resource%29%20responses%20%3E%20%28model%29%20response_output_message%20%3E%20%28schema%29%20%3E%20%28property%29%20id) | `id` | “The unique ID of the output message.” |
| [Text delta](https://developers.openai.com/api/reference/resources/responses/#%28resource%29%20responses%20%3E%20%28model%29%20response_text_delta_event%20%3E%20%28schema%29%20%3E%20%28property%29%20item_id) | `item_id` | “The ID of the output item that the text delta was added to.” |
| [Content-part added](https://developers.openai.com/api/reference/resources/responses/#%28resource%29%20responses%20%3E%20%28model%29%20response_content_part_added_event%20%3E%20%28schema%29%20%3E%20%28property%29%20item_id) | `item_id` | “The ID of the output item that the content part was added to.” |

These definitions establish identity and reference semantics: events referring to the same output item should reference that item's same unique ID. Different output items have different IDs. This is not a requirement for every item in a response, or every response in a session, to share one ID.

The consistency conclusion follows from the documented field meanings. We did not find a separate explicit sentence saying “IDs must remain constant across events.” These are OpenAI's API definitions, not a GitHub guarantee about Copilot's implementation.

## Observed mismatch and symptoms

An affected stream uses the same `output_index` while changing the referenced item ID:

| Event for `output_index: 0` | Raw item ID | Normalized item ID |
| --- | --- | --- |
| `response.output_item.added` | item-1 | item-1 |
| `response.content_part.added` | item-2 | item-1 |
| `response.output_text.delta` | item-3 | item-1 |
| `response.output_text.done` | item-4 | item-1 |
| `response.content_part.done` | item-5 | item-1 |
| `response.output_item.done` | item-6 | item-1 |
| `response.completed` output[0] | item-7 | item-1 |

The IDs above are anonymized labels. Event order and sequence numbers can be correct despite this mismatch.

The [September 4 experiment](../../RESPONSES_STREAM_COMPATIBILITY_EXPERIMENT_REPORT.md) recorded the Codex warning `item completed without a recorded start timestamp` in 6/6 raw CLI trials and 0/6 normalized trials. It also recorded one user-confirmed Desktop observation in which duplicate rendering stopped after restarting only the proxy with normalization enabled. The Desktop evidence is narrower than the repeated wire and CLI experiments.

## GPT-5.6 Luna reproduction

On September 15, three direct requests to `https://api.githubcopilot.com/responses` used `gpt-5.6-luna`, the prompt `Reply with exactly OK.`, `stream: true`, and `store: false`. Each request included a fresh session ID and client request ID.

| Measurement | Raw stream, all 3 trials | Same capture after normalization |
| --- | --- | --- |
| HTTP status | 200 | No additional upstream request |
| Output text | `OK` | `OK` |
| Events | 9 | 9 |
| Sequence numbers | `0..8` | `0..8` |
| References to output item 0 | 7 | 7 |
| Unique IDs for that item | 7 | 1 |

A deep equality comparison of parsed events, excluding item-ID fields, passed for each trial. All other event fields were preserved. The experiment reproduced the stream mismatch; it did not repeat the Desktop rendering test or test tool calls and multi-turn continuation.

See the [full Luna experiment report](../../LUNA_RESPONSES_ITEM_ID_EXPERIMENT_REPORT.md) for the method, environment, and limits.

## Proxy workaround

The [normalizer](../../src/routes/responses/sse-item-id-normalizer.ts) keeps a map local to each HTTP response from `output_index` to the first observed item ID. It uses that ID for supported item lifecycle events and the corresponding item in `response.completed.output`.

- Enabled by default for Copilot SSE responses through `/responses` and `/v1/responses`.
- Preserves event order, sequence numbers, and text; JSON serialization may change.
- Does not assign session IDs, merge conversations, deduplicate events, or rewrite the response-level ID or tool `call_id`.
- Passes unknown and malformed event frames through; it is not a general repair for every Responses event type.
- DeepSeek responses bypass this workaround.

Keep the workaround enabled while the mismatch persists. For a controlled comparison, `--no-responses-stable-item-ids` restores raw streaming passthrough; `--responses-stable-item-ids` enables normalization. A raw capture is necessary to verify whether an upstream fix has made normalization unnecessary.

Tests are in [the normalizer tests](../../tests/responses-sse-item-id-normalizer.test.ts) and [the Responses route tests](../../tests/responses-route.test.ts).
