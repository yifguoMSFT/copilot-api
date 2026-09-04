---
task_id: implement_the_feature-gated_stable_item-id_experiment
run_status: running
---

Collect context needed for the task below in [[responses-stream-compatibility-experiment.kanban.context]], then run the task

# Implement the feature-gated stable item-ID experiment

Follow /kanban-runner SKILL. Implement only the Phase 3 experiment from [[RESPONSES_STREAM_COMPATIBILITY_EXPERIMENT_PLAN.md]]. Keep raw passthrough as the default. Correlate each logical (response identity, output_index) pair to one client-facing item ID and rewrite only documented item-ID locations while preserving sequence, text, fields, headers, unknown events, cancellation, and backpressure. Do not deduplicate text or lifecycle events. Update [[RESPONSES_STREAM_COMPATIBILITY_EXPERIMENT_REPORT.md]].

## Verification

Transit task to `validating` with a one-sentence summary

Run focused tests showing raw mode remains byte-identical, normalized mode uses one stable ID across all known event shapes and response.completed, separate output indices remain independent, unknown data is preserved, and ambiguous/malformed input follows the documented safe behavior.

## Completion

- Update [[responses-stream-compatibility-experiment.kanban.context]]
- Transit task to `done` with a one-sentence summary and verification after validation or review passes
