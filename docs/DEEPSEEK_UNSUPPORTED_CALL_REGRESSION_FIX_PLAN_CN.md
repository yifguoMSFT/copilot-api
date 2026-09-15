# DeepSeek 工具调用回归：诊断与修正计划

## 结论

本次回归包含两个问题：全局删除 `unsupported call` 配对抹掉了模型纠错反馈；DeepSeek 返回的 `exec` 调用类型与之前客户端正常使用的 custom tool 类型不同。仅停止删除不能证明工具已经恢复，仅适配工具类型也不能保留当前过宽的删除规则。

本文件记录诊断与实施方案，尚未修改运行代码，尚未完成真实 DeepSeek 修复验收。

## 已验证证据

- 会话：`C:\Users\Jeff\.codex\sessions\2026\09\15\rollout-2026-09-15T22-27-00-01a0a53f-dba9-74a2-a4f9-321249bb3301.jsonl`。
- 22:34:14（本机 UTC+9）切换到 `deepseek-v4.1-flash`。此前有 10 个名为 `exec` 的 `custom_tool_call`，代码在 `input` 中。
- 22:34:23 起出现 `function_call`、`name: exec`、`arguments: {"input":"代码"}`；后续共 106 个此类调用，客户端分别返回 `unsupported call: exec`。
- 22:43:03 的调用 ID 为 `call_00_DO0blwJJxv9pq0XHeVEZ5846`；22:43:06 的调用 ID 为 `call_00_H7nlkbXeQSE1Q49cQX9n3760`。与用户提供的 105、106 次删除日志相符。
- `src/routes/responses/handler.ts` 在 provider 分流之前对所有请求执行 `stripRejectedToolCalls`；合法名称 `exec` 也被删除。
- 直接调用现有函数验证：输入一个 `function_call(exec)` 和配对 `unsupported call: exec` output，结果为 `changed: true, input: []`。
- `src/services/deepseek/create-responses.ts` 直接发送 body；handler 直接返回 DeepSeek 响应流，未实现 custom/function 工具往返适配。
- `tests/strip-rejected-tool-calls.test.ts` 明确要求删除合法名称的拒绝配对，现有测试固化了过宽行为，不能证明多轮工具调用可用。

105 → 106 是每轮完整回放历史中可删除配对的累计数量，并非一次响应生成了 106 个调用。上游 200 仅说明请求成功返回，客户端工具执行实际失败。

## 因果边界

可以确认：当前清理会让模型看不到这些失败调用及其错误反馈，因而放大重复调用问题；历史证明工具调用类型从 custom 变成 function。

尚不能确认：DeepSeek 上游为何改变类型，是其兼容层将 custom tool 转成 function，还是其他请求内容导致。rollout 不是该次完整 wire request/response，不能据此断言上游具体内部实现，也不能断言恢复反馈就必然恢复调用。需要核对实际 `tools` 声明和原始返回事件。当前证据不足以把 namespace 丢失认定为根因。

## 修正一：收窄历史清理

1. 保留名称符合 `^[a-zA-Z0-9_-]+$` 的全部调用及 output，包括 `exec` 的精确 unsupported 反馈。不要按工具名称、provider 或失败次数建白名单。
2. 仅对原问题范围清理：名称违反该格式、客户端精确拒绝、call/output 类型配对且 call_id 唯一的调用。保留已有顺序和歧义保护。不要扩展到未经证明的其他 item 类型校验。
3. 原来的 `mcp__kanban_execution::kanban_update` 拒绝配对仍可清理；随后合法重试及成功 output 必须保留。
4. 不修改 rollout、不修改调用参数、不引入持久化状态。替换要求“合法名称也删除”的测试。日志只报告实际清理结果，避免重复拼接上百个相同名称。

这是对先前删除策略的必要收窄：客户端拒绝不等于应当从模型上下文消失。合法的工具拒绝反馈本身是有效协议内容。

## 修正二：验证并补齐 DeepSeek custom tool 兼容

先以单个无副作用 custom 工具测试实际 DeepSeek endpoint，核对请求中 `tools` 的类型、名称、namespace、format 与返回的 JSON/SSE item。同时保留一个普通 function 工具作对照。直接保存测试工件即可，不新增通用捕获平台。

如果证实上游支持原生 custom，优先恢复其原生请求/响应契约。如果证实只支持 function，增加仅用于该上游的最小适配：

- 根据当前请求真实 custom 声明构造 function schema，参数仅为必填字符串 `input`；普通 function 声明保持原样。
- 将历史 custom call/output 对称映射到上游支持的 function call/output；保留 call_id 和执行结果，避免下一轮再次失配。
- 将已唯一匹配到 custom 声明的上游 function 结果还原为 `custom_tool_call`，解析 `arguments.input` 作为原始 `input`；还原合法 item ID，并保持所有事件中的 ID 一致。
- 同步覆盖非流式 output、流式 added/done、参数事件和 completed.output。不能直接把 JSON 参数片段当成 custom input delta；最小实现可累计该调用的 arguments，在完整合法后发出 custom input delta/done，不引入跨请求状态。
- 不硬编码 `exec`，不猜 namespace，不对未知工具或歧义匹配做类型改写。参数损坏时明确报错，不执行猜测出来的代码。
- 如果当前请求工具声明不足以唯一还原身份，先记录实际限制，不扩展成通用工具注册系统。

该适配属于 DeepSeek 上游兼容边界，不放入 GenerateContent/Interactions 转换器，也不影响 Copilot/Codex 的原生工具协议。

## 实施与验收顺序

1. 添加回归测试：合法 `exec` 拒绝配对保留；106 个配对全部保留，原顺序、字段不变；原非法名称案例仍被清理；成功重试保留。
2. 修改最小清理条件，运行单测及 Responses 路由测试，核对所有 provider 的清理语义。
3. 单工具实际请求查明 DeepSeek custom 支持情况，再按证据选择原生透传修复或最小适配。保存完整请求工具定义和响应事件作为 fixture，不包含无关历史。
4. 若需要适配，测试 custom/function 混合、历史回放、namespace 歧义、JSON 转义、跨 chunk 参数、多个调用、非法 arguments、added/done/completed 一致性。不得只测最终文本。
5. 使用 Codex 经 copilot-api → DeepSeek，实际执行一次只读工具并让模型读取结果回答；再执行下一轮工具调用，确认客户端不再拒绝。验证已有失败历史仍可继续，不能只在空会话验收。
6. 验证原非法名称历史切换到严格 Responses 上游不再报 name 格式错误。运行相关测试与 build；记录既有失败，不用 HTTP 200 代替工具成功证据。

完成标准：客户端实际执行工具且模型消费结果；连续两轮成功；保留合法失败反馈；原非法名称兼容修复仍有效；既有转换器无改动。真实测试未成功前不得标记整个修复完成。
