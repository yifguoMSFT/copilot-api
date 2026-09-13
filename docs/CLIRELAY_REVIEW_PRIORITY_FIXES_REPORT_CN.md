# CliRelay 对照审查修复报告

日期：2026-09-13。

本报告记录 [[CLIRELAY_VS_COPILOT_API_REVIEW_CN.md]] 中“当前实现应优先修正的问题”的执行结果。范围限定为当前 copilot-api 的流式转换、Antigravity Responses 接入、会话字段映射和直接测试；没有迁移 CliRelay，没有增加数据库、跨请求状态或应用层路由。

## 已完成

1. **流式 item 索引一致性**

   `src/services/generate-content/stream.ts` 不再在已发出 reasoning `output_index` 后使用 `unshift` 重排最终数组，改为追加。最终 `response.output` 的顺序与事件索引一致。相关 fixture 断言已更新。

2. **调试写入副作用**

   移除了 Antigravity 请求路径中的固定 `turn2-req.json` 同步写入。转换器不再因调试文件写入失败而返回 `conversion_error`，并发请求也不会覆盖该固定文件。完整请求保留需求仍由显式诊断方案单独处理。

3. **会话标识映射**

   本地 Codex 证据确认 `session-id` 是会话级字段，`client_metadata.session_id` 可作为请求体字段；`prompt_cache_key` 是缓存键，不能冒充会话身份。当前顺序为 `session-id`、兼容的 `x-session-id`、`client_metadata.session_id`，缺失时仍使用已有时间戳回退，并不宣称跨轮连续或 cache hit。

4. **取消和流错误生命周期**

   AbortError 现在关闭下游流；所有读取路径在 `finally` 中取消上游 reader。下游 cancel 仍会主动取消上游，避免 reader 泄漏或客户端悬挂。

5. **代理容错范围**

   没有发现当前项目已复现的容量错误、Retry-After 或输出前可安全重试证据，因此没有增加重试、endpoint 回退或调度逻辑。后续出现具体故障时，应先添加受控测试，再实现有界重试。

## 验证

- 聚焦 Antigravity、GenerateContent、Interactions、工具和流式回归：**135 pass，0 fail**。
- `bun run build`：成功。
- 测试覆盖 tool call、custom tool、签名 carrier、文本流、上游错误、异常 EOF、客户端取消、session-id 优先级和非 200 转发。
- 未执行真实上游调用，因此不把本报告当作真实 Antigravity cache 命中或容量恢复证明。

## 工作区与提交

基线提交为 `9a73277`（`chore: baseline CliRelay review fixes`）。执行期间的修复和本报告将在后续最终提交任务中单独核验；工作区原有的模型配置、ID 清洗、凭据、缓存、临时文件和无关文档保持原状。

## 剩余限制

缺失 session 标识时的时间戳回退无法保证跨请求连续；这属于客户端字段缺失时的既有行为，不通过代理内存状态补齐。carrier 的跨 provider 可回放仍需真实 Codex 往返验证，当前受控测试只证明转换器内部一致性。
