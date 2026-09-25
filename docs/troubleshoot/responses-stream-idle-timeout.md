# Codex stream disconnects after a pause

Investigated on 2026-09-24 for task `01a0d1be-f1d5-73a2-887e-a8bbdb62f0b1` (ADC #10483: Auth Validation and Proxy Logging).

## Diagnosis

The proxy inherited Bun's default 10-second HTTP idle timeout. A quiet period during a Responses stream could close the client connection before `response.completed` and cancel the upstream request. Codex then retried the same sampling request and encountered the same cutoff.

The observed error was:

```text
stream disconnected before completion: Transport error: network error: error decoding response body
```

This message does not by itself prove a compression or JSON error. An interrupted chunked HTTP body can also produce a body-read error. Here, the client received HTTP 200, `text/event-stream`, and valid output items before the failure. The recorded response headers had no `content-encoding` or `content-length`.

## Task evidence

Read-only Codex task history and diagnostic records in `~/.codex/logs_2.sqlite` identify `gpt-6-astra`, medium reasoning, and HTTP POSTs to `http://localhost:4141/v1/responses`.

| Turn | Start (JST) | Failure (JST) | Duration | Automatic retries |
| --- | --- | --- | --- | ---: |
| `01a0d1d5-5d85-70b0-a9a6-345c66aad6bd` | 14:13:36 | 14:17:35 | 239 seconds | 5 |
| `01a0d1d9-7667-7a60-885f-cb37bcf5a01b` | 14:18:04 | 14:20:23 | 138 seconds | 5 |

For the first turn, each failed attempt ended 10–12 seconds after response headers. For the second turn, the intervals were 9, 11, 9, 12, 10, and 11 seconds. These are header-to-error measurements, not exact idle durations; logs have whole-second timestamps and streaming activity can reset the idle timer.

For example, the last attempt returned HTTP 200 at 14:20:12 JST, logged a message item, and failed at 14:20:23. Its request ID was `6507bbcd-a2b4-46fa-be5a-2f95dd70ab57`.

At inspection, port 4141 belonged to Bun process 21536, started at 10:55:03 JST. The installed Bun version was 1.3.14. The `srvx` Bun adapter passes `options.bun` to `Bun.serve`; the proxy's startup previously supplied no idle-timeout override.

The task summary showed empty item arrays for the failed turns, but lower-level logs contained partial output and earlier tool activity. An empty failed-turn summary should not be interpreted as proof that no SSE data arrived.

## Controlled reproduction

Two local trials exercised the actual `runServer` startup, Responses route, and item-ID normalizer. Authentication and upstream requests were stubbed with synthetic data; no model calls or user credentials were needed. Each trial sent an initial SSE frame, paused for 14 seconds, then supplied the final item and `response.completed`.

| Configuration | Result | Elapsed | Upstream canceled |
| --- | --- | ---: | --- |
| Original Bun default | `ECONNRESET`, no completed response | 12.017 seconds | Yes |
| `bun: { idleTimeout: 0 }` | Completed stream with stable item IDs | 14.018 seconds | No |

The baseline emitted:

```text
[Bun.serve]: request timed out after 10 seconds. Pass `idleTimeout` to configure.
```

A separate direct `srvx` control produced the same result: default timeout failed around 12 seconds, disabled timeout completed after 14 seconds. The original running process's console output was not captured, so the historical diagnosis rests on task timing, active runtime identification, startup configuration, and the controlled reproduction.

## Fix and rollout

[Server startup](../../src/start.ts) now sets:

```typescript
serve({
  fetch: server.fetch,
  port: options.port,
  bun: { idleTimeout: 0 },
})
```

This disables Bun's server-level idle cutoff so quiet reasoning periods can finish. It does not change item-ID normalization, session-header forwarding, model selection, or client cancellation. It applies to the Bun server as a whole; an idle connection can remain open until the client, upstream, or another timeout closes it. Node's server settings are unaffected.

Rebuild and restart the proxy, then retry the affected task. Rebuilding alone does not update the already-running Bun process. The investigation did not restart the active proxy or retry the user's task, so recovery of that exact task remains to be verified after restart.

This addresses the reproduced local cutoff. It does not guarantee protection against unrelated upstream failures or network interruptions. It is separate from the [Copilot item-ID workaround](copilot-responses-item-ids.md).

Validation: startup-path A/B reproduction passed; focused ESLint, TypeScript, and build passed. The full test run passed 84 tests, with two runtime-configuration subprocess tests blocked by sandbox `EPERM`. Rerunning that seven-test file outside the sandbox passed all seven, covering the two blocked cases. The production bundle was rebuilt with the fix.
