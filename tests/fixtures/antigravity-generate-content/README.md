# Antigravity GenerateContent fixtures

Provenance: live captures from `scripts/antigravity-proxy-live-test.ts` against the confirmed
Antigravity backend, run directory `%TEMP%\antigravity-proxy-live\2026-09-13T00-55-55-926Z`.
Upstream origin `https://daily-cloudcode-pa.googleapis.com`, path
`/v1internal:streamGenerateContent?alt=sse` and `/v1internal:generateContent`, model
`gemini-3.8-flash-medium`, project `aicode-consumers`. The bearer came from the Antigravity login
credential through the local authentication proxy.

Files, copied byte-for-byte from the capture directory without redaction:

| File | Content |
| --- | --- |
| `stream-text.request.json` | Captured request envelope for the streaming turn, including path and body. |
| `stream-text.sse` | Raw response bytes for that turn: two `data:` frames, CRLF separators, no `[DONE]` sentinel. |
| `generate-content.request.json` | Captured request envelope for the non-streaming turn. |
| `generate-content.response.json` | Raw non-streaming response bytes, i.e. the unwrapped Cloud Code envelope. |
| `continuation.request.json` | Next-turn request that replays the model turn, including its `thoughtSignature`, as client-held history. |

Line endings stay CRLF exactly as received; the decoders under test must not assume LF.

The captures cover text output, a trailing `thoughtSignature` part, `finishReason`, usage counters
and the client-held continuation shape. They do not contain a tool call, a tool result, multi-chunk
text streaming or an upstream error frame, because no live capture of those exists locally yet.
Those cases need synthesised frames until a real capture exists, and any test built on them must say
so. See [[docs/ANTIGRAVITY_GENERATE_CONTENT_PROTOCOL_SAMPLES_CN.md]].
