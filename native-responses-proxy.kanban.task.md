---
task_id: document_and_regression-test_responses_support
run_status: running
---

Collect context needed for the task below in [[native-responses-proxy.kanban.context]], then run the task

# Document and regression-test Responses support

Follow /kanban-runner SKILL. Read [[RESPONSES_API_IMPLEMENTATION_PLAN.md]] and all prior context. Update [[README.md]] with the native Responses endpoints, tested Codex custom-provider configuration, tested runtime version, model-support caveat, and security behavior. Run the full repository validation suite and repair only defects caused by this implementation. Ensure Chat Completions, Anthropic Messages, Models, and Embeddings remain unchanged.

## Verification

Transit task to `validating` with a one-sentence summary

Run `bun test`, `bun run typecheck`, `bun run lint:all`, and `bun run build`; all must pass. Record command results and documentation changes in context.

## Completion

- Update [[native-responses-proxy.kanban.context]]
- Transit task to `done` with a one-sentence summary and verification after validation or review passes
