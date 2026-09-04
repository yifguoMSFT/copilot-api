---
title: Responses Stream Item-ID Experiment
status: draft
last_updated: 2026-09-04
---

# Responses Stream Item-ID Experiment

## Problem

After a Codex desktop upgrade, commentary and final messages can render twice when Codex uses this proxy's Responses endpoint. The proxy forwards one upstream response body, and captured GitHub Copilot streams contain one ordered lifecycle, not duplicate events. However, every lifecycle event for one logical output item uses a different item ID.

Session history stores each logical assistant item in two envelope types. Older Codex builds also stored both envelopes without rendering duplicates, so unstable upstream IDs are a plausible trigger, not a proven cause.

## Goal

Determine whether making item IDs stable is sufficient to stop duplicate rendering.

Success requires all of the following in paired runs with the same Codex state, model, and prompt:

- raw passthrough reproduces duplication;
- normalized mode renders one commentary item and one final item;
- normalized events keep their original order, count, text, and sequence numbers;
- all events for one `output_index` use the first observed item ID;
- disabling normalized mode restores exact raw passthrough.

If the Desktop A/B comparison cannot be run, or normalization does not consistently change rendering, the result is inconclusive and no fix is shipped.

## Non-goals

- Fixing Codex's transcript-envelope rendering.
- Deduplicating text or events.
- Building a general SSE library, diagnostic subsystem, telemetry, or production rollout framework.
- Supporting hypothetical continuation or tool-ID translation before evidence shows it is needed.
- Changing model discovery, authentication, or request translation.

## Minimal design

Add one off-by-default server flag: `--responses-stable-item-ids`.

When the flag is disabled, return the upstream body exactly as today. When enabled for an SSE Responses body:

1. Buffer only until the next SSE frame boundary.
2. Parse the single JSON `data:` line used by the captured Copilot stream.
3. Store the first item ID seen for each `output_index` in a map local to that HTTP response.
4. Replace IDs only in the observed lifecycle fields:
   - `response.output_item.added/done.item.id`;
   - `response.content_part.added/done.item_id`;
   - `response.output_text.delta/done.item_id`;
   - `response.completed.response.output[index].id`.
5. Pass unknown, malformed, or unsupported frames through unchanged.

One HTTP stream contains one response, so the response-local map needs no separate response-identity key, global cleanup, timeout, counter, callback, or reverse mapping. Native stream piping supplies backpressure and cancellation behavior.

This is an experiment, not an approved compatibility layer.

## Verification

Automated checks must prove only the contract introduced by the experiment:

- the existing route test still proves raw SSE passthrough is byte-identical;
- one lifecycle is rewritten to its first item ID without changing text;
- two output indices remain independent;
- frame boundaries split across chunks are handled;
- unknown and malformed frames pass through unchanged;
- focused tests, TypeScript, and lint pass.

## Experiment

Use `Reply with exactly OK.` for three raw and three normalized runs on each of `gpt-5.6-sol` and `gpt-5.6-sol-fast`.

For every run, record:

- model, mode, Codex version, and whether the process was fresh or already affected;
- event types, sequence numbers, item-ID cardinality, and client correlation warnings;
- whether commentary and final output rendered once or twice;
- the matching session-history envelope count.

Direct HTTP and disposable `codex exec` runs verify the wire transform and client correlation warning. They do not prove the Desktop rendering result. The causal decision requires a Desktop raw/normalized A/B comparison in the same client-state category.

## Decision

- Ship nothing if the result is inconclusive or normalization does not remove duplication.
- If normalization removes duplication in repeated Desktop A/B runs, stop and review the evidence before adding tool, continuation, or rollout work.
- Any later production design is a separate plan based on observed requirements, not part of this experiment.

## Evidence already collected

- Sol and Sol Fast each produced nine ordered events with sequence numbers `0..8` and seven different item IDs for one output item.
- No upstream lifecycle event was duplicated.
- Fresh disposable Codex CLI runs emitted one logical result but warned that an item completed without a recorded start timestamp.
- The affected Desktop transcript contains same-ID `event_msg/item_completed` and `response_item/message` envelope pairs for both commentary and final output.

Detailed sanitized evidence is in [[RESPONSES_STREAM_COMPATIBILITY_EXPERIMENT_REPORT.md]].
