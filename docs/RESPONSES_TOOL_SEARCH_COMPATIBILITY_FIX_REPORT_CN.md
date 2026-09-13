# Responses tool_search 兼容修复报告

## 结果

已修复 `tool_search_call` / `tool_search_output` 历史导致两个 Responses 转换器报 `Unsupported input` 的问题。修复范围只涉及协议转换和测试，没有增加会话数据库、应用层白名单、搜索执行器或跨请求状态。

## 改动

- GenerateContent 转换器把搜索调用作为模型文本、搜索结果作为用户文本，使用完整 `JSON.stringify` 保留原始字段和顺序。
- Interactions 转换器采用相同方向映射，保持两个转换器的语义一致。
- `tool_search_output.tools` 与既有 `additional_tools.tools` 一起参与工具声明合并；顶层声明优先，namespace 子工具按现有 qualified name 规则去重。
- Interactions 在工具仅来自历史发现结果时也生成 `body.tools`。
- 当前原生 `tool_search` / `web_search` 声明不会被伪造成普通函数声明；已发现的普通工具仍可执行。
- 搜索项不进入真实 `function_call`、`function_result`、pending call 或调用名称映射，因此不会制造悬空调用或修改真实 `call_id`。

## 状态与边界

客户端仍是 Responses 历史和会话状态的持有者。转换器只处理当前请求，不保存跨请求对象。搜索 JSON 被作为上游可读上下文保留；上游协议没有对应的原生搜索历史项，因此不能声称恢复了供应商私有的搜索执行状态。

本次支持历史中已经存在的搜索调用、结果和已发现工具。没有实现让 Gemini/Interactions 新发起 Codex 客户端工具搜索，也没有把 `tool_choice` 强制搜索静默改成普通函数或 AUTO。未知的其他 item 仍然保持明确错误。

## 验证

- 新增两个最小历史复现/保留测试和两个工具声明合并测试。
- 请求转换、Interactions 请求转换、Interactions identity、Interactions 流式工具和流式协议测试：115 pass，0 fail。
- `bun run build`：成功，tsdown 产出 `dist/main.js`。
- 未执行真实 Antigravity/Interactions 上游请求；因此本报告只证明本地协议转换和回归，不把本地测试写成上游成功。

## 提交范围

基线提交 `438e00f` 只包含计划文档。当前实现、测试和本报告应由最终任务按范围提交；现有无关修改、缓存、凭据和看板执行文件不应被带入提交。
