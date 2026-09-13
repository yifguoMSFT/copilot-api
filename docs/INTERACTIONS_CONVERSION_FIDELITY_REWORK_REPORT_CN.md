# Responses ↔ Interactions 转换保真返工报告

日期：2026-09-12。看板：`interactions-conversion-fidelity-rework.kanban.json`。基线：`c22b879`。对照：[[INTERACTIONS_STATE_PRESERVATION_IMPLEMENTATION_REVIEW_CN.md]]、[[INTERACTIONS_STATE_PRESERVATION_FIX_PLAN_CN.md]]、[[INTERACTIONS_STATELESS_CONTRACT_NOTES_CN.md]]。

状态：实现、测试、联调脚本与文档改动已在工作区完成，等待本看板的最终提交任务。范围仅限独立转换器、独立联调脚本、其测试与本轮文档；业务路由、模型配置与用户并发改动未纳入。

## 1. 结论

复核提出的两处 P1 缺口已修正，第三项按结论收窄。

转换器现在把思考步骤当作需要原样交给客户端的数据，而不是可以重建的摘要：流式路径保留 summary 部件的额外字段与字段存在性，终态独有的回放字段会被采纳，已发出内容与终态真实矛盾时仍然失败。工具结果的多块文本不再被合并，缺少回放信封的 reasoning 项给出指明原因的协议错误。

联调脚本现在的记录可以还原收到的字节：入站 body 与上游 SSE 都以原始字节保存，双向 status/headers 均记录，下游 JSON（含错误答案）统一落盘。记录仍然只是观测与复现手段，不参与协议恢复。

## 2. 逐项实现

| 复核项 | 状态 | 改动与证据 |
|---|---|---|
| R1 SSE thought 回放对象被重建 | 已修 | `stream.ts` 的 `StepState.parts` 改为保存上游部件对象，新增 `summaryDeclared` |
| R1 终态独有的回放字段被丢弃 | 已修 | `verifySnapshot` 逐字段填充，`fill()` 处理 thought 的 `signature`/`summary` |
| R1 已发出内容仍须一致 | 保持 | 与流内已产生内容不一致时仍抛 `Terminal content differs from stream` |
| 工具结果文本数组被合并 | 已修 | `convert.ts` 的 `toolResult` 逐块映射，不再 `join` |
| 无签名 reasoning 报错不明确 | 已修 | 改为 “Reasoning item has no replay envelope; only a signed thought can be replayed” |
| R2 入站原始 body 未保留 | 已修 | 改读 `arrayBuffer()`，`inbound`/`invalid_json` 记录新增 `body_base64` |
| R2 上游 SSE 字节损失 | 已修 | 逐 chunk 记录 `{base64, length}`，删除非 fatal 文本解码 |
| R2 流式双向 status/headers 缺失 | 已修 | 新增 `upstream_stream_head`、`downstream_stream_head` |
| R2 下游 JSON 未记录 | 已修 | 新增 `downstream_json`，经 `recordDownstream()` 覆盖成功与错误答案 |
| R3 报告提交状态陈旧 | 已修 | [[INTERACTIONS_STATE_PRESERVATION_FIX_REPORT_CN.md]] 状态与后续段已更新 |
| R3 引用续轮契约缺测 | 已补 | `tests/interactions-continuation.test.ts` 新增 4 条，含真实格式 parent ID 与 instructions 契约 |

## 3. 状态归属没有被扩大

返工没有把会话责任搬进中转。完整历史模式由客户端持有并回传；父引用模式由上游持有历史，客户端只保存引用 ID。转换器只做两件事：把本轮入参翻译成上游形状，把上游结果翻译成客户端形状。单次响应内保留的流状态仅用于把一个响应的分段内容组装成合法终态，结束时释放。

工具身份仍来自本轮显式声明，缺声明即明确失败，不检索上一轮缓存、不建立全局注册表。`verifySnapshot` 的填充只使用同一次上游响应携带的数据，不跨请求累积。

## 4. 状态分类

已修并有测试：流式 thought 部件保真（start、delta、终态三种来源）、signature-only 不补空 summary、终态独有字段、终态冲突仍失败、JSON 与 SSE 回放等价、失败路径保留额外字段、工具结果分块、无签名 reasoning 明确失败、入站与 SSE 原始字节可逆、双向 status/headers、下游 JSON 含错误。

协议间无等价表达（维持原结论）：Responses 的 `phase` 与消息 `status`、item `id` 的上游对等字段、OpenAI 原生 `encrypted_content` 密文、`conversation`/`item_reference`/`compaction`、`prompt_cache_key` 与 `session-id` 的上游消费语义。

范围外（按用户要求不作扩展）：图片与多媒体输入输出、WebSocket 转发、Antigravity 登录链路。

限制：`headersOf` 只记录 Fetch API 暴露的 headers，不保留 HTTP 线上头的大小写、顺序与传输编码；上游省略 interaction id 时，item id 由进程内序号生成，只保证同进程内不重复；日志不参与协议恢复，删除日志不影响续轮。

未实测（不得当作已支持）：父引用续轮中上游是否继承上一轮 `tools`、上游对无签名或仅 summary 的 thought 回放的实际反应、真实网络断流与取消后的状态恢复、非零 cache 命中。本轮没有为取得非零 cache 命中做任何改动，也没有调用付费端点。

## 5. 验证

聚焦测试：`bun test tests/interactions tests/interactions-bridge.test.ts` → 141 pass / 0 fail / 467 assertions（11 files）。

全量：`bun test` → 375 pass / 1 skip / 0 fail（376 tests / 35 files，skip 为既有的凭据文件权限用例）。基线 `c22b879` 为 361 tests，本轮新增 15 条。

类型与构建：`bun run typecheck` 通过；`bun run build` 通过。

Lint：对 `scripts/interactions-codex-live.ts`、`src/services/interactions/convert.ts`、`src/services/interactions/stream.ts`、`tests/interactions-bridge.test.ts`、`tests/interactions-continuation.test.ts`、`tests/interactions-thought-replay.test.ts` 运行 `bunx eslint --no-cache`，无错误。

反例证据：修前行为由只读探针固定，输出见 [[INTERACTIONS_STATELESS_CONTRACT_NOTES_CN.md]] 第 2 节（`extra_part` 丢失、signature-only 得到 `summary: []`）与第 4 节（父引用省略 tools、未声明工具调用失败）。新增测试断言的正是与这些输出相反的期望值。

这些结论全部来自离线测试与只读本地探针。本轮没有真实 Google 调用，因此不把任何结果标注为 live 验证；上一份报告 §4 的有限实弹结论保持当时口径，不在本报告中继承为本轮证据。

## 6. 文件

新增：[[INTERACTIONS_STATELESS_CONTRACT_NOTES_CN.md]]、本报告。

修改：`src/services/interactions/stream.ts`、`src/services/interactions/convert.ts`、`scripts/interactions-codex-live.ts`、`tests/interactions-thought-replay.test.ts`、`tests/interactions-continuation.test.ts`、`tests/interactions-bridge.test.ts`、[[INTERACTIONS_STATE_PRESERVATION_IMPLEMENTATION_REVIEW_CN.md]]、[[INTERACTIONS_STATE_PRESERVATION_FIX_REPORT_CN.md]]。

未触碰：`src/routes/responses/handler.ts`、`src/lib/model-routing.ts`、`src/lib/codex-models.ts`、`codex-models.json`、`tests/codex-passthrough.test.ts`、`tests/model-routing.test.ts`（用户并发工作，`git diff --stat` 与基线一致）。
