# Responses ↔ Interactions 状态保留修正报告

日期：2026-09-12。对应计划：[[INTERACTIONS_STATE_PRESERVATION_FIX_PLAN_CN.md]]。

状态：本文所述改动已在 `49ea45d fix(interactions): preserve state across Responses and Interactions conversion` 提交，随后经复核发现 SSE thought 保真与联调日志两处缺口，已由 `interactions-conversion-fidelity-rework` 看板修正，逐项证据见 [[INTERACTIONS_CONVERSION_FIDELITY_REWORK_REPORT_CN.md]]。本文其余结论保持当时口径不变。实弹验证为有限合成用例（见 §4）。范围仅限独立转换器 `src/services/interactions`、`tests/interactions*`、`tests/support/interactions-stream.ts`、`scripts/interactions-codex-live.ts` 与相关文档；现有业务接线（`src/routes/responses/handler.ts`、`src/lib/model-routing.ts`、`src/lib/codex-models.ts`、`codex-models.json`、`tests/codex-passthrough.test.ts`、`tests/model-routing.test.ts`）未纳入本次改动，工作区里它们的改动属于用户并发工作。

## 1. 结论

现在可以说明的：

- 完整历史、工具调用与工具结果、真实 `store=true` 父引用续轮、thought 回放信封，都在离线用例和有限实弹中逐项对应，而不只是 HTTP 200 或最终一句话相同。
- 工具身份（namespace、custom、普通函数名）现在是显式可逆映射，不再靠解析名称猜类型；父引用缺工具声明时明确报错而不是静默降级。
- 消息文本分块、item ID、`call_id`、thought 对象、usage 计数都有可指认的保留位置；`phase`、`status`、Conversations 等无等价字段显式列为无等价，不塞提示词、不伪造上游字段。
- 调用方 session 上下文（`session-id`、`prompt_cache_key`、`client_metadata`）在完整本地记录里按原值可见，且不进入上游 body。

仍然不能宣称的：Responses/Conversations 完整兼容、`item_reference` 与 `compaction` 恢复、HTTP 流 `last_event_id` 断线续传、多模态与 WebSocket 转发、非零 cache 命中、真实网络断流下的状态恢复。逐项见 §5。

## 2. 逐项状态

| 计划项 | 状态 | 主要证据 |
|---|---|---|
| P1 服务端引用模式（`previous_response_id`/`store`，`conversation`/`item_reference`/`compaction`） | 已保留 + 明确拒绝无等价项 | `tests/interactions-convert.test.ts`、`tests/interactions-continuation.test.ts`；实弹父引用续轮 §4 |
| P1 失败流回放状态（签名、usage、终态补全） | 已保留 | `tests/interactions-stream.test.ts`「failed replay state」6 项（离线替身） |
| P1 消息与 item 身份 | 已保留（分块/item ID/`call_id`）；`phase`/`status` 无等价 | `tests/interactions-identity.test.ts`、`tests/interactions-stream.test.ts`「item identity」 |
| P2 工具名称编码与恢复上下文 | 已实现（长度前缀编码 + 显式身份表） | `tests/interactions-tool-identity.test.ts`、`tests/interactions-cli-request.test.ts`、`tests/interactions-stream-tools.test.ts` |
| P2 thought 排序与回放边界 | 已实现（最小重排 + 完整对象回放） | `tests/interactions-thought-replay.test.ts`、`tests/interactions-convert.test.ts` |
| P2 session 元数据记录 | 已保留为调用方上下文 | `tests/interactions-session-metadata.test.ts`、`tests/interactions-bridge.test.ts`「records」 |
| §3 完整本地记录（删除脱敏与截断） | 已完成 | `tests/interactions-bridge.test.ts`「Interactions bridge records」 |

## 3. 逐项细节

### 3.1 服务端引用模式

保留：`previous_response_id` 映射为 `previous_interaction_id`，`store` 独立透传；引用续轮只带本轮 `instructions`（与 OpenAI 不继承上一轮 instructions 的行为一致）；父引用下的工具结果允许省略 optional 的 `name`。

明确拒绝（不是静默丢弃）：非 null 的 `conversation`、`item_reference`、`compaction`，以及空白 `previous_response_id`。这些都需要 OpenAI 服务端条目存储或 compact 密文，Google 没有等价解析，成功返回一个丢掉上下文的请求会造成更坏的结果。

仍无等价：OpenAI 原生 `encrypted_content`（如 `gAAAAA…`）不是 Gemini signature，仍按不支持拒绝，不做解密、不直接改名。

### 3.2 失败流回放状态

保留：已收到的完整签名随 `agdata1.` 信封进入最终 `thinking`/reasoning 项；失败前收到的 usage 经 `responsesUsage()` 映射进 `response.failed.usage`；终态 snapshot 可以省略可选字段，或补上流内未出现的签名，只有与已发出内容真实矛盾才报错。

不保留：只有 summary 没有签名的残片不封装成可回放状态（避免伪造）。该路径由离线替身验证，未做真实断流。

### 3.3 消息与 item 身份

保留：每个 Responses 文本块映射为一个 Interactions `text` 块（不再合并）；同一响应内 `output_item.added`/文本与工具事件/`output_item.done`/终态 `output[].id` 使用同一 scope，scope 优先取上游 interaction id，缺 id 时用进程内序号；`call_id` 始终取上游 `step.id`。

无等价：Responses 的 `phase`（commentary/final_answer）、消息 `status`、item `id`。Google v1 全文没有对应字段，因此只保留文本内容，不写入提示词、不虚构字段，并作为兼容限制记录。

### 3.4 工具名称编码与恢复上下文

编码：namespace 工具组展开为 `_<namespace 长度>_<namespace><name>`（例如 `mcp__demo` + `lookup` → `_9_mcp__demolookup`）。长度前缀保证 `namespace=a__b/name=c` 与 `namespace=a/name=b__c` 不碰撞，首字符用下划线以符合上游函数名“首字符为字母或下划线”的规则；Interactions API 文档本身未写名称字符/长度限制，此处对齐 OpenAI Responses `function.name` 与 Gemini `FunctionDeclaration.name` 的公开约束。

恢复：`ConversionOptions.tools` 是 `Map<上游函数名, {name, namespace?, custom}>`，由当前请求的转换结果提供；查不到就报 `Tool call … is not in the declared tools`，不按名称猜 namespace、不用“不在 custom 集合即 function”的默认。重复名（含编码名撞普通名）报 `Duplicate tool name`。没有全局注册表，也不在服务端保存映射。

### 3.5 thought 排序与回放边界

轮边界：模型轮以客户端显式发出的用户输入/工具结果为界（转换器只会产出这两类非模型步骤，因此“相邻模型步骤成段”与“按显式边界分段”等价）。段内唯一调整是把 thought 提到最前，满足 Google “Model turns with thought summaries must start with a thought block”；thought 之间、其余步骤之间的相对顺序不变，已在用例中单独断言。

回放：`thoughtSchema` 与 thought 内 summary 部件改为 `z.looseObject`，保留完整可回放 thought 对象（含额外上游字段），只校验 `type`、`signature` 字符串、summary 部件 `type`/`text` 类型。`agdata1` 是本地 base64url 封装，不是 OpenAI 加密内容，也不是摘要；额外字段随信封一起回放。

### 3.6 session 元数据

`convertResponsesRequestToInteractions()` 返回的 `metadata` 汇总调用方上下文：桥接传入的 `session-id`、请求里的 `prompt_cache_key`、以及请求里的 `client_metadata`（`structuredClone` 复制，不与入站 payload 共享引用）。这些字段只进入本地记录，`body` 中不出现任何一项，脚本主体也因此无需改动。

不宣称：Google 不认识 `session-id` 或 OpenAI 的 cache key；它们只是调用方上下文与观测字段，未被上游消费。

### 3.7 完整本地记录

已完成（由前一段修正任务实施）：联调脚本删除 `SECRET_KEY`/`DIGESTED_KEY`/`digest`/`redact`/`isContainer` 与 `node:crypto` 依赖；入站与出站 HTTP 头、入站 body、转换结果（含 metadata）、上游 JSON/SSE、下游 SSE、坏 JSON 与长错误文本全部按原值记录，无截断；每条记录带 `req_N` 关联 id；写入队列在应答前与停机前 drain。既有日志中被替换成摘要或占位符的内容无法逆向恢复，报告与测试都不把合成 fixture 冒充原始记录。

## 4. 验证与证据

离线：

- `bun test tests/interactions`：126 pass / 0 fail（11 个文件）。
- `bun test tests/interactions-bridge.test.ts`：25 pass / 0 fail。
- `bun test`：361 tests / 360 pass / 1 skip / 0 fail（35 个文件，skip 为既有的凭据文件权限用例）。
- `bun run typecheck`、`bun run build` 通过；convert.ts、stream.ts、联调脚本与 12 个测试/支持文件定向 `bunx eslint --no-cache` 通过。

实弹（已授权的本地 key 文件 `scripts/interactions-codex-live.local`，固定 `https://generativelanguage.googleapis.com/v1/interactions`，模型 `gemini-3.8-flash`，临时脚本位于 `%TEMP%`，不经桥接、不写记录文件）：

1. 完整历史 + 工具声明：HTTP 200，`steps = [thought, function_call]`，模型真的调用了普通函数名 `get_weather`；原始 usage `73/16/0/0` 映射为 `input_tokens=73`、`output_tokens=16`、`reasoning_tokens=0`、`cached_tokens=0`、`total_tokens=89`；`converted.metadata` 含 `session-id`/`prompt_cache_key` 而 body 中都不出现。
2. 工具结果回放：把上一轮真实 `function_call` 连同 `function_call_output` 回传，HTTP 200，`call_id=call_1210449` 原样保留，模型据结果回答 “The weather in Tokyo is sunny and 21°C.”。
3. `store=true` 真实父引用：第一轮返回 70 字符 interaction id，第二轮 `previous_interaction_id` 与该 id 完全相等，HTTP 200，模型答出 “The codeword is PINEAPPLE42.”。
4. thought 回放：真实 signature（`EmcKZQ…`）经 `agdata1.` 信封回传，HTTP 200，上游收到的 step 恢复为 `{type:"thought", signature:"EmcKZQ…"}`。

限制：失败/中断流只用离线替身验证；本轮 `total_cached_tokens` 全为 0，未取得非零命中，非零 `cached_tokens` 映射仅由离线用例断言；本轮 thought 只有 signature 没有 summary 文本，summary 文本回放由离线用例覆盖。

## 5. 状态分类

已保留：完整历史逐项映射、真实父 ID 引用与 `store`、工具调用/结果与 `call_id`、消息文本分块、响应内 item ID 稳定性、thought 对象与 signature、usage 计数映射、失败前 usage、调用方 session 上下文（仅在记录中）。

协议间无等价表达：Responses `phase` 与消息 `status`、item `id` 的上游对等字段、OpenAI 原生 `encrypted_content`、`prompt_cache_key`/`session-id` 的上游消费语义。

未实现（显式拒绝或明确不支持）：`conversation`、`item_reference`、`compaction`、`parallel_tool_calls=false`、图片与多媒体输入输出、WebSocket 转发、上游 `last_event_id` 断点续传。

尚未实测：真实网络断流/取消后的状态恢复、非零 cache 命中、Antigravity 登录链路（本报告只覆盖 Google 模型 endpoint）。

## 6. 清理与环境

- 实弹临时脚本目录 `%TEMP%\interactions-live-check` 已删除（删除后校验不存在）。
- 未启动独立桥接进程；验证前后 4830/4831 均无监听。
- `~/.codex/config.toml` 无 `gemini_interactions_test` 残留 provider 表；本轮未新增或修改任何临时 provider 配置（目录中其余 `.bak` 为早先会话留下的备份，未改动）。
- 本地 key 文件 `scripts/interactions-codex-live.local` 由 `.gitignore` 的 `*.local` 覆盖，未进入版本控制；本轮未产生新的记录文件，也未把 key 写入 Markdown、命令行或仓库文件。

## 7. 文件清单与后续

新增：`tests/interactions-continuation.test.ts`、`tests/interactions-identity.test.ts`、`tests/interactions-tool-identity.test.ts`、`tests/interactions-thought-replay.test.ts`、`tests/interactions-session-metadata.test.ts`、`tests/interactions-stream-tools.test.ts`、`tests/support/interactions-stream.ts`、本报告。

修改：`src/services/interactions/convert.ts`、`src/services/interactions/stream.ts`、`scripts/interactions-codex-live.ts`、`tests/interactions-convert.test.ts`、`tests/interactions-stream.test.ts`、`tests/interactions-round-trip.test.ts`、`tests/interactions-cli-request.test.ts`、`tests/interactions-bridge.test.ts`、`GEMINI_INTERACTIONS_V1_CODEX_CLI_TEST_PLAN_CN.md`、`GEMINI_INTERACTIONS_V1_CODEX_CLI_TEST_REPORT_CN.md`、`INTERACTIONS_STATE_PRESERVATION_FIX_PLAN_CN.md`。

后续：上述文件已由 `commit_state_preservation_fixes` 任务提交为 `49ea45d`，未带入工作区里用户并发修改的 6 个文件。其后的保真返工见 [[INTERACTIONS_CONVERSION_FIDELITY_REWORK_REPORT_CN.md]]。
