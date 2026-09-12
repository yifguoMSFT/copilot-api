# Responses ↔ Interactions 双向转换器修正报告

日期：2026-09-12。执行目录：`I:/Cache/workshop/copilot-api`，分支 `main`。
依据：[[ANTIGRAVITY_INTERACTIONS_REVIEW_CN.md]]、[[ANTIGRAVITY_RESPONSES_INTERACTIONS_IMPLEMENTATION_TEST_DESIGN_CN.md]]，以及 `/simplicity-first`。

## 结论

本任务只包含两个方向的协议转换及离线测试，均已实现并通过离线验收。转换模块保持纯函数或每请求一个实例，不含网络、凭据、配置、数据库和跨请求状态。桥接脚本等越界产物已移除。真实 Codex、真实 Google/Antigravity endpoint 与缓存命中不属于本次验收，未做验证，报告不将其列为通过。

## 对照修正要求

### 累计 usage

`src/services/interactions/stream.ts` 新增每实例一个 `retainedUsage`，在 `step.delta` 读取 `event.metadata.total_usage`，在 `step.stop` 读取 `event.usage`，两者都只保留最近一次快照，不做加法。终态 interaction 自带 `usage` 时以终态为准；缺省时回填保留值。单步 `step_usage` 被有意忽略。

覆盖：delta-only、stop-only、终态覆盖不叠加、已知零值保留、缺失统计返回 `null`、缺 `total_thought_tokens` 时不臆造 `output_tokens`。

### 错误诊断

`src/services/interactions/convert.ts` 新增 `failureError()`：JSON 资源按 v1 的复数 `errors[]` 取首个有效对象诊断，缺失时回退旧单数 `error`，再缺失则用 `upstream_error` / `Interaction failed`。SSE 侧仍独立读取 `event.error`，两种结构不混用。

覆盖：v1 数组形状、空数组、不可用诊断、SSE error 独立路径。

### 父引用工具结果

工具结果转换抽为 `toolResult()`，`previous_interaction_id` 续接模式下允许省略可选 `name`（此时 call history 由上游保存），本轮有历史时仍核对名称，冲突继续报错。未引入任何跨请求映射或存储。

覆盖：父引用孤立结果（带/不带 `name`）、完整历史关联、名称冲突失败、`call_id` 与 `output` 文本原样保留。

### 终态一致性

`incomplete_details` 由固定伪造的 `{reason:"cancelled"}` / `{reason:"unknown"}` 改为 `null`。Responses 的 `incomplete_details.reason` 只接受 `max_output_tokens`、`max_messages`、`content_filter`、`steered`，Interactions 没有可映射的字段，因此只用 `status: "incomplete"` 表达未完成，不伪造诊断。

覆盖：completed / failed / incomplete / cancelled 四组 JSON 与 SSE 对照，断言 SSE 终态事件分别为 `response.completed` / `response.failed` / `response.incomplete`，且 SSE 终态 `response` 与同一 interaction 的 JSON 转换结果完全相等；资源状态与已 `step.stop` 的 item 状态分开处理，部分输出保留。

### 离线往返

覆盖文本与指令映射、function 与 custom 文本工具双向包装、客户端携带的 thought/signature 由全新实例重放、interaction ID 原样使用、session/cache metadata 不进入协议 body、调用方输入对象不被修改、交错实例缓冲互不串入。

## 验收证据

| 检查 | 命令 | 结果 |
|---|---|---|
| 离线测试 | `bun test tests/interactions-convert.test.ts tests/interactions-stream.test.ts tests/interactions-round-trip.test.ts` | 56 pass / 0 fail / 154 expect() |
| 类型检查 | `bun run typecheck` | `tsc` 无输出，通过 |
| 定向 lint | `bunx eslint --no-cache`（两个转换模块 + 三个测试） | 无错误 |

未执行：构建、全量测试、真实 CLI 调用、真实 endpoint 请求、缓存命中观察。

## 范围核查

- `src/services/interactions/` 只含 `convert.ts` 与 `stream.ts`。
- 模块 import 仅 `zod`、`node:util` 和本地 `./convert`；无 `fetch`、`node:http`、`Bun.serve`、`process.env`、文件读写、SQLite、WebSocket。
- 关键字检索中唯一的凭据相关命中是 `tests/interactions-convert.test.ts` 里断言带 `apiKey` 的伪造 thought 载荷被拒绝，属于防越权注入校验。
- 已删除本轮新增的越界产物 `scripts/interactions-codex-live.ts` 与 `scripts/interactions-codex-live.example.json`；删除前备份到 `%TEMP%\copilot-api-interactions-bridge-backup-20260912`。
- 未改动现有路由、provider、登录、启动逻辑、模型目录或依赖。

## 已知限制与未覆盖

- 真实 Codex 客户端是否接受输出的 response envelope、response.id 与 thought 重放字段，未验证。
- 同一流内 item ID 稳定，但不同响应之间仍是 `step_${index}`。多轮 item 合并或历史索引是否碰撞，缺少真实样本证据，本次不引入 ID 映射。
- `verifySnapshot()` 使用整对象深比较；上游若在终态补可选字段可能被判为内容不一致。未观察到实际问题前不做限定字段比较。
- usage 缺省策略为省略而非补零，目标客户端对不完整 usage 的接受度未验证。
- 缓存命中由上游决定，本任务只映射计数，不声称实际命中。
