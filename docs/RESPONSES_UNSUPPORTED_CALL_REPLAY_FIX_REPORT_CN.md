# Responses 历史回放中剔除「客户端已判定 unsupported call」的调用

## 1. 问题

Codex 会话 `01a0a04e-12db-7083-ac79-6b4bd0324af7`（fork 自
`01a09a81-e641-7030-8bfe-edf14b6c25c9`）切换到严格上游后失败：

```
Invalid 'input[189].name': string does not match pattern. Expected a string that matches the pattern '^[a-zA-Z0-9_-]+$'.
```

首个非法项来自父会话 `ordinal 4773`：

```json
{
  "type": "function_call",
  "id": "9ebb480d-06e9-457e-af25-62082aa1c8f5",
  "name": "mcp__kanban_execution::kanban_update",
  "arguments": "{\"blueprint_path\": \"…antigravity-new-api-integration.kanban.json\", \"task_id\": \"建立_new-api_范围基线\", \"action\": \"progress\", \"summary\": \"…\"}",
  "call_id": "call_00_ET_i8i9KqqHtcBMDWPFRmfm5014"
}
```

`mcp__kanban_execution::kanban_update` 里的 `::` 不满足 `^[a-zA-Z0-9_-]+$`。这一次调用从未到达
任何 MCP server：客户端直接给出了 `ordinal 4775` 的合成结果。

```json
{
  "type": "function_call_output",
  "id": "fco_01a0a033-9fb3-7f23-9756-6688f6d51cb7",
  "call_id": "call_00_ET_i8i9KqqHtcBMDWPFRmfm5014",
  "output": "unsupported call: mcp__kanban_execution::kanban_update"
}
```

模型随后改用扁平名 `kanban_update` 重试（`call_id`
`call_00_dLVHiwu6sfupENaZsDr13485`），这次拿到了真实结果。失败的调用对因此被永久留在会话历史里，
每次回放都会一起上行。

## 2. 触发条件的真实形态

扫描 `C:\Users\Jeff\.codex\sessions` 下全部 rollout，`"output":"unsupported call: …"` 只出现以下
七种取值：

```
apply_patch
exec
mcp__codex_app__open_in_codex
mcp__kanban_execution__kanban_focus
mcp__kanban_execution::kanban_update
mcp__kanban_planning__kanban_board
mcp_kanban_planning::kanban_task
```

两个结论：

- 文本恒为 `unsupported call: ` + 模型当时使用的名字，没有 `event:` 包装或其他变体。
- 它与名字是否合法无关。`mcp__codex_app__open_in_codex` 完全符合正则，只是当轮没有暴露该工具，
  同样被判定为 unsupported。所以判据必须是「客户端拒绝文本」，而不是「名字非法」。

## 3. 修复

新增 `src/routes/responses/strip-rejected-tool-calls.ts`，在
`src/routes/responses/handler.ts` 的 `resolveResponseModel` 内、provider 分流与既有
`sanitizeInputItemIds` 之前调用，作用于即将上行的请求副本。所有 provider 共用同一处清理。

删除一对调用的条件必须全部成立：

| 条件 | 说明 |
|---|---|
| `call_id` 唯一 | 调用侧与结果侧各自只出现一次；重复即视为歧义 |
| 类型配对 | `function_call` ↔ `function_call_output`，`custom_tool_call` ↔ `custom_tool_call_output` |
| 顺序合理 | 结果项必须出现在调用项之后 |
| `output` 为字符串且精确等于 | `unsupported call: ` + 该调用的 `name` |

调用项带 `namespace` 字段时，额外接受 `namespace::name` 与 `namespace__name` 两种限定写法。
只有扁平形式在 rollout 中留有实证，限定形式是为 Responses 里已存在的 `namespace` 字段预留的
精确字符串比较，不涉及任何猜测匹配。

以下情况一律保留，不做任何猜测：

- 名字非法但从未收到拒绝结果；
- `output` 只是在前后缀里包含 `unsupported call:`（例如后面还跟着堆栈，或前面有 `Error: `）；
- 拒绝文本指向的工具名与调用名不一致；
- `call_id` 缺失、为空，或调用/结果有一侧不存在；
- 同一 `call_id` 出现多次，或结果项位于调用项之前；
- 调用类型与结果类型不匹配（例如 `function_call` 配 `custom_tool_call_output`）；
- `output` 是内容数组而非字符串。

实现按索引过滤，不做结构重建：被保留项的所有字段、字段顺序、数组相对顺序都原样透传；函数不修改
传入数组及其元素，未命中时直接返回原数组引用。重复执行是幂等的。

## 4. 变更文件

| 文件 | 变更 |
|---|---|
| `src/routes/responses/strip-rejected-tool-calls.ts` | 新增，配对剔除逻辑 |
| `src/routes/responses/handler.ts` | 在 `resolveResponseModel` 中调用，并记录被丢弃的调用名 |
| `tests/strip-rejected-tool-calls.test.ts` | 新增 11 个边界单测 |
| `tests/responses-unsupported-call-history-reproduce.test.ts` | 新增，用真实会话历史复现 |
| `tests/responses-route.test.ts` | 新增 DeepSeek 与 Antigravity 两条路由用例 |

`output` 为字符串这一事实来自真实会话；`function_call_output.output` 也可能是内容数组，此时本
过滤器不介入，保持原样转发。

## 5. 验证

- `bun test tests/strip-rejected-tool-calls.test.ts` → 11 pass / 0 fail。
- `bun test tests/responses-route.test.ts` → 27 pass / 0 fail。
- 复现用例在修复前失败（`Expected to not contain:
  call_00_ET_i8i9KqqHtcBMDWPFRmfm5014`），修复后通过。
- 三条路由用例在把 `handler.ts` 中的调用临时改为 `if (false && …)` 后全部失败，证明它们不是
  空测试；临时改动已还原。
- 覆盖 `tests/*.test.ts` 的仓库内全量运行 → 528 pass / 1 skip / 1 fail。
- `bun run build` 干净；`bunx eslint` 对新增/改动文件无告警。
- `bunx tsc --noEmit` 仍报仓库既有告警（`scripts/`、`reference/`、旧测试），其中没有一条指向本次
  改动。

唯一的失败用例是既有的 `tests/responses-route-sanitize-e2e.test.ts`：它要求 DeepSeek 路径改写
无前缀的 Responses item ID，而当前 handler 有意对 `deepseek` 跳过 ID 清洗。该失败在本次改动前后
完全一致，与本看板无关。

`bun test tests` 还会顺着 `reference\` junction 走到
`..\home-server\llm-gateway\new-api-upstream-main-readonly-no-change-allowed`，额外产生 12 个模块
解析错误；这些不属于本仓库。需要仓库内全量结果时应显式列出 `tests/*.test.ts`。

## 6. 证据局限

- 没有对真实上游发起调用。验证基于真实会话 fixture 加本地 mock 上游，因此「清理后的历史能被
  Codex/Copilot 接受」这一点尚未在真实服务上确认。
- 只处理被客户端明确拒绝的调用对。名字非法但没有拒绝结果的项仍然会照原样上行，仍可能触发
  上游的名称正则校验；这是刻意保留的保守边界，未做名称归一化。
- 未清理被污染会话文件本身。修复只影响上行副本，本地 rollout 保持原样。
