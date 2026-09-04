# Stable item-ID causal decision

## Decision

**Causal for the observed Desktop double rendering.**

## Evidence

- Direct HTTP: 3 raw and 3 normalized trials for each of Sol and Sol Fast (12 total). Every trial returned `OK`, nine events, sequence `0..8`, and seven item references. Raw had seven unique IDs; normalized had one.
- Disposable Codex CLI 0.149.1: 3 raw and 3 normalized trials for each model (12 total). Every trial emitted one completed `OK` item and one same-ID transcript envelope pair.
- The Codex missing-start warning appeared in 6/6 raw trials and 0/6 normalized trials. Stable IDs are causal for lifecycle correlation.
- The affected Desktop session continued duplicating in raw mode. The user restarted only `copilot-api` with normalized mode on the same endpoint; a direct probe confirmed one unique ID, and the user confirmed the next response rendered without duplication.

## Limit

The Desktop normalized observation is one same-session trial, while the wire and disposable CLI matrices each have three trials per model and mode. This is enough to identify the causal trigger in the reported session, but not evidence for default-on rollout across Codex versions.

## Review action

The user supplied the required human rendering observation. Complete this review as **causal**, retain the default-off experiment, and treat any broader rollout as separately scoped work.
