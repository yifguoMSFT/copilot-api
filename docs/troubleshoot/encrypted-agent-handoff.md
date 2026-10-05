# Encrypted agent handoff rejected by Copilot Responses

Investigated on September 24, 2026. Opt-in proxy diagnostic logging was subsequently added at the user's request; no ADC implementation or board execution was performed.

## Symptom and scope

Parent Codex task `01a0d1be-f1d5-73a2-887e-a8bbdb62f0b1` reported that its executor failed before starting implementation:

```json
{"error":{"message":"Encrypted function output content could not be decrypted or decoded.","code":"invalid_request_body"}}
```

The executor was child `01a0d1e9-1fc9-7ca0-ba98-73cff1186db4`, named `auth_10483_executor`. The parent used `gpt-6-astra`; the child used `gpt-6-sol` with medium reasoning and `fork_turns: "none"`.

This was an HTTP 400 rejection, separate from the [previous stream idle timeout](responses-stream-idle-timeout.md). Disabling the server idle timeout cannot fix an invalid request body.

## Recorded evidence

Read-only Codex diagnostic logs in `C:\Users\yifguo\.codex\logs_2.sqlite` show this sequence. Times below are UTC on September 24; add nine hours for JST.

| Time | Event |
| --- | --- |
| 05:35:11 | Parent calls `collaborationspawn_agent`; its message is an opaque encrypted string, 9,676 characters long. |
| 05:35:11 | Child receives `InterAgentCommunication` with empty plaintext `content` and populated `encrypted_content`. The SHA-256 matches the parent's message exactly. |
| 05:35:13 | Child's first Responses request returns HTTP 400 with the error above. |
| 05:35:33 | Parent calls `collaborationfollowup_task` with another encrypted message, 4,580 characters long. |
| 05:35:33 | Child again receives empty plaintext and encrypted content matching the new message exactly. |
| 05:35:34 | Child's second Responses request returns the same HTTP 400. |
| 05:35:37 and 05:35:43 | Parent receives HTTP 200 responses. |

Both failed calls used `http://localhost:4141/v1/responses`. Responses carried Copilot service request IDs:

| Attempt | Request ID | Copilot service request ID |
| --- | --- | --- |
| Initial | `1ec83285-79aa-443a-812f-55c099a72e94` | `6bc18676-a319-4009-9cc9-d4802a67c9ba` |
| Followup | `892ab61c-8ac4-4e52-bb2e-1f546360b443` | `0be86e6f-ab57-466b-bfec-84347a915dd0` |

No raw encrypted messages or private task instructions are reproduced here.

## Does the proxy strip encrypted content for GPT models?

No. In the inspected source, `removeEncryptedContent` in `src/routes/responses/handler.ts` sanitizes **logs only**. Its callers are `sanitizeLoggedContent` and `sanitizeSseLine`; they do not produce the upstream request body. The test named `omits encrypted content from aliased input logs` also tests logging only.

The Copilot request path preserves the body except for model alias replacement. `src/services/copilot/create-responses.ts` passes that body to `fetch`. There is no GPT model allowlist or prefix check enabling request stripping. The response item-ID normalizer does not remove or decrypt encrypted content.

## Diagnosis and limits

The concrete failure is rejection of encrypted function output during the child's first model request. The encrypted inter-agent handoff is the strongest identified trigger: it is present before both failures, has no plaintext equivalent in the recorded communication, and reaches the child intact. `fork_turns: "none"` did not prevent this because the new task message itself was encrypted.

The original logs do not include a complete captured upstream request body or the upstream decryption internals. The controlled experiment below subsequently reproduced the Astra-to-Sol failure and verified Astra-to-Astra success. The exact upstream mechanism (for example, model-specific keys versus decoding support) remains unknown.

## Recovery direction

### Comparison with earlier successful handoffs

A follow-up inspection found two successful encrypted handoffs on September 17 through the same `http://localhost:4141/v1/responses` endpoint:

| Task name | Child ID | Parent → child model | First response (UTC) |
| --- | --- | --- | --- |
| `delay_hook_test` | `01a0ae31-41d7-70a3-840c-72d0d3353822` | Astra → Astra | 07:07:42, HTTP 200; subsequently ran tools and sent a result |
| `hook_retest_20260917` | `01a0ae20-b371-7ae2-a737-134182f2f2c4` | Astra → inherited Astra | 06:49:36, HTTP 200; subsequently sent a result |

Both used `fork_turns: "none"`. Their parent messages were encrypted, and the same ciphertext was found in the children's recorded communications. Therefore encryption alone, an empty-history fork, and crossing a child-session boundary do not universally fail on this proxy path.

The failing September 24 handoff changes the child model from Astra to Sol. This made cross-model encrypted-content compatibility the leading hypothesis. These historical examples alone were not a controlled A/B test because they occurred a week apart. The proxy endpoint being identical does not by itself establish that its deployment or upstream configuration was unchanged.

### Controlled experiment on September 24

At the user's request, the current Astra parent (`01a0a27a-2e58-7cb0-9cc2-e24337929bd8`) started two diagnostic children at 06:05 UTC. Both used medium reasoning, `fork_turns: "none"`, and identical plaintext instructions before automatic handoff encryption:

> This is a harmless diagnostic of agent handoff compatibility. Do not call tools, read files, or change anything. Reply with exactly: HANDOFF_PROBE_OK

The initial handoff was followed by one identical followup to each child. Neither diagnostic child ran tools or performed implementation work.

| Path | Initial result | Followup result |
| --- | --- | --- |
| Astra → Astra | HTTP 200, `HANDOFF_PROBE_OK` | HTTP 200, `HANDOFF_PROBE_OK` |
| Astra → Sol | HTTP 400, encrypted function output error | HTTP 400, same error |

Diagnostic logs confirm the parent model was Astra and both initial handoffs were encrypted (312 characters each), with empty plaintext at the receiver. Each received ciphertext exactly matched its originating tool argument. The child IDs were:

- Astra: `01a0d204-6d8e-7811-b1dd-dc7e55b3b550`
- Sol: `01a0d204-79a2-7fb0-a8b5-067afb86508e`

Request correlation IDs:

| Case | Request ID | Copilot service request ID |
| --- | --- | --- |
| Astra initial | `e350e0a0-b72f-4ac7-818c-a8a7496b07bf` | `a5a64584-2e64-4298-9c05-c41a663b9a06` |
| Astra followup | `80c19712-c1ae-4b18-80b5-ba96c21ba29c` | `7bc4fefb-f91c-479f-9cf4-13aebbae9588` |
| Sol initial | `884034f2-1006-4962-9abb-9b1c587e53c0` | `cb2e7aeb-3eac-4868-8726-294f558ead68` |
| Sol followup | `05fa9c66-bfc0-4822-b7a1-ba452aa04170` | `8a81827d-87e3-4ba5-9c66-094dcf4811f8` |
| Sol plaintext control | `e32eb239-1b7e-48c6-911d-ce52b013b034` | `caae5833-1f9a-4d75-a518-fc9cd3eaf2b6` |

The plaintext control sent a minimal direct request through the same proxy using `gpt-6-sol`, medium reasoning, streaming, and `store: false`, asking for the same reply. It returned HTTP 200, `response.completed`, and exactly `HANDOFF_PROBE_OK` in 1.573 seconds. This confirms Sol was available and could answer a plaintext request; it does not duplicate every aspect of child startup.

The supported conclusion is that Astra-origin encrypted handoffs fail when the receiving model is Sol in this setup, while Astra receivers work. Keeping the child on Astra is a tested workaround for the diagnostic task. This does not establish the encryption key design, generalize to every model pair, or prove that the original board has resumed successfully.

A fresh task supplied with explicit plaintext instructions would avoid relying on this failed encrypted handoff. Reconstruct those instructions from the original task and board; do not treat the ciphertext as readable instructions. This recovery has not been executed or validated here.

Blindly deleting `encrypted_content` is not a complete fix: for these handoffs the recorded plaintext is empty, so deletion would discard the task instructions. Any compatibility fallback must preserve a real plaintext equivalent or prevent the encrypted handoff from being generated in the first place. Repeatedly sending encrypted followups to the same child already failed twice.

Further investigation of the upstream mechanism could test Sol-origin encrypted handoffs or inspect provider-side diagnostics using the correlation IDs. At the end of these probes, no proxy implementation changes or original-board resumption had been performed.

## Follow-up: Codex logs and proxy attribution

The user challenged whether the local proxy causes the failure. A detailed review of both diagnostic children's Codex logs found:

- Both use the same recorded feature flags and Responses HTTP transport.
- Both receive intact encrypted communication with empty plaintext and no internal chat-message metadata passthrough.
- Sol's error is logged after an HTTP 400 response, not as a local Codex decryption exception.
- The available logs do not contain complete outgoing request bodies or request headers. They cannot establish whether the proxy altered a relevant value on the wire.

The inspected catalog has no differing explicit encryption flag for these models. Catalog differences include default reasoning level, minimum client version, service-tier metadata, and multi-agent reasoning effort; the probes explicitly used medium reasoning. Neither model is rewritten by the proxy's current alias map.

To reduce the request further, a synthetic function call and its output were sent through the proxy. The output contained the exact 312-character ciphertext from the successful harmless Astra diagnostic handoff, with no inherited history or Codex session headers. Only `model` differed between the two requests:

```json
{
  "model": "<gpt-6-astra or gpt-6-sol>",
  "stream": true,
  "store": false,
  "reasoning": { "effort": "medium" },
  "input": [
    {
      "type": "function_call",
      "call_id": "call_handoff_probe",
      "name": "handoff_probe",
      "arguments": "{}"
    },
    {
      "type": "function_call_output",
      "call_id": "call_handoff_probe",
      "output": [
        { "type": "encrypted_content", "encrypted_content": "<omitted>" }
      ]
    }
  ]
}
```

Astra returned HTTP 200, `response.completed`, and `HANDOFF_PROBE_OK` (request `eefb5104-b9ff-4d83-96f9-361e803dbf0b`). Sol returned HTTP 400 with the same decryption error (request `3d47a1dd-8b5b-4d65-af77-1ff96cceeace`). This excludes a requirement for Codex child startup or its session headers to reproduce the failure, but the requests still passed through the proxy.

The structured output shape is corroborated by `FunctionCallOutputContentItem::EncryptedContent` and `FunctionCallOutputBody::ContentItems` in [Codex protocol source](https://github.com/openai/codex/blob/53446f90a56692dede3c8f413e8d486a6adb77b5/codex-rs/protocol/src/models.rs#L2097). An initial synthetic request incorrectly placed `encrypted_content` directly on the output item; both models rejected that shape as an unknown parameter. Those schema errors are excluded from the decryption comparison.

A direct request to GitHub Copilot, bypassing local proxy code, remains pending. The sandbox blocked network access during token exchange, and automatic approval review rejected escalation because forwarding logged encrypted content to that external destination lacked explicit approval. No successful direct-to-Copilot comparison has been run. Do not claim that these findings alone exonerate the proxy or identify the upstream key/decoder mechanism.

## Opt-in proxy diagnostics

Use the existing `start --verbose` (or `start -v`) flag with the newly built proxy, retaining the same account/configuration arguments as usual. For example, in PowerShell from the repository:

```powershell
bun ./dist/main.js start --verbose
```

The existing process must be restarted to load the code. Do not start a second process on its occupied port. Start without `--verbose` to disable these diagnostics. No separate environment flag is needed.

Verbose Responses diagnostics are automatically appended to `logs/responses-diagnostics.jsonl` under the process's working directory. When started from this repository, the file is `E:\workshop\copilot-api\logs\responses-diagnostics.jsonl`. Startup prints the absolute path. Each file record has a UTC timestamp, and writes are serialized to keep concurrent requests on separate JSON lines. File writes do not block request forwarding; failures produce a console warning. The `logs/` directory is ignored by Git. The file contains these diagnostic records, not all verbose console output. Earlier console-only output cannot be recovered retroactively.

Each `Responses diagnostic` line contains a JSON record. Correlate its `requestId` across these stages:

- `request`: actual upstream URL; incoming and outgoing body byte counts and SHA-256 hashes; model; input item count; fingerprints of encrypted fields and stored-state fields; incoming and outgoing fingerprints of selected session/protocol headers. Missing headers are omitted. Encrypted fields are inspected under protocol `input`, `output`, and `content` containers, capped at 32 entries and 10,000 visited nodes.
- `upstream-response`: upstream status, elapsed time, upstream and Copilot service request IDs, and selected response-header fingerprints.
- `upstream-error`: flags for `invalid_request_body` and the exact encrypted-function-output rejection. Only an error-body clone is inspected, capped at 8 KiB and one second. This runs asynchronously; the client retains the original response body. `truncated` means the inspection limit was reached, not that the client's response was truncated.

Equal incoming/outgoing body hashes establish that the proxy forwarded the same body bytes. If a model alias changes the body hash, compare models and encrypted-field hashes separately. Equal session-header hashes establish preservation of those values. Compare Astra and Sol rejection records using the upstream request IDs for provider-side tracing.

These new diagnostic records contain no raw prompts, ciphertext, authorization/cookie values, or arbitrary upstream error text. Session and encrypted-content fingerprints remain correlatable diagnostic metadata. Existing alias input/output logging is a separate feature and is not changed by this switch. The diagnostic logs narrow proxy transformations but do not by themselves explain an upstream decryption implementation.

## Reproduction with live proxy logging

On September 24 at 06:52–06:53 UTC, the restarted proxy was confirmed to run with `--verbose` and the latest workspace build. Its global Bun package path resolves to `E:\workshop\copilot-api\dist\main.js`. It was started from the user's home directory, so its actual log file is **`C:\Users\yifguo\logs\responses-diagnostics.jsonl`**, rather than the workspace's `logs/` directory.

A plaintext Sol request (`diagnostic-flow-75228851-ef39-4989-829e-2b0a3994bf79`) returned HTTP 200 and produced both request and response records, confirming log capture before the handoff experiment.

Fresh children `logged_handoff_astra` and `logged_handoff_sol` then received the same harmless instructions used above, with medium reasoning and `fork_turns: "none"`:

| Case | Request time (UTC) | Body bytes | Upstream status | Request ID | Copilot service request ID |
| --- | --- | --- | --- | --- | --- |
| Astra → Astra | 06:53:32.462 | 109,509 | 200 | `346db981-72a4-4eed-8355-1f1563b93ac3` | `b5c09135-6670-4dd4-9a53-7da1c879d6fe` |
| Astra → Sol | 06:53:37.460 | 128,895 | 400 | `de0d9d47-f348-4c0f-8843-67676fe5a19b` | `64ef16e3-cec8-419d-8974-23cf77690bdb` |

The Astra child replied `HANDOFF_PROBE_OK`. The Sol child returned the exact encrypted-function-output error. Its upstream error record has `invalidRequestBody: true`, `encryptedFunctionOutputRejected: true`, and `truncated: false`.

For both requests:

- The entire incoming and outgoing body SHA-256 hashes match exactly. The model names are unchanged.
- There is one 312-byte encrypted field at `$.input[6].content[1].encrypted_content`. Its fingerprint matches the originating parent's encrypted tool message in Codex diagnostic logs.
- The recorded incoming headers are `x-codex-turn-metadata`, `x-client-request-id`, and `content-type`. Their outgoing fingerprints are unchanged. The proxy adds `x-request-id` and `copilot-integration-id` among the recorded headers, identically in policy for both requests.
- No `session_id`, `conversation_id`, or `x-codex-turn-state` was present in the recorded incoming header set; the proxy did not remove these from the failing request.
- The upstream URL is `https://api.githubcopilot.com/responses`.

This evidence rules out request-body corruption, model alias replacement, loss of the recorded supplied state headers, and the response item-ID normalizer as causes of this reproduction. The 400 is observed at the Copilot response boundary before downstream stream normalization. It does not establish Copilot's internal decryption constraint, rule out a missing required header that Codex never supplied, or prove compatibility for other model pairs. The direct-to-Copilot comparison remains unperformed.

## Luna model comparison

At the user's request, the same Astra parent spawned fresh `gpt-6-luna` and `gpt-5.6-luna` children with the identical harmless diagnostic instructions, medium reasoning, and `fork_turns: "none"`. Both failed before running tools:

| Receiving model | Encrypted handoff | Plaintext control |
| --- | --- | --- |
| `gpt-6-astra` | Succeeds (earlier controls above) | Not repeated in this comparison |
| `gpt-6-sol` | Fails with decryption HTTP 400 | Succeeds (earlier control above) |
| `gpt-6-luna` | Fails with decryption HTTP 400 | HTTP 200, completed, `HANDOFF_PROBE_OK` |
| `gpt-5.6-luna` | Fails with decryption HTTP 400 | HTTP 200, completed, `HANDOFF_PROBE_OK` |

The Luna handoffs were recorded at 06:56:02.970 and 06:56:07.053 UTC on September 24. Both complete incoming/outgoing body hashes match. Each contains one 312-byte encrypted field at `$.input[6].content[1].encrypted_content`, matching the originating parent tool message. The recorded supplied headers are preserved; only the normal request ID and Copilot integration ID are added among the inspected headers. Both error records are complete and classify the exact encrypted-function-output rejection.

| Case | Request ID | Copilot service request ID |
| --- | --- | --- |
| 6 Luna encrypted | `312f1c50-172a-46da-90a7-4d23516f1550` | `540daa67-6ebb-4987-b244-381f0a5b3992` |
| 5.6 Luna encrypted | `fa5231cd-5c17-4ae9-8f5d-139b491a4172` | `62bfdb9a-65f5-4386-9ace-4e143b2ef79c` |
| 6 Luna plaintext | `plaintext-luna-probe-b4793790-b433-43f1-ab90-31f904fd93d8` | `8f4ef889-e78f-4888-9128-e5bf05ea460d` |
| 5.6 Luna plaintext | `plaintext-luna-probe-4c447072-746c-4d05-89b6-e36b298c654c` | `896693d7-16b0-46b8-9225-a515472d2ede` |

Plaintext controls used direct local proxy requests with streaming, `store: false`, medium reasoning, and the expected reply instruction. They establish that these models are available and can answer plaintext, not that a full plaintext child startup has been tested.

These results show that the failure is not specific to Sol: Astra-origin encrypted handoffs fail for all three other receiving models tested. An identical Responses API does not by itself establish portability of encrypted artifacts between model backends. Different decryption keys, decoded formats, or routing requirements could explain this pattern, but none of those mechanisms has been observed directly. Keep Astra children for a tested handoff workaround; do not claim a proven encryption-key design or remove encrypted instructions as a fix.

## Sol → Sol handoff after switching the parent model

At the user's request, the parent task switched to `gpt-6-sol` and spawned a `gpt-6-sol` child with medium reasoning and `fork_turns: "none"`. The child was asked only to reply `SOL_TO_SOL_HANDOFF_OK`; it did so without tools or file changes.

Codex logs at 07:08:11 UTC confirm the parent and child both used Sol. The 312-character handoff message was encrypted, and the same encrypted-content fingerprint appeared at `$.input[6].content[1].encrypted_content` in the proxy request. The incoming and outgoing request-body SHA-256 hashes match. Copilot returned HTTP 200 for request `0a95715f-59bb-4332-9dad-68f584c48100` (service request `5054eb4f-b917-4fc4-8f6b-42468d231a97`).

The tested combinations now include Astra → Astra success and Sol → Sol success, while Astra → Sol, Astra → 6 Luna, and Astra → 5.6 Luna fail. This supports matching the child model to the parent's model as an operational workaround. It does not prove all same-model pairs work or disclose the upstream encryption mechanism.

## Sol → Astra handoff

The Sol parent then spawned a `gpt-6-astra` child with medium reasoning and `fork_turns: "none"`, asking only for `SOL_TO_ASTRA_HANDOFF_OK`. The child returned that exact marker without tools or file changes.

Codex logs confirm the parent used Sol, the child used Astra, and the 312-character encrypted handoff message reached the child. Its SHA-256 matches the encrypted field at `$.input[6].content[1].encrypted_content` in the proxy diagnostics. The proxy preserved the full request-body bytes and recorded supplied headers. Copilot returned HTTP 200 for the initial request `9b465d46-5be6-44b6-a334-f9d558c23c8b` (service request `fc66bf17-7eff-4b19-b247-e50371d46f0f`) and a second request carrying the same handoff `7e2044ad-d7b1-453d-aa64-412627bc9152` (service request `c84d42b9-ac21-4c6f-8cad-0733a74edce7`).

The result is asymmetric: Astra → Sol failed, but Sol → Astra succeeded. Matching models is therefore sufficient for the two same-model pairs tested, but it is not necessary for every successful handoff. The evidence does not establish which encrypted payloads or model backends are mutually compatible, nor why Copilot rejects the failing directions.

## Astra → Sol retry with full request dumping

After restarting with `--dump-requests`, a fresh Astra → Sol probe on September 24 at 07:41:39 UTC **succeeded**. The Sol child `dumped_sol_handoff_probe` used medium reasoning and `fork_turns: "none"`, and returned `DUMPED_SOL_HANDOFF_OK` without tools or file changes. This supersedes any inference that Astra → Sol always fails. The earlier failures remain valid observations, but a fixed compatibility rule based only on the model pair does not explain all results.

The new SQLite capture is `C:\Users\yifguo\logs\requests.sqlite`, trace `f6cdd9a5-9755-48cb-bdb6-896b4cabf451`. Codex log row `5389079` identifies the parent as `gpt-6-astra` and its requested child as `gpt-6-sol`. Its 332-byte encrypted tool message matches the ciphertext stored at `$.input[6].content[1].encrypted_content` in both captured request bodies. The input item is an `agent_message`. The complete incoming and upstream bodies are byte-identical (128,933 bytes), with no capture errors. Copilot returned HTTP 200; upstream request ID `a474e160-ed87-4308-afb9-2b0249a45ab1`, service request ID `79dd223c-d97c-4180-ab4d-91c4e716cc5d`.

The full header capture also exposes a limitation of the earlier allowlist: this request supplies **`session-id` and `thread-id`**, with hyphens. Those names were not included in the earlier hash-only diagnostics. Both are preserved unchanged, as are `x-codex-parent-thread-id`, `x-codex-turn-metadata`, `x-codex-window-id`, `x-openai-subagent`, `x-codex-beta-features`, and `x-openai-internal-codex-responses-lite`. Earlier statements about absent underscore-named headers must not be interpreted as proof that no session information was supplied. The prior failed requests have no complete header dump for comparison.

Success followed a proxy restart with request dumping enabled, but that chronology does not establish that logging fixed the problem. This probe also used a fresh encrypted payload and slightly different marker instructions. Request stripping was not introduced or changed. The reason for the earlier rejection remains unresolved; the new capture establishes that an encrypted Astra → Sol handoff can succeed in this setup. See [request dump queries](request-dumps.md) for inspecting the stored request pair.

## Astra → GPT-6 Luna retry with dumping disabled

The user then disabled request dumping and requested a fresh Luna probe. At 07:43:59 UTC on September 24, the Astra parent spawned `gpt-6-luna` with medium reasoning and `fork_turns: "none"`. Child `dump_disabled_luna_probe` returned `DUMP_DISABLED_LUNA_OK` without tools or file changes. Codex log row `5390554` confirms the parent model, child model, and a 332-byte encrypted handoff argument. The SQLite dump's latest record remained at 07:42:52.055 UTC, before this probe; no new dump was recorded for it.

This establishes that Astra → GPT-6 Luna can also succeed and that request dumping need not be enabled for success. It does not explain the earlier Luna rejection. GPT-5.6 Luna was not retried in this step.
