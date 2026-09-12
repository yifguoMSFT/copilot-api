# Offline converter contract

Sources (read-only snapshots, captured 2026-09-12):
- ../../../antigravity-interactions-api-docs/google-ai-interactions-api.md: Simple Request (lines 1237–1270), FunctionCallStep (15066), FunctionResultStep (15091), ThoughtStep (15317), Step Start/Delta/Stop (11720–11775), ThoughtSummaryDelta.content (9397), ThoughtSignatureDelta.signature (9355), AllowedTools (16002).
- ../../../antigravity-interactions-api-docs/openai-responses-api.md: Responses message, function_call, custom_tool_call, reasoning and SSE event schemas.
- ../../../antigravity-interactions-api-docs/openai-migrate-to-responses.md: text.format and tool call IDs.

simple-response.json is copied verbatim as parsed JSON from Google's Simple Request example. Other fixtures/tests are synthetic schema examples, NOT live captures. No credentials or personal data.

Contract decisions:
- Use steps, NOT outputs. Function call id maps to call_id. Function results use result:[{type:text,text:...}], with name recovered from calls in the current input, or an explicit result name. No retained call map between requests.
- Thought summary is Content[], signature is string. thought_summary delta carries content, NOT text/summary; thought_signature carries signature.
- Google's simple example has input=7, output=20, thought=22, total=49. Responses output_tokens=42 includes reasoning. Preserve total_tokens, do not add tool-use counters. Missing counters remain missing/null, never fabricate zero.
- store defaults true per design; false and explicit previous_response_id are preserved independently; no history inference. Input is not echoed into final output; unknown response steps fail instead of silently disappearing.
- Supported: text history, initial instructions, function/custom text tools, tool choice, max_output_tokens, effort minimal/low/medium/high, summary auto, text.format.type=text; optional session-id and prompt_cache_key round-trip outside Google body as metadata.
- Reject unsupported semantic fields (including sampling settings without this fixture contract, structured output, parallel_tool_calls, agent, multimedia, strict:true, custom grammars, unknown reasoning effort). strict:false/null or absent has no extra schema enforcement claim.
- Reasoning uses the design's agdata1 base64url JSON envelope. Only validated thought fields survive decoding; foreign encrypted_content fails explicitly. This is NOT OpenAI encryption; real Codex replay is unverified.
- ID acceptance, actual Antigravity endpoint, Google acceptance of replayed signatures, and real cache hits are unverified. Offline tests cannot establish these facts.
