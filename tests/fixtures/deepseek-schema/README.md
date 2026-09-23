# DeepSeek schema fixtures

## `automation-update.tools.json`

Verbatim `codex_app` namespace tool entry, extracted from a client `tool_search_output` item.

- Source session: `C:/Users/Jeff/.codex/sessions/2026/09/22/rollout-2026-09-22T19-57-45-01a0c8c3-b988-7f71-94c7-67d1ba01e8bf.jsonl`
- Source record timestamp: `2026-09-22T15:36:28.891Z`
- Source record type: `tool_search_output`, `execution: client`, `call_id: call_00_mKPBgtysvRMbptkPtVev7739`
- Extraction: the namespace entry was copied unchanged; no field was renamed, reordered, or dropped.

Properties that matter for the regression:

- `parameters` root declares only `oneOf` and `$defs`; it has no `type`.
- `oneOf` holds 4 `$ref` branches (`__schema0`, `__schema3`, `__schema21`, `__schema24`) for view/create/update/delete, and `$defs` holds 25 definitions.
- All branches resolve to `type: "object"`, so the root object constraint is implied but not declared.
- `$defs` contains legitimate `{"type": "null"}` members for nullable fields; those are not the error source and must survive normalization.
- `strict: false`, `defer_loading: true`.

Reproduction value: the upstream accepts the implied object root only after the root `type: "object"` is declared. See [[docs/DEEPSEEK_TOOL_SCHEMA_ROOT_TYPE_FIX_PLAN_CN.md]].
