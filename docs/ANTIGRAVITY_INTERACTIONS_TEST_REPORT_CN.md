# Antigravity Responses ↔ Interactions 转换器测试报告

日期：2026-09-12。分支：`antigravity-interactions`，实施基线提交：`59319de`。

范围：仅新增独立协议转换器与离线测试。没有 provider、路由、鉴权、配置、依赖或现有文件改动。

## 交付物

| 文件 | 内容 |
|---|---|
| `src/services/interactions/convert.ts` | Responses 请求 → Interactions 请求、Interactions JSON → Responses JSON 的纯函数转换 |
| `src/services/interactions/stream.ts` | 每响应一个实例的 SSE 转换器，只处理字节与协议状态 |
| `tests/interactions-convert.test.ts` | 24 个请求与 JSON 转换用例 |
| `tests/interactions-stream.test.ts` | 15 个 SSE 用例 |
| `tests/interactions-round-trip.test.ts` | 5 个离线往返、隔离与 JSON/SSE 一致性用例 |
| `tests/fixtures/interactions/` | 官方 Simple Request 样本、自建往返 fixture 与来源说明 |

## 执行结果

| 检查 | 结果 |
|---|---|
| `bun test tests/interactions-convert.test.ts tests/interactions-stream.test.ts tests/interactions-round-trip.test.ts` | 44 pass / 0 fail |
| `bun run typecheck` | 通过 |
| 新增 5 个 TypeScript 文件的 ESLint（不带 `--fix`） | 0 error |
| `bun run build` | 通过 |
| `bun test`（全量） | 229 pass / 1 skip / 0 fail |
| `git diff 59319de --exit-code` | 无输出，已有受跟踪文件零内容变更 |

基线本身为 185 pass / 1 skip / 0 fail，因此本次只增加用例，没有修复或掩盖既有失败。

## 已由离线测试确认

请求转换：指令与历史顺序、`store` 默认值与显式 `false`、显式 `previous_response_id`、`max_output_tokens`、thinking 级别与摘要、工具声明与 `tool_choice`、非法工具参数的明确报错。转换不修改输入对象，显式 `session-id` 与 `prompt_cache_key` 只作为 metadata 返回，不写入上游 body。

工具循环：`function`、`custom` 两类工具的名称与参数可逆，工具结果按输入中的调用记录恢复名称，`result` 使用文本内容数组，call_id 与 item id 分开保持。单次请求内重复 call_id、缺少调用记录的孤立结果、重复工具名都明确报错。

响应转换：官方 Simple Request 样本的 step、终态、usage 与时间戳映射；`total_output_tokens + total_thought_tokens` 合成 Responses 的 `output_tokens`，缺失统计与已知零区分，不编造数值；未知 step 类型报错而不是静默丢弃。

thought 往返：`thought` 以 `agdata1.<base64url>` 包装为 reasoning item 的 `encrypted_content`，客户端带回后可还原同一对象；外来格式、超限和夹带字段的载荷被拒绝。

SSE：事件顺序、递增 sequence_number、文本与 thought 摘要累积、工具参数按 step 隔离并延迟到校验通过才输出、初始内容不重复、终态 snapshot 与流内容一致、单一终态、`data: [DONE]` 只转发一次、逐字节 UTF-8 分片与 CRLF、坏帧与异常 EOF 转为失败事件、缓冲上限、取消后静默释放。

离线往返：客户端保存第一轮输出并带回后，全新转换器实例能还原 thought 与两类工具调用并继续携带工具结果；交错实例互不共享缓冲或工具集合；metadata 变化不影响协议 body；JSON 与 SSE 对同一 fixture 得到相同终态。

## 尚未验证

以下内容需要真实凭据、网络或 Codex 客户端，本报告不作结论：真实 Codex 是否接受把 `interaction.id` 原样作为响应 id 并在下一轮重放；Codex 是否完整重放 `encrypted_content`，以及 Antigravity 是否接受还原后的 thought 与签名；实际 endpoint 是否与所依据的 Google AI Interactions 文档契约一致；`total_thought_tokens` 的计数口径在真实模型上是否稳定；固定长前缀的实际缓存命中与 provider 侧是否认可传入的 session/cache 标识。

转换器只保证协议映射与离线可逆性，不声称真实缓存命中，也不保存任何跨请求状态。
