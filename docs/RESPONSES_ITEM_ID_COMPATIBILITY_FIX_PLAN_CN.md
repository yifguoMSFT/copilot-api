# Responses item ID 兼容性修复计划

日期：2026-09-13。状态：待实施；本文件不代表修复或真实测试已完成。

## 目标与证据

修复 Gemini / Antigravity 输出的 Responses item ID 缺少类型前缀的问题，并在公共 Responses 请求入口修复旧历史中的同类 ID，使历史工具调用不再因该前缀错误被上游拒绝。

用户提供的 session `01a099c1-ca10-79b0-9f51-9b30b6b10c16` 报错为：

```text
Invalid 'input[142].id': '11KmaujSL-ON1e8P2rKtmQk_0'. Expected an ID that begins with 'fc'.
```

本次代码核对确认：

- `src/services/generate-content/convert.ts` 的 `responseItemId` 返回 `${scope ?? "step"}_${index}`；`stream.ts` 用它生成 message、function/custom tool call 和 reasoning 的 ID，以及 SSE 的 `item_id`。
- `src/services/interactions/convert.ts` 存在相同 helper，`convertInteractionStep` 将同一个无类型前缀 ID 用于多种输出；`interactions/stream.ts` 也独立计算事件引用。
- `src/routes/responses/handler.ts` 在模型路由后向 Codex、Copilot、DeepSeek、Antigravity 分支转发，没有公共 input item ID 修复步骤。
- 现有 `sse-item-id-normalizer.ts` 负责 Copilot 流中 ID 的一致性，不负责按 item 类型补前缀，不能替代此修复。

尚未重新读取该 session 原始记录或重现上游报错。因此，上游来源及具体切换过程沿用用户提供的诊断，不将其写成此次独立验证的结论。报错直接证明 function_call 要求 `fc` 前缀；生成端采用常用的 `fc_` 等形式。其他类型的严格校验规则及长度限制需在实施时用已有协议资料和目标上游验证，不将参考实现等同于官方规范。

## 范围与不变量

只改 Responses item ID 的生成、引用和旧历史兼容，不引入状态数据库、会话服务、配置开关、模型白名单或日志脱敏。不修改 Codex rollout 文件。

必须区分三种标识：item 的 `id`、工具配对的 `call_id`、整个响应的 `response.id`。本修复只处理第一种及其明确引用。`function_call_output.call_id` 和对应调用的 `call_id` 原样保留；不因 item 前缀变化重生成工具关联 ID。

`thought_signature`、`encrypted_content`、未知字段、工具参数/结果、消息内容、顺序、session/cache 字段保持完整。不得删除 reasoning、截断 carrier 或通过丢历史绕过报错。

## 任务 1：生成端使用类型化 item ID

在现有转换模块就地修改 ID 生成点，必要时提取一个小型纯函数供两套转换器复用，不创建框架。

| 输出类型 | 新生成 ID |
| --- | --- |
| message | `msg_<scope>_<index>` |
| function_call | `fc_<scope>_<index>` |
| custom_tool_call | `ctc_<scope>_<index>` |
| reasoning | `rs_<scope>_<index>` |

保留现有 response scope 的唯一性机制。不要直接改变同时用于生成 `call_id` 的旧 seed 语义：将 item ID 与 call ID 的构造明确分开，保持工具关联行为不变。

在 item 创建时确定最终 ID。其 added、delta、done、content part、arguments/input、reasoning 事件及 `response.completed.output[]` 全部引用该 ID，避免只给终态补前缀或继续在事件里用无类型 helper 重算。Interactions 的非流式输出与流式输出采用相同规则。

## 任务 2：公共入口兼容旧历史

在 `handler.ts` 的 Responses body 解析/模型解析链路中、所有 provider 分支之前，增加一次纯函数式 input ID 规范化。尽量复用现有 JSON 解析，未发生修改时保留原始 body，避免改变正常透传行为。

规则：

1. 只处理 `input[]` 中已知类型、存在非空字符串 `id` 的对象。字符串 input、缺失 ID、未知类型及其他字段不变，不为历史凭空补 ID。
2. message、function_call、custom_tool_call、reasoning 按类型补前缀；已有目标上游接受的前缀保持不变。不要误将“生成时使用下划线”扩大为“拒绝一切无下划线 ID”。
3. 示例：function_call 的 `11KmaujSL-ON1e8P2rKtmQk_0` 改为 `fc_11KmaujSL-ON1e8P2rKtmQk_0`。`call_id` 和工具结果完全不变。
4. 映射必须确定、幂等。同一 body 再处理不产生第二层前缀。
5. 先收集已有 ID，避免 `x` 与 `fc_x` 补齐后碰撞；仅冲突项使用稳定后缀并检查唯一性，不随机重命名合法项。
6. 同一请求存在 `item_reference` 且能唯一对应到被改名 item 时，同步更新引用。对缺少目标或存在歧义的引用不猜测类型，也不遍历任意嵌套字符串做替换。服务器保存的 item 引用、`previous_response_id`、conversation ID 不在改名范围。
7. `function_call_output` 的关联由 `call_id` 保持，不能套用 `fc_`。参考实现中的 `custom_tool_call_output` / `ctco` 规则须先核实目标协议再纳入；不机械推广至所有 output 类型。

参考 `reference/CLIProxyAPI/internal/runtime/executor/helps/codex_input_ids.go` 的按类型处理及冲突测试思路。**不移植其删除过长 encrypted reasoning 的逻辑**。长度处理若被实际协议约束要求，单独以证据补充，不在本轮猜测截断。

## 任务 3：回归测试

先增加能复现旧代码失败的测试，再实现修复。

| 验证项 | 验收要求 |
| --- | --- |
| 原始报错 fixture | 在 `input[142]` 放入所报 function_call ID；转发时得到正确前缀，其他 142 项及工具关联不变 |
| 两套转换器 | message、function_call、custom_tool_call、reasoning 均带对应前缀；Interactions 非流式也覆盖 |
| SSE 一致性 | 同一个 output_index 的所有事件引用与终态 item.id 一致，多个 item 和多响应之间不碰撞 |
| 状态续轮 | 工具结果能关联原调用；thought signature、carrier、未知字段及文本完整保留，Gemini 续轮转换结果不因 ID 修复改变 |
| 入口边界 | 正常 ID、字符串 input、缺失 ID、未知类型不变；重复执行幂等；补前缀冲突可区分；明确引用同步更新 |
| provider 覆盖 | Copilot、Codex、DeepSeek、Antigravity 的 mock 上游都收到规范化 body，正常无修改请求保持原透传行为 |
| 新旧历史 | 新生成 Gemini 工具 item 可作为下一次 Responses input；旧无前缀 item 也能在请求入口恢复 |

优先扩充 `tests/generate-content-stream.test.ts`、`tests/interactions-convert.test.ts`、`tests/interactions-stream*.test.ts`、`tests/responses-route.test.ts`，入口纯函数可新增一个专用测试文件。保留现有 Codex passthrough 测试，明确记录有问题 ID 修复属于有意的 body 变更。

运行相关测试后执行 `bun test tests/`、`bun run build`；针对改动文件检查 lint，避免自动格式化无关文件。失败应区分新增回归与既有问题，记录实际结果。

## 任务 4：真实跨模型验证与报告

通过本机 Copilot API 和 Codex CLI，在同一会话先用 `gemini-3.8-flash-tiered` 完成一次真实工具调用，再切换至可用的 Copilot GPT 模型继续。另将原始旧 ID fixture 通过同一入口提交，验证历史兼容路径。保存实际请求、SSE、上游状态及续轮结果到项目测试记录，完整保留协议内容。

成功必须包含：无原始 ID 前缀 400、GPT 实际完成续轮、工具关联正常、新输出所有相关事件 ID 一致。若真实调用受授权、配额或其他上游错误阻塞，记录阻塞，不将该项标为完成。

修复前缀不等于跨厂商加密状态互通：`gcparts1.` / `agdata1.` 是项目的 Gemini 状态载体，OpenAI 不一定接受它们作为自身 `encrypted_content`。若 ID 修复后暴露此类错误，应保留原始状态并单独报告，不能删除 reasoning 来宣称本任务已实现完全跨模型兼容。

## 完成标准

生成端不再产出此次已知的无前缀 item；入口能修复旧历史而不破坏工具和状态；回归测试及构建结果落盘；真实跨模型验证有明确证据或明确未完成原因。仅完成代码或 mock 测试时，不宣称原会话已恢复。
