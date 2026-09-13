---
title: Session Token Usage Experiment Report
status: active
started: 2026-09-12
client: Codex 0.153.4 (codex exec, originator: Codex Desktop)
proxy: local copilot-api on 127.0.0.1:4141
---

# Session Token Usage Experiment Report

本报告记录 [[SESSION_MODEL_TOKEN_USAGE_DESIGN.md]] 第 10 节 E1–E4 的实测结果。所有样本来自本地 `copilot-api`，token 数值为上游原始返回值，未包含 API Key、请求正文、会话内容或完整 session ID。

## 1. 方法

两类实验：

1. **客户端字段采样**：在 `127.0.0.1:4155` 起一个只记录请求头与响应体的转发探针，再让它转发到真实代理 `127.0.0.1:4141`。用 `codex exec` 与 `codex exec resume` 各发一轮 `Reply with exactly OK.`，模型 `deepseek-flash`，观察 Codex 实际发送的 header 与 body 结构。
2. **usage 取样**：直接向 `127.0.0.1:4141/v1/responses` 发送最小请求。模型为 `deepseek-flash`（DeepSeek 上游）与 `gpt-5.6-luna`（Copilot 上游），各一轮非流式与一轮流式；另加各两次相同长前缀请求和一次 Copilot 思考档位请求。

探针使用的 `CODEX_HOME` 是临时目录，未读写用户真实 Codex 状态；代理进程未重启，未改动生产配置。

## 2. E1：Codex 实际发送的 session 字段

结论：**已确认**。真实字段是 `session-id`，不是设计初稿假设的 `session_id` 或 `x-session-id`。

| 来源 | 实测形态 | 同一 session 多轮 |
| --- | --- | --- |
| header `session-id` | UUID | 不变 |
| header `thread-id` | 与 `session-id` 相同 | 不变 |
| header `x-client-request-id` | 与 `session-id` 相同 | 不变 |
| header `x-codex-window-id` | `<session-id>:0` | 不变 |
| header `x-codex-turn-metadata` | JSON 字符串 | `session_id` 不变，`turn_id` 每轮变化 |
| body `client_metadata.session_id` | UUID 字符串 | 不变 |

同一个 session 的首轮与 resume 请求中，`session-id` 与 `thread-id` 完全一致，`turn_id` 从 `01a09302-f955-…` 变为 `01a09303-6ac5-…`，说明按 session 聚合需要在多个候选字段中固定取 session 级字段，不能取 turn 级字段。

其他实测细节：

- `originator: Codex Desktop`，`user-agent: Codex Desktop/0.153.4 (Windows 10.0.26200; x86_64) dumb (codex_exec; 0.153.4)`。
- 请求体顶层字段为 `model`、`instructions`、`input`、`tools`、`tool_choice`、`parallel_tool_calls`、`reasoning`、`store`、`stream`、`include`、`prompt_cache_key`、`client_metadata`。没有顶层 `metadata`。
- 提示词与 instructions 未记录，`input` 与 `instructions` 内容未落盘。

## 3. E2：非流式 usage

请求：`POST /v1/responses`，`input: "Reply with exactly OK."`，`stream: false`，HTTP 200，响应 `status: completed`。

| 模型 | HTTP | 原始 usage |
| --- | --- | --- |
| `deepseek-flash` | 200 | `{"input_tokens":35,"input_tokens_details":{"cached_tokens":0},"output_tokens":20,"output_tokens_details":{"reasoning_tokens":18},"total_tokens":55}` |
| `gpt-5.6-luna` | 200 | `{"input_tokens":11,"input_tokens_details":{"cache_write_tokens":0,"cached_tokens":0},"output_tokens":5,"output_tokens_details":{"reasoning_tokens":0},"total_tokens":16}` |

两个 provider 的 usage 都是 OpenAI Responses 形状，路径为顶层 `usage`。DeepSeek 不返回 `cache_write_tokens`；Copilot 返回。两者都满足 `total_tokens = input_tokens + output_tokens`。

Copilot 响应顶层另有 `copilot_usage`（账单口径），其中 `token_details[].token_count` 与 `usage` 的基础字段一致，`total_nano_aiu` 与本功能的 token 统计无关。

## 4. E3：流式 usage

请求：同样的两条 prompt，`stream: true`，HTTP 200，`content-type: text/event-stream`。

| 模型 | 事件数 | usage 出现位置 | `[DONE]` |
| --- | ---: | --- | --- |
| `deepseek-flash` | 29 | 仅 `response.completed.response.usage` | 无 |
| `gpt-5.6-luna` | 9 | 仅 `response.completed.response.usage` | 无 |

DeepSeek 流的事件顺序为 `response.created` → `response.in_progress` → `output_item.added` → `content_part.added` → 15 个 `response.reasoning_text.delta` → `reasoning_text.done` → `content_part.done` → `output_item.done` → 第二组 `output_item.added` / `content_part.added` → `output_text.delta` → `output_text.done` → `content_part.done` → `output_item.done` → `response.completed`。Copilot 流省略了 reasoning 事件组。

两个流都没有更早的 usage 快照，也没有第二个完成事件。Copilot 的完成帧在顶层多一个 `copilot_usage` 兄弟字段，DeepSeek 没有。

`response.incomplete` 与 `response.failed` 未取得真实样本。

## 5. E4：cache 与 reasoning 语义

同一段 220 行长前缀各请求两次，两次都输出相同 usage 总量：

| 模型 | 第 1 次 | 第 2 次 | 输入总量 |
| --- | --- | --- | ---: |
| `deepseek-flash` | `cached_tokens: 0` | `cached_tokens: 4736` | 4877（两次相同） |
| `gpt-5.6-luna` | `cache_write_tokens: 4850, cached_tokens: 0` | `cache_write_tokens: 0, cached_tokens: 4850` | 4853（两次相同） |

Copilot 思考档位样本（`gpt-5.6-luna`，`reasoning.effort: "high"`，非流式）：`input 52 / output 49 / reasoning 42 / total 101`。

由此确认：

- `cached_tokens` 与 `cache_write_tokens` 都是 `input_tokens` 的子集，不能加到总量。
- `reasoning_tokens` 是 `output_tokens` 的子集，不能加到总量。
- `total_tokens` 始终等于 `input_tokens + output_tokens`。
- DeepSeek 在 Responses 协议下不返回 `prompt_cache_hit_tokens` / `prompt_cache_miss_tokens`；`prompt_cache_key`、`prompt_cache_retention` 只是普通顶层字段。cache miss 不能当成 cache write。

## 6. 顺带确认的范围问题

现有代码里 DeepSeek 只接在 `/v1/responses`：`handleCompletion` 直接调用 Copilot 的 `createChatCompletions`，没有 provider 路由，`/v1/messages` 也走同一条 Chat 路径。因此设计文档不再把 Chat Completions / Messages 视为 DeepSeek 入口，这两条路径的用量统计本次不做，Codex 也不使用它们。

## 7. 未覆盖项

- `response.incomplete` / `response.failed` 的 usage、截断与取消路径（E7）。
- 观察器对转发字节、首 chunk 延迟与取消传播的影响（E8），需要实现后做有/无观察器对照。
- 本地状态文件的原子替换、重启恢复与强杀窗口（E9）。
- 工具调用后的续轮 usage；本次只有单轮无工具样本。

## 8. 证据位置

- 探针脚本与原始样本（临时目录，可重跑）：`C:\Users\Jeff\AppData\Local\Temp\copilot-api-usage-probe\`
  - `capture.ts`：header/body 采样转发探针，输出到 `capture\`
  - `samples.ts`：非流式与流式取样，输出到 `samples\`
  - `cache.ts`：重复前缀取样
- 采样日期：2026-09-12。代理与 Codex 版本变化后应重新取样，尤其 usage 字段与 header 名称。
