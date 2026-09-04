---
task_id: decide_whether_stable_ids_are_causal
run_status: running
---

Collect context needed for the task below in [[responses-stream-item-id-experiment.kanban.context]], then run the task

# Decide whether stable IDs are causal

Follow /kanban-runner SKILL. Prepare a short decision from [[RESPONSES_STREAM_COMPATIBILITY_EXPERIMENT_REPORT.md]]. Approve no implementation beyond the experiment unless repeated same-state Desktop A/B runs show raw duplication and normalized single rendering. If Desktop evidence is unavailable or mixed, conclude inconclusive and stop.

## Verification

Transit task to `validating` with a one-sentence summary

The review file states the raw and normalized trial counts, Desktop state comparability, rendering outcome, counter-evidence, and one decision: causal, not causal, or inconclusive. Causal requires every success criterion in [[RESPONSES_STREAM_COMPATIBILITY_EXPERIMENT_PLAN.md]]; otherwise the decision is inconclusive or not causal.

## Review

Provide human-facing review instructions and context in [[responses-stream-item-id-experiment.kanban.review]]

## Completion

- Update [[responses-stream-item-id-experiment.kanban.context]]
- Update [[responses-stream-item-id-experiment.kanban.review]]
- Transit task to `review` with a one-sentence summary
- Reviewer transits task to `done` with a one-sentence summary and verification after review passes
