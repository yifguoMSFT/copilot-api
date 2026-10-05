# Queryable request dumps

Start the proxy with the new flag after building it:

```powershell
copilot-api start --dump-requests
# Combine with existing diagnostics if desired:
copilot-api start --verbose --dump-requests
```

The flag is off by default and independent of `--verbose`. Startup prints the absolute database path. Records append to `logs/requests.sqlite` relative to the process working directory. Starting from `E:\workshop\copilot-api` uses `E:\workshop\copilot-api\logs\requests.sqlite`; starting from the user home directory uses that directory's `logs` folder. Restart the existing proxy to enable or disable capture. SQLite WAL mode allows queries while the server is running. The repository's `logs/` folder is ignored by Git.

## What is captured

Every incoming API request, including GETs, unknown routes, malformed JSON, and locally rejected requests, gets an `incoming` row. Upstream requests made for that API request get separate `upstream` rows sharing its `trace_id`. This covers Copilot Responses, chat completions (including translated Anthropic requests), embeddings, model discovery, usage, and DeepSeek Responses. Startup catalog downloads, login, and background token refresh are outside API request capture.

Each row in `requests` contains:

| Column | Meaning |
| --- | --- |
| `id`, `trace_id`, `stage` | Unique capture ID, shared correlation ID, and incoming/upstream boundary |
| `started_at`, `finished_at` | UTC timestamps; finish means response headers became available, not stream completion |
| `method`, `url`, `model` | Request method, full URL, and model extracted from JSON when present |
| `headers_json` | All application-visible request headers, with credential values redacted |
| `body` | Complete request bytes as a BLOB, including prompts and encrypted content; no truncation or stripping |
| `body_bytes`, `body_sha256` | Byte count and SHA-256 of the stored body |
| `status`, `response_headers_json` | Response status and headers at that boundary |
| `error` | Thrown request/transport error, if any; HTTP errors are represented by status |
| `capture_error` | Body-capture failure; a NULL body means capture did not complete |

`authorization`, `proxy-authorization`, `cookie`, `set-cookie`, `x-api-key`, and `api-key` header values are replaced with `[REDACTED]`. Other header values, full URLs, and body contents are stored as received. The database therefore contains private request content and encrypted artifacts. Credential redaction does not sanitize secrets embedded in bodies, URLs, or arbitrary custom headers.

These are captures at the application's Request/fetch boundaries, not packet captures. Header casing/order and transport-added headers are not preserved. Response bodies and SSE chunks are not captured or buffered, and later stream failures are not recorded here. Existing `--verbose` Responses diagnostics can additionally classify the upstream decryption error. Request dumping buffers a copy of each request body and performs synchronous SQLite writes, so it adds memory, disk, and latency overhead. There is no automatic retention limit. Capture/write failures warn without failing the API call; opening the database unsuccessfully fails startup rather than silently enabling incomplete capture.

## Queries

Open the file with any SQLite client, for example:

```powershell
sqlite3 -readonly .\logs\requests.sqlite
```

Recent requests:

```sql
SELECT started_at, trace_id, stage, method, url, model, status, body_bytes, error
FROM requests
ORDER BY started_at DESC
LIMIT 50;
```

Compare each incoming body to its upstream body (aliases, enabled compaction model routing, or provider translation can intentionally change them):

```sql
SELECT i.trace_id, i.model AS incoming_model, u.model AS upstream_model,
       i.body_sha256 = u.body_sha256 AS identical_body,
       u.status, u.error
FROM requests AS i
JOIN requests AS u ON u.trace_id = i.trace_id AND u.stage = 'upstream'
WHERE i.stage = 'incoming'
ORDER BY i.started_at DESC;
```

With compaction model routing enabled in the selected JSON configuration, a marked request can show an incoming Sol/Astra model and an upstream `gpt-6-luna` model. Different body hashes are expected: compare parsed bodies excluding only top-level `model` for a Copilot-to-Copilot override. Session/thread headers and encrypted content remain under existing provider behavior. An unmarked ordinary turn or disabled override retains its normal routing. Response status 200 confirms headers were received; it does not prove the stream completed or Codex successfully resumed after compaction.

Inspect the complete request pair and recorded response headers:

```sql
SELECT stage, headers_json, CAST(body AS TEXT) AS request_body,
       status, response_headers_json, capture_error
FROM requests
WHERE trace_id = '<trace ID>'
ORDER BY started_at;
```

Find upstream Sol rejections:

```sql
SELECT started_at, trace_id, status,
       json_extract(headers_json, '$."x-request-id"') AS request_id,
       json_extract(response_headers_json, '$."x-copilot-service-request-id"') AS copilot_id
FROM requests
WHERE stage = 'upstream' AND model = 'gpt-6-sol' AND status >= 400
ORDER BY started_at DESC;
```

Inspect a known encrypted handoff field without assuming all requests use that path:

```sql
SELECT trace_id,
       json_extract(CAST(body AS TEXT), '$.input[6].content[1].encrypted_content') AS handoff
FROM requests
WHERE stage = 'upstream'
  AND json_valid(CAST(body AS TEXT));
```

Bun uses its built-in SQLite driver. Node uses `node:sqlite` when the flag is enabled, requiring a Node release with that module (Node 22.13+). No SQLite driver is loaded with dumping disabled.
