---
status: draft for discussion
owner: TBD
reviewers: []
approvers: []
tracking: local design proposal
last_updated: 2026-09-17
---

# Model and Session Usage Metrics Pipeline

## Summary

The proxy exposes provider usage in API responses but does not retain calculated history by model or session. Add an in-memory metrics pipeline with a bounded queue and exactly one processor that writes SQLite. Persist only calculated aggregates: daily, weekly, and monthly model metrics, plus cumulative usage by session and model. **No raw request/response data or per-request records are stored.**

Each finalized request produces a small metrics delta in memory. The processor coalesces queued deltas and atomically updates all applicable period aggregates and session aggregates. Daily data is retained for 60 calendar dates, weekly data for 53 calendar weeks, and monthly data for 12 calendar months. Session retention is separate, with a proposed default of 365 days of inactivity. This document is a design proposal; it does not implement tracking or create a database.

## Background and scope

The existing `/usage` endpoint reports a GitHub Copilot account quota snapshot, potentially including activity outside this proxy. It cannot show this proxy's historical model or session consumption. The current Responses handler extracts some usage for alias logs, Chat Completions and embeddings expose upstream token counts, and Messages translates Copilot Chat Completions usage to Anthropic fields.

The metrics pipeline covers Responses, Chat Completions, Messages, and embeddings. It counts model requests, reported token usage, cache/reasoning details, Copilot nano-AIU, outcomes, and timing. Stats queries, quota lookup, model listing, token lookup, and token-estimation calls do not count as inference traffic.

Requirements:

- Retain calculated metrics only. No request rows, request IDs, response bodies, payload archives, individual timing records, or durable request-event queue.
- Calculate and persist metrics by `(provider, model)`, where model is the routed upstream model after alias resolution.
- Use one bounded queue feeding one processor with the only writable SQLite connection.
- Update time-period totals and session totals in the same transaction.
- Maintain session usage by `(session_id, provider, model)` so switching models inside a session remains visible.
- Distinguish missing/partial usage from provider-reported zero and keep duplicate terminal events from increasing totals.

Initial scope excludes account billing, monetary price calculation, arbitrary raw-data queries, per-user attribution, distributed ingestion, and historical log import.

## Proposed architecture

### 1. Data flow

```text
Responses / Chat / Messages / Embeddings
                  |
     Observe provider usage in memory
                  |
     Normalize and finalize exactly once
                  |
    Calculated MetricsDelta (no raw content)
                  |
       Bounded in-memory FIFO queue
                  |
        ONE metrics processor
       coalesce by aggregate keys
                  |
          ONE SQLite transaction
       +----------+-----------+
       |                      |
   model_usage           session_usage
 day / week / month     session + model
       +----------+-----------+
                  |
       Commit batch checkpoint
                  |
     Acknowledge and release memory
```

*Figure 1. Proposed metrics pipeline. All database mutations, including migrations, retention, and checkpoints, belong to the processor.*

| Component | Responsibility |
| --- | --- |
| Request-local observer | Read upstream usage and timing; keep only bounded transient state; finalize once. |
| Normalizer | Convert provider-specific snapshots into calculated counters and metric sums. |
| Queue | Hold calculated deltas until the processor acknowledges a committed batch. |
| Single processor | Coalesce, validate, update both aggregate tables, manage retries/checkpoints and retention. |
| Read-only query layer | Fetch period series and per-session totals without direct write access. |

There is no persistent request-event table or replay archive. SQLite's WAL contains aggregate database transactions, not raw API events. The queue temporarily holds calculated deltas only and never serializes them to disk or logs.

### 2. Model and session dimensions

Use the resolved route's `(provider, model)` as the accounting key. `codex-auto-review` contributes to `copilot / gpt-5.6-luna`. Aliases do not create separate model totals. Group all inference API families into the same model counters initially; endpoint and requested-alias breakdowns are not retained. A provider-reported model difference can increment a diagnostic, but it must not split accounting unpredictably between keys during a request.

A failure before model/provider resolution contributes to an explicit `unknown / unknown` model row, with no token values invented. This exposes rejected/unparseable traffic without storing request details. Validate and bound model names to avoid unbounded or malformed keys; unknown names are not inferred from free text.

Use the **incoming `session_id` HTTP header** as the initial session identity contract. It appears in the current Responses header-forwarding fixtures. Read it before upstream forwarding, including for DeepSeek, whose upstream header policy is separate. The other inference routes may use the same inbound header for tracking even if they do not forward it upstream.

- Header names are case-insensitive; the nonempty session value is an opaque, case-sensitive identifier after trimming outer whitespace. Proposed maximum: 256 UTF-8 bytes; invalid/oversized values are treated as missing and counted diagnostically.
- Do not derive a session from `x-request-id`, response IDs, prompts, cookies, or upstream response headers. Other client header conventions require an explicit mapping backed by a fixture; there is no guessed fallback.
- Without a valid session ID, update model aggregates only and increment `requests_without_session`. Do not create an `unknown` session or generate a new session ID for each request.
- The database represents one proxy installation/namespace. Clients must use stable IDs within a session and distinct IDs across sessions; identical values from different clients are indistinguishable. Shared multi-tenant installations would need an explicit namespace extension.
- A session changing models gets multiple session rows. The session query returns a per-model breakdown and a calculated overall summary. Token quantities can be summed; provider-specific units retain their provider label.

The session ID is retained only as the required aggregate lookup key. No turn IDs, individual request timestamps, session content, or session request list is retained. `first_seen` and `last_seen` are aggregate bounds, not a request timeline.

### 3. Observation and finalization

Create one in-memory observer at inference handler entry, before approval, pacing, parsing, and routing. Attach it to the shared service call rather than instrumenting both translated and upstream responses as independent requests.

- **Responses:** inspect the upstream stream before the Copilot item-ID normalizer; emit original bytes without reserialization.
- **Chat and Messages:** inspect Copilot Chat Completions JSON/chunks before the Messages translator. That translator currently ignores empty `choices` chunks, so capture usage-only final chunks before it runs.
- **Embeddings:** inspect the already parsed service result.
- **Local failure:** finalize once from the failure path, with the model/session context known at that point.

Treat provider usage objects as cumulative snapshots. A terminal object replaces provisional usage rather than incrementing it. Finalize a single delta at body EOF, cancellation, or error; terminal events update the observer but do not enqueue separate requests. A finalization guard prevents terminal/EOF/cancel callbacks from emitting multiple deltas. A new client retry is a new inference and counts again.

For streaming, use a readable wrapper with explicit close/error/cancel handling and upstream cancellation propagation. A transform `flush` callback alone does not cover cancellation. Incrementally parse SSE with UTF-8 chunk boundaries, LF/CRLF, multiple `data:` lines, comments, and `[DONE]`; pass through original chunks. Cap retained observation data, initially 1 MiB per frame. Oversized/malformed frames are skipped for observation and counted diagnostically, without interrupting forwarding. Resume at the next frame boundary.

Reuse parsed chat/embedding JSON; bounded JSON observation is needed for pass-through non-streaming Responses. Oversized JSON gives a request count with unavailable usage. Do not clone and retain entire responses for accounting. Do not change upstream payloads to request extra usage in this initial design.

### 4. Calculated metrics

| Metric | Responses source | Chat/Messages upstream source | Embeddings source |
| --- | --- | --- | --- |
| Input tokens | `usage.input_tokens` | `usage.prompt_tokens` | `usage.prompt_tokens` |
| Output tokens | `usage.output_tokens` | `usage.completion_tokens` | Not applicable |
| Total tokens | `usage.total_tokens` | `usage.total_tokens` | `usage.total_tokens` |
| Cache-read tokens | `usage.input_tokens_details.cached_tokens` | `usage.prompt_tokens_details.cached_tokens` | Not mapped initially |
| Cache-write tokens | `usage.input_tokens_details.cache_write_tokens`, when verified | Requires verified mapping | Not mapped initially |
| Reasoning tokens | `usage.output_tokens_details.reasoning_tokens` | Requires verified completion-detail mapping | Not applicable |
| Copilot nano-AIU | `copilot_usage.total_nano_aiu` on the Copilot envelope | Requires verified mapping | Not mapped initially |

For SSE Responses, usage is inside the terminal event's `response`; an existing Copilot fixture puts `copilot_usage` beside `response`. Do not recursively search arbitrary JSON or assume unverified DeepSeek detail fields. Add mappings using representative provider fixtures.

The calculated counter block contains:

- Request count, dispatched count, success/incomplete/error/rejected/unknown outcome counts, cancelled-delivery count, and requests without a valid session ID. Outcome counters form a partition of requests; cancellation is independent of outcome.
- For each reported usage metric: **sum and reporting-request count**. A reported zero increments coverage; missing values increment neither sum nor coverage. Default totals include authoritative usage only. Track partial-usage request count separately without retaining provisional token sums initially.
- Duration sum, sample count, and maximum. Duration is arrival to local body end, including approval/pacing/client backpressure, measured with a monotonic clock. It does not prove all bytes were consumed by the client.
- Observation-limited and invalid-metric counters, so extraction limitations are visible.

Rules:

1. Normalized upstream input includes cached input. Cache/reasoning are detail metrics, not additional tokens to add to reported totals. Capture Messages before its cache subtraction and synthesized zeros.
2. Missing, negative, fractional, malformed, or unsafe numeric fields produce no metric contribution. Keep zero distinct through the coverage count. Do not replace missing provider totals with locally estimated counts.
3. JSON completion or a verified protocol terminal establishes authoritative usage. Responses completed/failed/incomplete terminal events count; chat requires its terminal contract such as `[DONE]`. Bare streaming EOF without confirmation is partial/missing.
4. Errors/incomplete responses can report consumed tokens. Count authoritative usage regardless of success. HTTP 200 alone does not establish successful generation.
5. A terminal generation followed by client cancellation may contribute successful generation, cancelled delivery, and authoritative usage. Cancellation before final usage contributes counts and partial/missing coverage only.
6. Use the last valid terminal snapshot before finalization, recording conflicting repeated snapshots as a diagnostic. Independently supplied nano-AIU is not erased merely because a later token-only snapshot omits it.
7. Keep integer nano-AIU units; divide by 1,000,000,000 for AIU display, not for currency conversion.

A delta carries calculated counters, model/provider, optional session key, its day/week/month bucket keys, and transient first/last activity bounds. It contains no request ID, raw payload, headers, response event, or text. The processor merges equal keys within each batch before issuing SQL.

For example, three Luna requests with input values 100, 0, and missing produce `requests=3`, `input_tokens_sum=100`, and `input_tokens_samples=2`. Each applicable time bucket gets that contribution. If all three belong to session S, S's Luna row gets the same contribution. This is four views of the same traffic, not four requests to add together.

## Queue and single-writer contract

Only one processor owns a writable connection. Route handlers, query handlers, timers, and CLI readers cannot execute mutations. Retention and metadata updates are scheduled inside the same processor loop. Use read-only SQLite connections for stats queries. The deployment supports one proxy process per database and should enforce an exclusive ownership lock before opening the writer; a second process must refuse tracking ownership. A stale ownership lock after a crash requires verifying that its owner has exited before removal. SQLite's own write serialization is not a substitute for this ownership rule.

Start with a FIFO limit of 5,000 deltas **and** an 8 MiB byte budget, and drain batches of at most 100 deltas or after 250 ms. These are proposed tuning defaults to validate. Include in-flight data and worker message channels in the bounds; use credits/acknowledgements so `postMessage` cannot hide an unbounded second queue. SQL execution runs in the processor worker, away from the HTTP event loop.

For each batch:

1. Reserve an ordered batch sequence; keep that immutable batch until its outcome is known.
2. Coalesce calculated values by period/provider/model and session/provider/model.
3. Start a transaction and inspect the processor checkpoint.
4. Add the period counters, add the session counters, and update the checkpoint in the **same transaction**.
5. Commit, acknowledge that batch, then release its memory. Process no later batch while the current outcome is uncertain.

Use one checkpoint row containing `(writer_run_id, last_batch_sequence)`. Assign a new run ID only after exclusive ownership is established. For the current run, a matching already-committed sequence is acknowledged without applying it again; the next expected sequence is applied. Gaps or older out-of-order sequences are errors, not invitations to guess. This prevents double addition when commit succeeds but an acknowledgement is lost. A busy/rolled-back batch retries with identical sequence and values. Do not use per-request deduplication records.

On full process restart, queued data is gone and must not be replayed from logs. A fresh writer run resets the run checkpoint through the processor. A processor-worker restart inside a surviving proxy must reconnect to the existing run/checkpoint before retrying a retained batch. This provides safe live retries, not crash-proof exactly-once ingestion.

**Availability policy:** keep a bounded in-memory queue and fail open for inference. Queue saturation rejects a new metrics delta, increments a drop diagnostic, and does not stall the API indefinitely. A queue provides ordering and serialization, not durability. Process termination can lose active observations and uncommitted metrics. If lossless collection becomes required, discuss durable aggregate checkpoints or admission backpressure explicitly; do not introduce raw request persistence as a workaround.

## SQLite model

Use two aggregate tables plus a small metadata/checkpoint table. Both aggregate tables contain the same typed counter block; different primary keys express period history and session totals. All counters below are nonnegative signed 64-bit integers. The DDL is illustrative and shows input tokens and duration explicitly; implementation adds the remaining sum/sample and outcome columns from the counter contract before declaring schema version 1 complete.

```sql
CREATE TABLE tracking_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
) STRICT;

CREATE TABLE model_usage (
  granularity TEXT NOT NULL CHECK (granularity IN ('day', 'week', 'month')),
  bucket_start TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  requests INTEGER NOT NULL CHECK (requests >= 0),
  requests_without_session INTEGER NOT NULL CHECK (requests_without_session >= 0),
  input_tokens_sum INTEGER NOT NULL CHECK (input_tokens_sum >= 0),
  input_tokens_samples INTEGER NOT NULL CHECK (input_tokens_samples >= 0),
  duration_us_sum INTEGER NOT NULL CHECK (duration_us_sum >= 0),
  duration_samples INTEGER NOT NULL CHECK (duration_samples >= 0),
  duration_us_max INTEGER NOT NULL CHECK (duration_us_max >= 0),
  PRIMARY KEY (granularity, bucket_start, provider, model)
) STRICT;

CREATE TABLE session_usage (
  session_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  first_seen_ms INTEGER NOT NULL,
  last_seen_ms INTEGER NOT NULL,
  requests INTEGER NOT NULL CHECK (requests >= 0),
  requests_without_session INTEGER NOT NULL CHECK (requests_without_session >= 0),
  input_tokens_sum INTEGER NOT NULL CHECK (input_tokens_sum >= 0),
  input_tokens_samples INTEGER NOT NULL CHECK (input_tokens_samples >= 0),
  duration_us_sum INTEGER NOT NULL CHECK (duration_us_sum >= 0),
  duration_samples INTEGER NOT NULL CHECK (duration_samples >= 0),
  duration_us_max INTEGER NOT NULL CHECK (duration_us_max >= 0),
  PRIMARY KEY (session_id, provider, model)
) STRICT;

CREATE INDEX session_usage_last_seen ON session_usage(last_seen_ms);
```

*Listing 1. Proposed aggregate table skeleton — `src/lib/tracking/migrations.ts` (new module). Session rows always have zero `requests_without_session`; the shared counter block simplifies identical reducers.*

Metadata stores schema/counter-contract version, timezone, collection start, retention boundaries, aggregate loss counters, and the single writer checkpoint. It does not store per-request information. `bucket_start` is the first local date of the selected period, including a first-of-month date for monthly rows.

UPSERT adds sums/counts and takes maxima. Session UPSERT also takes `MIN(first_seen_ms)` and `MAX(last_seen_ms)`. A prepared period update has this shape:

```sql
INSERT INTO model_usage VALUES (
  :granularity, :bucket_start, :provider, :model,
  :requests, :requests_without_session, :input_tokens_sum,
  :input_tokens_samples, :duration_us_sum, :duration_samples, :duration_us_max
)
ON CONFLICT (granularity, bucket_start, provider, model) DO UPDATE SET
  requests = requests + excluded.requests,
  requests_without_session = requests_without_session + excluded.requests_without_session,
  input_tokens_sum = input_tokens_sum + excluded.input_tokens_sum,
  input_tokens_samples = input_tokens_samples + excluded.input_tokens_samples,
  duration_us_sum = duration_us_sum + excluded.duration_us_sum,
  duration_samples = duration_samples + excluded.duration_samples,
  duration_us_max = MAX(duration_us_max, excluded.duration_us_max);
```

*Listing 2. Illustrative additive UPSERT for the skeleton — `src/lib/tracking/store.ts` (new module). This executes only inside the checkpointed processor transaction; use explicit insert columns in the complete implementation.*

Use integer microseconds for aggregate durations and BigInt for arithmetic/SQLite reads. Provider JSON numbers must be validated before conversion. Guard addition and SQL query SUM against 64-bit overflow; do not let SQLite silently promote an overflowing addition to REAL or a driver round a large value into a JavaScript Number. Return token/unit totals as decimal strings in JSON; expose durations in documented units.

Storage grows with active `(period, provider, model)` keys and `(session, provider, model)` keys, not request count. With 20 model/provider combinations, the default time windows need at most `20 × (60 + 53 + 12) = 2,500` period rows. Session storage depends on distinct sessions/model combinations, so it needs its own expiry policy.

## Period and session retention

| Aggregate | Default retention | Boundary |
| --- | --- | --- |
| Daily model metrics | Current date plus 59 previous dates | Local calendar dates. |
| Weekly model metrics | Current week plus 52 previous weeks | Monday-start weeks; approximately one year. |
| Monthly model metrics | Current month plus 11 previous months | Calendar months. |
| Session/model usage | Proposed: expire the whole session after 365 inactive days | Latest activity across all of that session's model rows. |

These are separate retained views. Every delta updates all three applicable periods directly; weekly and monthly data are never reconstructed from expiring daily rows. Never promote a daily total into an already-updated weekly/monthly row, which would count it twice. Retention deletes only expired keys, without moving or re-aggregating data.

Use one persisted IANA timezone per database. Default to `UTC`, with explicit `Asia/Tokyo` configuration for this installation. Bucket by request arrival; a request crossing midnight belongs to its start periods and becomes visible after finalization. Duration uses a monotonic clock. Calendar boundaries use timezone-aware arithmetic, not fixed 24-hour/30-day approximations.

For `Asia/Tokyo` on 2026-09-17, retained daily dates begin 2026-07-20, the current week begins 2026-09-14, and retained months begin 2025-10-01. Current buckets are partial. A database first enabled partway through a period also has incomplete coverage. Return collection start, retention boundaries, and loss diagnostics with query results.

Run cleanup on startup and daily through the processor. Recheck cutoffs when committing a delayed batch: skip an expired daily target while still updating any retained weekly/monthly targets. Session contribution is independent of period expiry. Retention and aggregate writes are serialized so cleanup cannot race a transaction and recreate an expired time bucket.

Session first/last activity uses the min arrival and max finalization times of observed requests. **Expire by whole session ID**, using `MAX(last_seen_ms)` over all its model rows. Do not delete an older model row merely because the session recently used a different model. An active session retains its accumulated totals, potentially longer than a year. After a session expires, a later request using the same ID starts a new retained total with new activity bounds. The API labels these as totals for retained observations, not a guaranteed lifetime since the client's original session creation.

Without raw history, old calendar keys cannot be rebucketed accurately into another timezone, and missing dimensions cannot be added retrospectively. A timezone or incompatible metric-definition change starts a new database/collection epoch. Do not silently rewrite or merge incompatible history. This loss of retrospective flexibility is the intended tradeoff for aggregate-only storage.

## Query interface

```text
GET /stats/series?bucket=day&periods=60
GET /stats/series?bucket=week&periods=53
GET /stats/series?bucket=month&periods=12&provider=copilot&model=gpt-5.6-luna
GET /stats/session?session_id=<url-encoded-session-id>
```

*Listing 3. Proposed interfaces — `src/routes/stats/route.ts` (new module).*

Period queries select exactly one granularity, with optional exact provider/model filters. Return per-model series and a summary summed across those same selected buckets. Do not combine day/week/month tables into a single total: they overlap. Queries use whole retained buckets; do not claim an exact arbitrary sub-day range or a daily breakdown after daily aggregates have expired.

Session queries return each `(provider, model)` row and a calculated session summary, with first/last observed activity. Session usage has no per-day breakdown and does not share the period-retention window. Consequently, session totals need not equal a 60-day model chart. Missing session IDs contribute to model totals only; `requests_without_session` makes that difference explicit.

Counts and sums compose by addition, maxima by MAX, averages by `SUM(duration)/SUM(samples)`. Never average stored averages. A metric with zero reporting samples returns a null reported total; with samples it returns its sum, including a valid zero. Example: input sum 100 with two samples and three requests yields `reported_total="100"`, `reporting_requests=2`, `requests=3`.

If cache hit ratio is added, persist paired input/cache sums for only observations where both fields are known; marginal sums alone cannot reconstruct that ratio after aggregation. Percentiles likewise require a defined histogram/sketch and are not part of the initial counter block.

Generate empty date buckets at query time. Distinguish an observed bucket with zero traffic from time before collection/after pruning. A grouped summary and its series should use one read snapshot. Bound period counts to the configured retention and limit returned model groups; reject excessive queries rather than silently omitting models. Bind input values and whitelist query shapes.

Invalid parameters return 400; unavailable/disabled tracking returns a clear 503 metrics error. A valid but unknown/expired session returns 404 without inventing a zero-usage session. Include pending-queue depth, last commit time, loss counters, and reporting coverage so callers understand eventual consistency. Queries see committed aggregates, not queued deltas.

The existing `/usage` remains a Copilot quota endpoint. A subsequent dashboard or CLI can consume the stats endpoints for model charts and session lookup. Do not expose session identifiers through a public unbounded session-list endpoint initially. The current server has CORS and no inbound authentication middleware; use the existing trusted local boundary or an authenticated reverse proxy for remote access. Session IDs are lookup dimensions, not authentication credentials.

## Configuration and runtime

```json
{
  "version": 1,
  "defaults": {
    "tracking": {
      "enabled": true,
      "databaseFile": "./data/usage.sqlite",
      "timezone": "Asia/Tokyo",
      "retention": {
        "dailyPeriods": 60,
        "weeklyPeriods": 53,
        "monthlyPeriods": 12,
        "sessionIdleDays": 365
      }
    }
  }
}
```

*Listing 4. Proposed tracking configuration — `config.example.json`. The current strict runtime schema needs an explicit extension before it accepts these fields.*

Follow the existing default/environment merge and file-relative path rules. Initial built-in tracking is disabled, database location is `<home>/.local/share/copilot-api/usage.sqlite`, timezone is UTC, and retention uses the values above. Validate positive retention counts and timezone. Increasing retention later cannot restore deleted metrics. Proposed environment overrides are tracking enablement and an absolute database file; keep queue tuning internal until measurements justify operator options.

The source uses Bun while the executable targets Node. Prototype worker startup, SQLite transactions, and BigInt operations with `bun:sqlite` under Bun and `node:sqlite` under the supported Node baseline. Defer runtime-specific imports until tracking starts. If the acceptable Node baseline lacks required APIs, evaluate a packaged driver before changing that baseline. No ORM or general-purpose database layer is needed; a small driver module can serve the processor and read-only queries.

Use SQLite WAL on a local filesystem with short write transactions, bounded busy retries, and read-only query connections. Document the one-process/one-writer ownership lock, worker packaging on Windows/Linux, and shutdown. All migration, retention, metadata, and checkpoint writes go through the processor, not a second maintenance writer.

Persistent disk content consists only of aggregate tables, metadata/checkpoints, and their SQLite WAL/SHM files. Mount the whole database directory in Docker, add these file patterns to ignore rules during implementation, and use SQLite-aware backup or stop/checkpoint before copying. Retention frees reusable pages but does not necessarily shrink the database file. Optional offline compaction belongs in maintenance, not the inference path.

## Failure behavior and observability

- **Busy/locked database:** retry the current immutable batch. Transaction rollback means none of its period/session updates took effect; checkpoint recovery avoids duplicating a committed batch.
- **Disk full, corruption, or permissions:** enter degraded metrics mode, expose health, keep only the bounded queue, and emit rate-limited diagnostics without raw content. Inference remains available.
- **Queue saturation:** drop a new delta and increment a pipeline loss counter. Do not silently claim complete accounting. No on-disk request spool is introduced.
- **Worker failure:** stop accepting unbounded worker messages; restart under the same writer run if its parent retains the in-flight batch, consult the committed checkpoint, then retry or acknowledge.
- **Full process crash:** committed aggregates survive according to SQLite durability guarantees; volatile pending metrics and in-flight observations can be lost. No request replay is possible or promised.
- **Shutdown:** stop admission, let active observers finish within a deadline, drain final deltas, commit, and close the processor. Report remaining lost metric counts when possible.

Expose accepted/coalesced/committed/dropped delta counts, queue depth/bytes/oldest age, batch latency, last committed sequence/time, writer health, invalid/missing-session counts, observation limits, and metric validation errors. Runtime diagnostics are calculated pipeline metrics, not request records. Persist diagnostic aggregates through the same processor when storage works. A crash may lose uncommitted loss counters, so zero reported losses cannot prove completeness.

Counter-definition versions matter because aggregate-only history cannot be re-extracted. Define normalization before rollout, migrate additive schema extensions transactionally, and use a new collection epoch for incompatible semantics. An unknown newer schema disables tracking with a diagnostic rather than attempting destructive recovery.

## Alternatives and tradeoffs

| Option | Assessment |
| --- | --- |
| Raw request history with long retention | Outside scope: storage grows with traffic and raw details are unnecessary for these metrics. |
| Independent writes from each handler | Violates the single-processor contract and complicates partial updates/retries. |
| Daily aggregates only | Cannot keep weekly/monthly history once 60-day daily data expires without a separate promotion protocol. |
| Direct day/week/month and session updates in one transaction | Recommended: fixed period keys, immediate consistency across views, independent retention. |
| Durable raw-event queue | Outside scope. The queue is memory-only calculated deltas; no payload/request archive. |
| External queue plus distributed database | Adds infrastructure beyond this single local writer design. |

Period tables intentionally duplicate calculated totals at three granularities to support different retention horizons. Atomic updates and batch checkpoints keep those views aligned. The session table adds only distinct session/model rows. Raw drilldown, historical reclassification, and perfect recovery of volatile data are deliberately unavailable.

## Testing and acceptance criteria

1. **Extraction and reduction:** provider JSON/SSE fixtures for Responses, chat, Messages, embeddings; zero versus missing; cache accounting; reported errors/incomplete; final usage-only chunks; duplicate/conflicting terminal events; alias-to-model grouping. Hand-calculated deltas must match.
2. **Session attribution:** stable incoming `session_id`, missing/invalid ID, distinct IDs, same ID across models/providers, no upstream-ID substitution, session model switches, whole-session idle expiry, and reuse after expiry. Requests without IDs must affect model totals without creating session rows.
3. **Single writer:** concurrent route finalizations all enqueue; migrations, cleanup, metadata, and aggregates execute on the sole processor connection. Verify the process ownership guard and read-only query connections.
4. **Atomicity/idempotency:** inject failure between period and session updates, before commit, and after commit before acknowledgement. Verify rollback or a single committed application across every view; retrying the same batch must not double-add. Test worker restart with a surviving queue/checkpoint and fresh process restart without replay.
5. **Calendars/retention:** 60 daily/53 weekly/12 monthly windows, Monday/year transitions, leap years, DST, midnight crossing, delayed batches, partial buckets, and cleanup interleaving. Expiring daily rows must not alter weekly/monthly/session totals.
6. **No raw persistence:** inspect SQLite schema, DB/WAL, and tracking logs for marker payloads from test requests. Only aggregates, dimension keys, aggregate bounds, and checkpoint/health metadata may appear. No event/request table or disk queue may be created. Validate tracking code does not extend existing content logs.
7. **Bounded resource/failure tests:** fill both queue limits, slow the reader, split Unicode/SSE frames, overflow parser buffers, simulate busy/full/unwritable SQLite, worker errors, and shutdown deadlines. Verify counted losses and inference behavior.
8. **Queries/numbers:** no cross-granularity double sum; weighted averages; per-field coverage; null when no samples; BigInt values beyond Number precision; guarded 64-bit overflow; same-snapshot summaries; no session-lifetime claim after expiry.
9. **Runtime/performance:** run Bun tests, lint, typecheck, build, supported Bun/Node built-CLI tests, and Windows/Docker worker checks. Seed high request volume but fixed aggregate keys to prove period-row count does not scale with requests; separately seed high distinct-session cardinality to test expiry/query performance. Target less than 5 ms additional p95 time-to-first-byte and subsecond default chart queries on a documented reference machine; these are targets, not measured results.

## Implementation plan and rollout

| Step | Work | Exit condition |
| --- | --- | --- |
| 1. Freeze metrics contract | Model/session keys, counter reducer, provider fixtures, runtime driver/worker prototype. | Model aliases and session attribution produce expected calculated deltas. |
| 2. Build queue and processor | Bounded FIFO, coalescing, ownership, aggregate schema, atomic UPSERTs, batch checkpoint. | Single-writer, rollback, retry, and restart tests pass. |
| 3. Instrument inference | Attach one observer to each handler/shared upstream service and finalize once. | Streaming transparency, cancellation, and no raw persistence checks pass. |
| 4. Add retention and reads | Independent period expiry, whole-session idle expiry, series/session APIs, health/config. | Requested histories and model/session summaries match fixtures. |
| 5. Validate and enable locally | Runtime checks, queue/load measurements, backup notes, optional CLI/dashboard. | Useful coverage, bounded memory, and acceptable overhead. |

Suggested modules are `src/lib/tracking/{collector,normalize,queue,processor,store,migrations,calendar,queries}.ts`, with a worker entry and `src/routes/stats/route.ts`. Extend existing runtime configuration, startup/shutdown, server registration, debug diagnostics, and inference handlers/services. Keep the observer request-local and the processor global to the database; no per-provider writer pools.

Start disabled by default and opt in for a local trial. Review coverage, session attribution, queue health, row counts, and disk growth. Rollback disables tracking and restarts the proxy, leaving calculated history intact. It does not recover metrics generated while disabled or lost before commit. Keep migrations and counter versions explicit, and assign maintenance ownership before stable release.

## Remaining discussion points

1. **Session retention:** the proposed policy deletes the whole session after 365 inactive days and keeps active-session totals. Confirm a different inactivity period if needed; raw request retention is not an option in this design.
2. **Client session header:** initial support is the observed `session_id`. Additional clients need their exact stable session header mapped before their session usage can be attributed.
3. **Runtime baseline:** choose the minimum supported Node version before the SQLite driver is finalized.
4. **Presentation:** model charts and session lookup can start as JSON/CLI, with dashboard controls afterward.

## Design readiness and sources

The design stores calculated aggregates only, defines a bounded queue and sole writer, groups by resolved model, updates session totals atomically, and gives each view an explicit retention policy. It explains the limits of an in-memory queue and aggregate-only history. Implementation and benchmark validation remain planned.

- [Project context](../context.md) and [README](../README.md).
- [Responses usage handling](../src/routes/responses/handler.ts) and [session header fixtures](../tests/responses-route.test.ts).
- [Copilot chat transport](../src/services/copilot/create-chat-completions.ts).
- [Messages translation](../src/routes/messages/non-stream-translation.ts) and [stream translation](../src/routes/messages/stream-translation.ts).
- [Embeddings usage](../src/services/copilot/create-embeddings.ts) and [account quota endpoint](../src/routes/usage/route.ts).
- [Runtime configuration](../src/lib/runtime-config.ts), [package/runtime setup](../package.json), and [Docker image](../Dockerfile).
