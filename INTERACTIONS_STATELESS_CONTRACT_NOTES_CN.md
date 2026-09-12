# Responses ↔ Interactions 无状态转换契约核查

日期：2026-09-12。基线：`c22b879`。对应任务：`verify_stateless_conversion_contracts`。

本核查只回答三个问题：无签名 thought 与中断残片的合法性、父引用续轮的 instructions/tools 继承、省略工具声明时的身份来源。结论只使用两类证据：已抓取的规范快照，以及本仓库代码与样本的可复现行为。凡规范未写明的，一律列为待实测，不按推理当作事实。

## 1. 结论摘要

| 议题 | 规范出处 | 代码对应 | 判定 |
|---|---|---|---|
| 无签名 thought 是否合法 | ThoughtStep.signature 为 optional | `decodeThought` 要求 `encrypted_content` 为字符串 | 协议允许；转换器拒绝回放，属转换器契约而非协议事实 |
| 父引用是否继承 instructions | OpenAI 明确不继承 | 只在有本轮 instructions 时才发 `system_instruction` | 与 OpenAI 语义一致 |
| 父引用是否继承 tools | 规范未说明 | 本轮无 tools 则出站无 tools | 协议事实缺失，待实测 |
| 省略工具声明时的身份来源 | 无 | `ConversionOptions.tools`，缺项即报错 | 必须显式提供；不得隐藏缓存补齐 |
| Codex 是否用父引用 | 样本无 `previous_response_id` | 样本 `store:false` | 该样本走完整历史，不能代表父引用路径 |

## 2. 无签名 thought 与中断残片

规范把签名定义为可选字段，且描述是后端校验用途：

- `antigravity-interactions-api-docs/google-ai-interactions-api.md:13849` 起 `ThoughtStep`，`signature` 标记 `(optional)`，说明为 “A signature hash for backend validation”（同文件 13865 行）。
- `antigravity-interactions-api-docs/gemini-enterprise-interactions-api.md:2065` 起同一字段同样是 `(optional)`。
- 流式侧 `ThoughtSignatureDelta.signature` 也是 optional（google 文档 9358 行附近）；`ThoughtSummaryDelta` 的 `content` 说明为 “A new summary item to be added to the thought”（9382-9422 行）。两份规范都没有“thought 必须带签名”的表述。
- `ThoughtStep.summary` 亦为 optional（google 文档 13871 行），因此“只有 summary、没有 signature”在 schema 上合法。

代码侧的行为：

- `src/services/interactions/convert.ts:350` 的 `case "reasoning"` 直接调用 `decodeThought(item.encrypted_content)`；`decodeThought`（同文件 250 行）先执行 `string(value)`，缺失即抛错。
- 反向转换只在存在签名时才写 `encrypted_content`（同文件 thought 分支的 `if (thought.signature === undefined) return item`），所以无签名 thought 仍会产出 `reasoning` 项，只是没有回放信封。
- 顶层额外字段用 `z.looseObject` 保留，但 `encrypted_content` 本身必须存在才能回放。

复现（直接调用现有导出函数，未联网）：

```
A unsigned-thought replay: {"ok":false,"error":"Expected a string"}
B reply to a summary-only thought: {"ok":true,"value":[{"type":"reasoning","id":"v_0","summary":[{"type":"summary_text","text":"t"}]}]}
```

A 说明把无签名 `reasoning` 项当作下一轮输入会被拒绝，B 说明转换器确实会产出这种无信封的 `reasoning` 项。两点合起来就是一个真实存在的不对称：**上游可以发无签名 thought，转换器也能转成 Responses 形状交给客户端，但客户端原样回传时转换器拒绝。**

三点区分：

1. 协议事实：无签名 thought 与仅 summary 的 thought 都在 schema 内合法。
2. 转换器契约：当前实现把“可回放”定义为必须携带 `agdata1.` 信封，即必须来自带签名的 thought。
3. 待实测：回放带签名的 thought 是否被上游接受、无签名 thought 回放是否被上游拒绝、真实断流残片的实际形态。这三项都没有本地证据，不能由 schema 缺失推断。

顺带记录一条同类边界：代码注释引用的“模型轮必须以 thought 开头”约束，在两份已抓取规范里都检索不到原文（对 `start with a thought`、`model turn`、`must start`、`thought block` 均无命中）。它来自运行时观察到的上游报错，应标注为运行期约束而非规范条款。

## 3. 父引用续轮的 instructions 与 tools 继承

instructions 一侧是明确的：

- `antigravity-interactions-api-docs/openai-responses-api.md:14416`：“When used along with `previous_response_id`, the instructions from a previous response will not be carried over to the next response.”
- `antigravity-interactions-api-docs/openai-migrate-to-responses.md:708`：要求每轮重发稳定 instructions，并同样说明不会被携带。
- 代码对应：`convert.ts:513-520` 只在 `system.length > 0` 时写 `system_instruction`，并在有父 ID 时写 `previous_interaction_id`。这与 OpenAI 语义一致，父引用续轮只携带本轮新 instructions。

tools 一侧没有规范依据：

- Google 文档对 `previous_interaction_id` 的全部说明只有 “The ID of the previous interaction, if any.”（google 文档 1097 行、2538 行）。
- `tools` 的说明是 “A list of tool declarations the model may call during interaction.”（google 文档 291 行、2702 行），描述的是本请求的声明来源，没有跨请求继承的描述。
- 代码对应：`if (request.tools !== undefined) body.tools = tools`（`convert.ts:516` 附近），本轮省略则出站也不带 tools。

复现：

```
D parent continuation tools: {"ok":true,"value":{"tools":0,"body":{"model":"g","input":[{"type":"function_result","call_id":"c1","result":[{"type":"text","text":"sunny"}]}],"store":true,"previous_interaction_id":"parent"}}}
```

出站 body 的形状因此可以离线断言（父 ID 在、tools 不在、工具结果允许省略 name）。但“上游是否仍按上一轮声明的工具集响应”只能由真实调用回答。该问题需要 parent + 工具结果 + 未重声明工具的真实样本，本任务未调用端点。

## 4. 省略工具声明时的身份来源

反向转换需要一份“上游函数名 → 客户端声明身份”的映射，用于还原 namespace 与 custom 类型：

- `convert.ts:576` 在查不到身份时抛出 `Tool call <name> is not in the declared tools`，不按名称猜测类型。
- 映射由调用方通过 `ConversionOptions.tools` 传入；`scripts/interactions-codex-live.ts:450-452` 只传本轮 `converted.tools`。
- 因此父引用续轮不重声明工具时，映射为空。

复现：

```
E undeclared call: {"ok":false,"error":"Tool call weather is not in the declared tools"}
```

结合 D 与 E：省略工具声明的父引用续轮如果遭遇上游工具调用，转换器会明确失败。这是被发现的边界，不是被伪装成成功的降级。

客户端样本支持的范围有限。`tests/fixtures/interactions/codex-cli-request.json` 的关键字段是：

```
store: false
stream: true
include: ["reasoning.encrypted_content"]
prompt_cache_key: "<session_id>"
tool_choice: "auto"
parallel_tool_calls: true
client_metadata: { root_turn_id, turn_id, session_id, thread_id, ... }
tools: 16 个顶层条目（展开后 33 个函数）
input: [developer, user, user]
```

该样本没有 `previous_response_id`，且 fixture 自身标注了 `[synthetic]` 系统提示，属部分合成样本。`store: false` 意味着服务端不保存历史，续轮只能靠完整历史；因此“父引用续轮省略工具声明”对这份样本所代表的客户端并非主路径。转换器也没有为它准备隐藏恢复机制。

边界结论：调用方可以显式提供身份映射，但转换器不能假定客户端会额外发送自定义映射，也不能用上一轮缓存补齐，更不能按名称猜测 custom/namespace。若上游确实会在未声明工具的续轮中返回工具调用，这属于已声明的兼容限制。

## 5. 事实、契约与待实测

| 类别 | 内容 |
|---|---|
| 规范事实 | ThoughtStep.signature 与 summary 均为 optional；previous_interaction_id 仅有“上一条交互的 ID”一句说明；instructions 不随父引用继承（OpenAI 侧） |
| 代码契约 | 回放必须带 `agdata1.` 信封；反向转换必须显式声明工具身份；父引用续轮只发本轮 instructions |
| 运行期观察 | 模型轮须以 thought 开头（不在已抓取规范中） |
| 待实测 | 无签名或残片 thought 回放的上游结果；父引用下 tools 的实际继承；真实断流残片形态；真实 cache 命中 |
| 已确认边界 | 省略工具声明的父引用续轮遇上游工具调用会明确失败 |

## 6. 对后续任务的输入

- `fix_streamed_thought_fidelity`：只处理单次响应内的对象保真，不因本节改写无签名 thought 的语义。
- `test_client_owned_continuation`：把“无签名 reasoning 原样回传会失败”写成正反向契约测试；父引用出站 body 形状可离线断言，上游继承语义若无真实样本则标注未验证，不写成已支持。
- `validate_and_report_fidelity_rework`：本节的规范行号可直接引用于最终报告的“协议事实”栏，运行期观察与待实测项需分开陈述。
