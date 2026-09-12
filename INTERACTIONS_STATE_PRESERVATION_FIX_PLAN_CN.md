# Responses ↔ Interactions 状态保留修正计划

日期：2026-09-12。状态：代码审核与待实施计划。

结论：当前转换器不能称为“完美转换了两个有状态协议”。已有实测证明了部分文本、function 工具和完整历史续轮能够工作，但没有证明所有会话状态无损。尤其不能把 CLI 能复述标记、缓存计数映射相等，当成完整 stateful 兼容的证据。

本计划只修正独立转换器及其测试；完整记录的修改放在独立联调脚本。保持纯函数和单次响应内的流状态，不增加数据库、会话仓库、服务端历史查询或现有业务路由接线。不含图片、多媒体和 WebSocket。

## 1. 状态应由谁保留

| 状态 | 所有者与转换责任 |
|---|---|
| 完整历史、每轮输入和工具结果 | 客户端持有；转换器逐项映射，不能丢失下一轮需要的信息 |
| 服务端历史引用 | Google 持有；真实 interaction ID 映射为 response ID，下一轮映射回 previous_interaction_id |
| thought/signature | Google 生成，客户端随 reasoning 项回传；转换器可逆封装和解包，不能摘要替换 |
| 工具调用身份 | call_id 必须贯穿生成、执行、结果回传；item ID 与 call_id 是不同概念 |
| SSE 累积状态 | 单次流实例持有，包括内容、参数、签名、usage、终态；结束后释放 |
| session-id、prompt_cache_key | 保留调用方显式元数据；没有 Google 等价字段不能假装映射成功 |
| 缓存 | 上游决定；稳定上下文和正确计数映射不等于一定 cache hit |

不需要由中转保存整段会话。客户端保留历史、上游保存引用历史，均可与纯转换器共存。

## 2. 已确认的问题及最小修正

### P1：服务端引用模式不完整，不能静默丢失会话选择

位置：`src/services/interactions/convert.ts` 的 requestSchema、请求转换和响应转换。

- previous_response_id → previous_interaction_id 已有映射，store 已有映射。
- 但 Responses 的 conversation 不在 schema 中，会被普通 z.object 静默丢弃；item_reference、compaction 则没有实现。前者可能让引用会话的请求变成缺少历史的新请求。
- 上游缺少 id 时返回空字符串；它不能作为真实的后续引用。不能用随机生成的 ID 冒充 Google 可查询的资源 ID。

修正：明确区分完整历史与真实上游 ID 引用。只传真实父 ID；核对引用模式下的指令继承、工具配置和结果 name 要求。对需要服务端解析但没有等价映射的 conversation/item_reference，给出具体的协议不支持错误，不能成功返回一个丢失上下文的请求。这里检查的是协议所需状态，不增加应用字段白名单。OpenAI 原生 encrypted_content 和 compaction 不是 Gemini signature，不能尝试解密或直接改名。

验收：真实父 ID 往返；父引用加工具结果；父引用加新 instructions；缺 ID 的完整历史模式；conversation 不再被静默丢弃。store=true 的真实引用链另行验证，不能由 store=false 的 CLI resume 代替。

### P1：失败流会丢弃已经收到的 thought 签名

位置：`src/services/interactions/stream.ts` 的 finishPartial、fail、complete、verifySnapshot。

正常结束会输出 agdata1 封装；fail 路径的 finishPartial 只返回 summary，不携带已经收到的 signature。fail 还直接把 usage 设为 null。严格比较终态 snapshot 与流累积值，也可能把终态补齐的可选数据当成冲突，而不是接受补全。

修正：区分“已收到的完整可回放 thought”与“不完整片段”。已经完整的签名和 thought 必须保留；不完整内容不能伪造成可回放状态。失败保留已有 usage。终态只补充此前缺失的信息；对已经发出的文本或参数发生真实矛盾才报错。先用规范和样本确定合法补全位置，再改判断。

验收：签名后断流、签名后 error、summary 后无签名断流、仅终态补签名、终态省略可选字段、终态文本矛盾、失败前有 usage。逐项检查最终 output，而不只检查出现 response.failed。

### P1：消息和 item 身份不是无损映射

位置：convert.ts 的 historyItem、messageText、convertInteractionStep；stream.ts 的 coordinates。

请求消息的 id、phase、status 被舍弃，多个文本块合并成一个；响应 item ID 固定为 step_0、step_1，跨响应重复。它们不一定让当前 CLI 文本用例失败，但不能宣称保留全部身份和消息语义。官方 Responses 快照明确要求回放 assistant 消息时保留 phase。

修正：保留可映射的内容分块。消息身份采用每次响应稳定且相互独立的 item ID，同一流 added/delta/done/终态保持一致，call_id 不变。Google 没有等价 phase 时明确列出兼容限制，不把 phase 塞进提示词或虚构 Google 字段。若调用方需要原始 Responses 特有字段往返，由调用方持有显式上下文；不新增中转会话表。

验收：连续两轮的 item ID 不冲突；同一响应事件引用一致；多文本块往返；commentary/final_answer 样本明确展示哪些语义可保留、哪些无法等价表达。

### P2：工具名称编码和恢复依赖当前请求

位置：convert.ts 的 qualifiedToolName、flattenTools、toolResult 及 ConversionOptions。

namespace__name 拼接不是单射，例如 namespace=a__b/name=c 与 namespace=a/name=b__c 会碰撞；还可能与普通函数名碰撞。反向恢复依赖当前请求的 toolNamespaces/customTools，不能默认父引用续轮必然重新声明全部工具。

修正：改为可逆且无碰撞的名称编码，核对 Google 名称长度与字符限制；普通名称和编码名称也必须能区分。保留明确的当前请求转换上下文。父引用缺工具声明时，不凭名称猜 custom/function 类型；明确调用方应提供的转换上下文。不要建立全局工具注册表。

验收：分隔符碰撞、普通名称碰撞、custom 与 namespace 组合、并行多个 call_id、父引用续轮工具声明缺省、重启后使用客户端提供上下文恢复。参数按 JSON 值等价验收，不宣称 JSON 空白和键顺序逐字节不变。

### P2：thought 排序和回放边界需要更强证据

位置：convert.ts 的 leadWithThoughts、thoughtSchema、decodeThought。

当前把相邻 model_output/function_call/thought 当成一段，并将其中所有 thought 移到开头。已有 Google 接受的实测支持“thought 必须在模型轮开始”，但没有证明多组 thought/tool/message 的关系始终保留。thoughtSchema 还对上游 thought 使用 strictObject，并非只校验自己生成的信封。

修正：以明确的用户/工具结果边界组织模型轮，只执行上游要求的最少重排；同类顺序稳定。信封保留完整的可回放 thought 对象，校验必要类型和编码即可，不因额外上游字段直接失败。agdata1 是本地 base64url 封装，不是 OpenAI 加密内容，也不是摘要。

验收：多 thought、多工具调用、工具结果边界、额外 thought 字段；Google thought → Responses reasoning → Google thought 深度相等，signature 字符串逐字节相等。排序调整单独断言，不能把顺序变化隐藏在“无损往返”结论中。

### P2：session 元数据在桥接层没有实际保留到记录

位置：convert.ts 返回的 metadata；`scripts/interactions-codex-live.ts` 的 respond。

转换器返回 session-id/prompt_cache_key 元数据，但桥接只使用 body/customTools/toolNamespaces，未记录 converted.metadata；client_metadata 被转换 schema 丢弃。不能声称 session 信息已被 Google 消费。

修正：当前请求上下文和完整入站头/body均记入本地日志，记录转换结果 metadata。无 Google 等价字段继续留在调用方上下文，不注入 prompt。检查稳定请求重复转换是否生成完全相同的上游 body。

验收：session-id、prompt_cache_key、client_metadata 在日志原值可见；转换前后输入不被修改；交错请求可按请求标识关联；缓存计数仅映射上游原值。

## 3. 完整本地记录：删除全部脱敏和摘要替换

用户已明确要求个人本地使用，记录必须完整保留。修改仅针对本转换器联调链路，不扩散到项目其他业务。

1. 删除 scripts/interactions-codex-live.ts 中的 SECRET_KEY、DIGESTED_KEY、digest、redact、isContainer 以及因此不再使用的 crypto import。
2. 原值保存请求与响应 body、signature、encrypted_content、工具参数/结果、usage、metadata。保存实际入站与出站 HTTP 头及状态，不做字段名过滤或值替换。
3. 补齐当前未记录的上游 SSE、下游 JSON/SSE；流按收到的字节保存可还原记录，避免 UTF-8 跨 chunk 被破坏。不能只有 stream_end 而没有内容。
4. 删除上游错误文本的 8192 字符截断；坏 JSON 和失败响应也保留原始内容。
5. 给每次请求一个日志关联标识，关联两个方向；它只用于日志，不作为上游 session ID 或缓存 key。
6. 记录写入必须能在正常请求完成、流完成和正常停机时等待落盘，避免旧实现异步队列未写完就结束。异常强杀不能承诺零丢失。
7. 将原“脱敏成功”测试替换为“原文完整保留”测试，覆盖签名、token 字段、长错误、跨字节 SSE、并发关联、最后一条记录落盘。
8. 更新当前方案中的脱敏要求。旧日志里已经替换成摘要或占位符的内容无法逆向恢复；不把既有合成 fixture 冒充原始记录。

完整日志解决的是可观测性和复现，不能替代协议状态转换本身。

## 4. 实施顺序和完成标准

先完成完整记录及对应测试，再修 P1 状态缺口，最后修工具编码、模型轮排序与元数据。每项先添加能复现问题的用例，再作局部修改。第一轮以离线确定性测试为主，不靠重复 live 调用猜规范。

运行 interactions/bridge 聚焦测试、TypeScript 检查和改动文件 ESLint。最后分别验证完整历史续轮、真实父 ID 增量续轮及失败后状态保留。通过标准是状态逐项对应，不只是 HTTP 200 或最终一句话相同。

最终报告必须区分：已保留、协议间无等价表达、未实现、尚未实测。不得宣称完整 Responses/Conversations/压缩/断流恢复兼容。HTTP 流的 last_event_id 恢复是独立能力，本计划记录其未实现，不引入重连服务。

## 5. 审核依据

- 本地代码：src/services/interactions/convert.ts、src/services/interactions/stream.ts、scripts/interactions-codex-live.ts。
- 已抓取规范：antigravity-interactions-api-docs/openai-responses-api.md（phase、reasoning、item_reference、compaction）；openai-migrate-to-responses.md（完整历史、previous_response_id、Conversations、instructions 继承）；google-ai-interactions-api.md（store、previous_interaction_id、thought、工具结果、last_event_id）。
- 官方原始页面：https://developers.openai.com/api/reference/resources/responses 、https://developers.openai.com/api/docs/guides/migrate-to-responses 、https://ai.google.dev/api/interactions-api-v1 。

本计划基于已抓取快照与当前实现审核；涉及 Google v1 具体字段是否可省略、终态补全语义等项目，实施前须核对对应 v1 规范及原始样本，不能沿用旧测试中的假设。
