# Codex Responses ↔ Interactions 实现与测试设计

日期：2026-09-12。状态：待实现，协议兼容性待实际 Codex 验证。

## 1. 目标

在 `copilot-api` 中转换 Codex 的 Responses 请求与 Google Interactions 响应，支持文本、工具调用和 HTTP JSON / SSE。

**客户端保存完整历史和重放数据，中转仅处理当前请求。** 缓存由上游服务管理。范围不包含图片、多媒体、WebSocket、后台任务及 Responses 资源管理接口。

## 2. 实现结构

数据流：`Codex input → Interactions input → 上游 HTTP → Responses output → Codex 保存并在下次请求中重放`。

| 模块 | 职责 |
|---|---|
| `src/services/interactions/convert.ts` | 请求和 JSON 响应转换、工具包装、reasoning 数据往返 |
| `src/services/interactions/stream.ts` | SSE 解码、单请求内容累积、Responses 事件输出 |
| `src/services/interactions/create-responses.ts` | 调用上游、鉴权注入、错误与取消、转换编排 |

在现有 `model-routing.ts`、`runtime-config.ts`、模型目录及 `routes/responses/handler.ts` 接入 Interactions 分支。模型名决定配置的上游，客户端继续使用同一个网关 provider。鉴权使用独立服务提供的凭据。

转换函数只依赖本次请求、上游响应和固定配置；请求结束释放缓冲。使用项目现有 TypeScript、Zod 和 Bun，不增加会话存储。

## 3. 请求转换

### 字段映射

| Responses | Interactions |
|---|---|
| model | 配置中的实际上游 model |
| instructions | system_instruction |
| input 字符串 | user_input，content 为 text |
| user message | user_input |
| assistant message | model_output |
| stream / store | 保留显式值；store 缺省按 Responses 默认 true 处理 |
| max_output_tokens | generation_config.max_output_tokens |
| reasoning.effort | 目标模型支持的 generation_config.thinking_level |
| reasoning.summary=auto | generation_config.thinking_summaries=auto |
| function 工具声明 | function name / description / parameters |
| tool_choice auto / none / required | generation_config.tool_choice auto / none / any |
| 指定 function | tool_choice.allowed_tools，mode=any，tools=[对应名称] |
| function_call | function_call，id=call_id，arguments 从字符串解析为对象 |
| function_call_output | function_result，call_id 保留，result=output |
| previous_response_id | previous_interaction_id；该用法依赖上游存储，见 §6 |

按 input 顺序逐项转换，保留文本、换行及工具结果字符串。工具 call_id 与 output item.id 分开处理。非法参数 JSON 返回错误，不修改为默认对象。

当前指令由本次 instructions 和前置 system/developer 文本按固定顺序组成。单一 system_instruction 无法完全表达两种指令层级；历史中间出现指令时明确报错，不随意移动它。顶层 instructions 不从上轮补回。

其他字段按实际 Codex 请求建立有限支持表。显式语义参数无法映射时返回错误；已确认无语义影响的遥测可以忽略。Google 两份快照的参数存在差异，例如 temperature/top_p，发送前以实际 endpoint 契约为准。

### 工具

普通 function 直接转换声明与调用。Google arguments 对象序列化后作为 Responses arguments 字符串。参数先收齐并校验，再向 Codex 返回完整调用；strict 约束只对已支持的工具 schema 实施，无法满足时明确报错。

Codex custom 文本工具包装为 Google function，参数为 `{input:string}`。响应时取出 input，恢复原始 custom_tool_call；工具名称映射固定且可从当前 tools 恢复。只实现实际 Codex 使用的格式约束。

工具由 Codex 执行，中转负责调用与结果的格式转换。

## 4. 响应转换

### JSON

| Interactions | Responses |
|---|---|
| interaction.id | response.id 原样使用 |
| model_output 的 text | assistant message，content 为 output_text |
| function_call | function_call，call_id 保留，arguments 序列化 |
| 包装后的 custom 调用 | custom_tool_call，恢复 name 和 input |
| thought.summary | reasoning.summary |
| thought 原生重放数据 | 随 reasoning item 返回客户端，见 §6 |
| completed | completed |
| requires_action | completed，output 包含待 Codex 执行的工具调用 |
| incomplete / failed | incomplete / failed，映射已知原因 |

构造目标 Codex 所需的 response envelope，包括 object、created_at、model、status、output、error 和 usage。model 回显客户端请求名。输出保持 step 顺序，不重复加入上游回显的输入历史。

### SSE

当前快照使用 `step.start / step.delta / step.stop`。每个 HTTP 请求维护一个累积器：response ID、递增 sequence_number，以及各 step 的 item ID、文本、参数、摘要、签名与结束状态。

| 上游事件 | 转换动作 |
|---|---|
| interaction.created | 发 response.created、response.in_progress |
| step.start | 创建对应输出 item，处理事件自带内容 |
| step.delta text | 发 content_part.added（首次）和 output_text.delta，累积文本 |
| step.delta arguments_delta | 按 step 累积工具参数；收齐校验后发完整参数事件 |
| thought_summary / thought_signature | 摘要发 reasoning 事件，签名累积到最终重放数据 |
| step.stop | 发对应内容 done、part done 和 output_item.done |
| interaction.completed | 用累积内容构造最终 response，发对应终态 |
| error / 异常 EOF | 结束为失败 |

文本事件顺序：`output_item.added → content_part.added → output_text.delta* → output_text.done → content_part.done → output_item.done`。工具可延迟到参数校验成功后再发 added 和完整参数事件。

保持 item ID 稳定，多个工具的参数缓冲互相隔离。签名晚到时延后 reasoning item.done，确保其包含完整重放数据。终态事件可能不带输出，必须使用此前累积内容；同一内容不能重复追加。

解析器处理 UTF-8 跨 chunk、CRLF、多行 data 和心跳。正常响应只发一个终态；中途断流不能标记完成。客户端取消时取消上游 fetch / reader，并释放缓冲。

### Usage

input_tokens、cached_tokens、reasoning_tokens 分别来自 total_input_tokens、total_cached_tokens、total_thought_tokens。若实际 endpoint 的 output 不包含 thought，Responses output_tokens 为两者之和；通过 fixture 确定计数口径。

total_tokens 使用上游值，累计 usage 取最后快照。缺失统计按客户端 schema 允许的形式省略或置空，不编造数值。Google 未提供 OpenAI cache_write_tokens 的等价统计，需验证 Codex 对缺省字段的接受情况。

## 5. HTTP 与错误

同时接入 `/responses` 和 `/v1/responses`。转换后重建 Content-Type 和传输长度相关头；上游鉴权由网关注入。

非法或不支持的输入返回明确的 400 错误。上游 HTTP 错误转换为 Responses 错误；SSE 已开始后通过失败事件结束。设置请求、帧、参数缓冲大小与超时限制，不自动重试生成请求。

## 6. 客户端历史与缓存

### 历史和 ID

Codex 每轮发送完整 input 历史及需要重放的 reasoning items。`store:false` 原样发送，中转不补充历史，不隐式增加 previous_interaction_id。

response.id 直接使用 interaction.id，因此显式 previous_response_id 可以直接对应 previous_interaction_id，无需映射表。显式父引用表示使用上游已存储历史，存在性与访问权限由上游检查；本次 input 是增量。该用法需要验证上游 instructions 覆盖语义，客户端完整历史模式不依赖它。

是否允许目标 Codex 接受原始 interaction ID，应在 fixture / 实测中确认；没有已知客户端限制时不另造 ID 编码。

### Reasoning 重放

Google 的 thought/signature 需要原样恢复。可见摘要转换为 reasoning.summary，恢复所需的原生 thought 数据序列化为 `agdata1.<base64url(JSON)>`，放入 reasoning item 的 encrypted_content 字符串，随最终 output_item.done 及 response.output 交给客户端。

这是代理的可逆数据包装，不是 OpenAI 加密格式。客户端保存该 item，下次 input 带回；中转校验版本、类型、大小后解包，恢复对应 thought 和顺序。只接受预期的 thought 数据，不把解包内容合并到鉴权、路由或顶层请求。签名有效性由上游验证。

必须验证 Codex 会完整重放这个字段，以及 Google 接受恢复的数据。若必要数据没有被客户端带回，明确报告无法恢复；不能丢弃签名后宣称上下文完整。不同厂商的原生 encrypted_content 不互通。

由此，代理重启或切换到配置相同的空白实例，不影响完整重放请求。

### Session 与缓存

客户端 session-id、prompt_cache_key 保留在当前请求上下文，上游明确支持的会话字段按约定传递。未有文档映射的字段不能擅自添加到 Google body。

同一配置稳定选择账号、模型和 endpoint；保留指令、工具名、文本和历史顺序，不向 prompt 注入随机值。缓存由上游管理，按实际 total_cached_tokens 报告命中情况。session 不变不代表缓存必然命中，中转不保存会话也不妨碍缓存命中。

## 7. 实现与测试

实施顺序：确认实际 endpoint 与 Codex HTTP 样本；完成请求 / JSON 转换；完成 SSE 与 reasoning 往返；接入模型路由并验收。

| 测试 | 必须验证 |
|---|---|
| 文本和指令 | 多轮顺序、原文、model 与参数映射正确 |
| 工具循环 | function / 实际 custom 工具参数可逆，call_id 与结果对应 |
| JSON 响应 | message、reasoning、工具 item、终态与 usage 正确 |
| SSE | 事件顺序、稳定 ID、多工具隔离、初始内容、终态缺输出 |
| 分片与失败 | UTF-8/CRLF/心跳、坏 JSON、断流、超时和取消 |
| JSON/SSE 对照 | 相同上游内容得到相同最终 output 和 usage |
| 无状态重放 | 全量历史不重复；代理重启 / 空白实例仍可恢复客户端带回的 thought |
| 请求隔离 | 交错请求无共享缓冲；session/cache key 不触发历史追加 |
| 缓存统计 | 稳定前缀、已知零和缺失统计有区别，cached tokens 如实映射 |
| 网关回归 | 两个入口、鉴权、provider 路由、不支持输入以及现有 provider 测试 |

Mock 期望值由官方样本和人工核对生成。真实验收完成一次“文本 → 本地工具 → 回传结果 → 继续回答”，再验证跨代理重启的 reasoning 重放和固定长前缀的实际缓存统计。

测试文件：`interactions-convert.test.ts`、`interactions-stream.test.ts`、`interactions-route.test.ts`。实现后执行对应 `bun test`、`bun run typecheck`、`bun run lint`、`bun run build` 和项目回归测试。

## 8. 依据

基于 2026-09-12 抓取的官方资料：

- [Google AI Interactions](antigravity-interactions-api-docs/google-ai-interactions-api.md)
- [Gemini Enterprise Interactions](antigravity-interactions-api-docs/gemini-enterprise-interactions-api.md)
- [OpenAI Responses](antigravity-interactions-api-docs/openai-responses-api.md)
- [迁移至 Responses](antigravity-interactions-api-docs/openai-migrate-to-responses.md)
