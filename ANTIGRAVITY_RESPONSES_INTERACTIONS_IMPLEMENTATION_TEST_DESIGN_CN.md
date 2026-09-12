# Codex Responses ↔ Interactions 实现与测试设计

日期：2026-09-12。状态：待实现；本次交付为独立转换器与离线测试，真实客户端和上游兼容性不作为已验证结论。

## 1. 目标

新增独立模块，转换 Codex 的 Responses 请求与 Google Interactions 响应，支持文本、工具调用、JSON 和 SSE 数据转换。

实施目录：`I:/Cache/workshop/worktree/copilot-api-antigravity-interactions`，分支：`antigravity-interactions`。实现阶段只新增下表列出的转换器、测试、fixtures 和测试报告；不修改已有源码、测试、配置、依赖、启动逻辑或模型目录。本次规划仅修正本设计与对应看板。现有官方资料只读，不再参考 CLIProxyAPI。

**客户端保存完整历史和重放数据，中转仅处理当前请求。** 缓存由上游服务管理。范围不包含图片、多媒体、WebSocket、后台任务及 Responses 资源管理接口。

## 2. 实现结构

两个独立转换方向：`Responses 请求对象 → Interactions 请求对象`；`Interactions 响应对象 / SSE 字节 → Responses 响应对象 / SSE 字节`。网络收发由调用方负责。

| 模块 | 职责 |
|---|---|
| `src/services/interactions/convert.ts` | 请求和 JSON 响应转换、工具包装、reasoning 数据往返 |
| `src/services/interactions/stream.ts` | SSE 解码、单请求内容累积、Responses 事件输出 |
| `tests/interactions-convert.test.ts` | 请求与 JSON 转换测试 |
| `tests/interactions-stream.test.ts` | SSE 分片、事件、错误测试 |
| `tests/interactions-round-trip.test.ts` | 离线工具循环、客户端重放、请求隔离与 JSON/SSE 一致性 |
| `tests/fixtures/interactions/` | 必要的脱敏协议样本及来源说明 |
| `ANTIGRAVITY_INTERACTIONS_TEST_REPORT_CN.md` | 测试结果与未验证兼容性 |

不创建 provider、HTTP 客户端、登录或鉴权注入逻辑，不接入 `/responses` 或 `/v1/responses`，不添加现有模块的 import/export 接线。转换器不读取 runtime-config、全局 state、环境变量或凭据。调用方显式传入上游模型名和需要回显的模型名，转换器不选择 provider 或 endpoint。

转换函数只依赖本次请求、上游响应和调用方显式传参；请求结束释放缓冲。使用项目现有 TypeScript、Zod 和 Bun，不增加会话存储。

## 3. 请求转换

### 字段映射

| Responses | Interactions |
|---|---|
| model | 调用方显式传入的上游 model；未覆盖时保留请求值 |
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

解析器处理 UTF-8 跨 chunk、CRLF、多行 data 和心跳。正常响应只发一个终态；中途断流不能标记完成。提供结束输入和释放当前实例缓冲的接口，取消后不再输出事件；fetch / reader 的取消由调用方负责。

### Usage

input_tokens、cached_tokens、reasoning_tokens 分别来自 total_input_tokens、total_cached_tokens、total_thought_tokens。若实际 endpoint 的 output 不包含 thought，Responses output_tokens 为两者之和；通过 fixture 确定计数口径。

total_tokens 使用上游值，累计 usage 取最后快照。缺失统计按客户端 schema 允许的形式省略或置空，不编造数值。Google 未提供 OpenAI cache_write_tokens 的等价统计，需验证 Codex 对缺省字段的接受情况。

## 5. 调用接口与错误

请求和 JSON 响应转换采用纯函数，返回新对象，不修改输入。SSE 转换器接受 Uint8Array 分片，返回转换后的事件数据；状态仅属于当前实例。复用必要的映射函数，不引入通用协议框架。

非法或不支持的输入抛出模块内明确的转换错误，不创建 HTTP Response，也不决定 HTTP 状态码或请求头。上游协议错误与异常 EOF 转为失败事件，畸形帧不能静默丢弃后宣称成功。限制当前流的未完成帧与参数缓冲，避免无限累积；网络超时、重试和 HTTP 错误处理属于调用方。

## 6. 客户端历史与缓存

### 历史和 ID

Codex 每轮发送完整 input 历史及需要重放的 reasoning items。`store:false` 原样发送，中转不补充历史，不隐式增加 previous_interaction_id。

response.id 直接使用 interaction.id，因此显式 previous_response_id 可以直接对应 previous_interaction_id，无需映射表。显式父引用表示使用上游已存储历史，存在性与访问权限由上游检查；本次 input 是增量。该用法需要验证上游 instructions 覆盖语义，客户端完整历史模式不依赖它。

离线测试验证 interaction ID 原样输出；真实 Codex 是否接受该 ID 留待后续接入验证。本次不另造 ID 编码。

### Reasoning 重放

Google 的 thought/signature 需要原样恢复。可见摘要转换为 reasoning.summary，恢复所需的原生 thought 数据序列化为 `agdata1.<base64url(JSON)>`，放入 reasoning item 的 encrypted_content 字符串，随最终 output_item.done 及 response.output 交给客户端。

这是代理的可逆数据包装，不是 OpenAI 加密格式。客户端保存该 item，下次 input 带回；中转校验版本、类型、大小后解包，恢复对应 thought 和顺序。只接受预期的 thought 数据，不把解包内容合并到鉴权、路由或顶层请求。签名有效性由上游验证。

本次以离线测试验证包装、客户端模拟保存、解包的可逆性。实际 Codex 是否重放该字段、Google 是否接受恢复数据仍未验证，应在报告中明确。若必要数据没有被客户端带回，明确报告无法恢复；不能丢弃签名后宣称上下文完整。不同厂商的原生 encrypted_content 不互通。

离线测试要求：客户端带回完整数据时，全新转换器实例能够恢复相同的协议内容，不依赖上轮实例。

### Session 与缓存

调用方可把 session-id、prompt_cache_key 作为显式请求上下文传入，转换结果将其作为独立 metadata 原样返回，供未来调用方使用；不放入 Google body，不保存到全局。只有已确认的协议字段才做 body 映射，缺乏等价字段时不得伪造。

保留指令、工具名、文本和历史顺序，不向 prompt 注入随机值。账号与 endpoint 的稳定选择由未来调用方负责。缓存由上游管理，转换器只映射 total_cached_tokens；测试验证稳定输入、metadata 不丢失与统计映射，不宣称实际缓存命中。

## 7. 实现与测试

实施顺序：核对官方协议样本；完成请求 / JSON 转换；完成 SSE；离线验证往返与隔离；运行检查并审计新增文件范围。无需凭据或实际 endpoint，不执行网络请求。

| 测试 | 必须验证 |
|---|---|
| 文本和指令 | 多轮顺序、原文、model 与参数映射正确 |
| 工具循环 | function / 实际 custom 工具参数可逆，call_id 与结果对应 |
| JSON 响应 | message、reasoning、工具 item、终态与 usage 正确 |
| SSE | 事件顺序、稳定 ID、多工具隔离、初始内容、终态缺输出 |
| 分片与失败 | UTF-8/CRLF/心跳、坏 JSON、断流、缓冲上限和实例取消 |
| JSON/SSE 对照 | 相同上游内容得到相同最终 output 和 usage |
| 无状态重放 | 全量历史不重复；代理重启 / 空白实例仍可恢复客户端带回的 thought |
| 请求隔离 | 交错请求无共享缓冲；session/cache key 不触发历史追加 |
| 缓存统计 | 稳定前缀、已知零和缺失统计有区别，cached tokens 如实映射 |
| 范围审计 | 现有文件内容不变、没有接线或依赖新增；基线失败单独记录 |

Mock 期望值由官方样本和人工核对生成。测试模拟“文本 → 工具调用 → 客户端保存 → 工具结果回传 → 继续回答”，每轮创建全新转换器实例；不启动网关、不执行工具、不调用真实服务。报告明确区分离线协议保证和真实 Codex、Antigravity endpoint、缓存命中等未验证项。

运行三个新增测试文件的 `bun test`、`bun run typecheck`、仅针对新增 TypeScript 文件的 ESLint（不带 --fix）、`bun run build` 和 `bun test`。不运行会批量改写已有文件的 lint 命令。用实施基线比较所有已有受跟踪文件，要求零内容变更；允许新增文件仅限 §2 清单与看板执行产物。基线失败如实记录，不借机修改已有代码。最终提交仅包含本任务新增交付物；规划文档与看板修正在实施前的基线提交中保存。

## 8. 依据

基于 2026-09-12 抓取的官方资料：

- [Google AI Interactions](antigravity-interactions-api-docs/google-ai-interactions-api.md)
- [Gemini Enterprise Interactions](antigravity-interactions-api-docs/gemini-enterprise-interactions-api.md)
- [OpenAI Responses](antigravity-interactions-api-docs/openai-responses-api.md)
- [迁移至 Responses](antigravity-interactions-api-docs/openai-migrate-to-responses.md)
