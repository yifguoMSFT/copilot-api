# 状态保留修正实现复核与返工计划

日期：2026-09-12。审核基线：`49ea45d`。对照：`INTERACTIONS_STATE_PRESERVATION_FIX_PLAN_CN.md`、修正报告、转换器及独立联调脚本与测试。

## 评价

需要局部返工，不能按“全部状态保留验收完成”收尾。方向基本正确：没有引入会话数据库，父引用由上游持有，工具身份由调用方显式提供，流状态限定在单次响应。主要缺口是 **SSE thought 对象并未完整回放** 和 **完整日志承诺未兑现**，不是架构需要扩大。

本次只审核并新增本文，没有修改代码、看板或用户并发改动。复跑 `bun test tests/interactions`：126 pass、0 fail、422 assertions。另用 Bun stdin 直接调用现有转换函数完成下述反例；未调用真实 Google、未读取 key。既有测试通过不能覆盖这些反例。

## 返工状态（2026-09-12 更新）

R1、R2 已修正，R3 已按结论收窄，逐项实现、测试与命令输出见 [[INTERACTIONS_CONVERSION_FIDELITY_REWORK_REPORT_CN.md]]。本节其余内容保留为修复前的复核记录，其中“修复前行为”的描述均已被对应反例测试固定下来。

## 计划对照

| 计划项 | 复核评价 |
|---|---|
| 父 ID、store、无等价会话对象明确失败 | 基础映射已实现；父引用工具结果和新 instructions 的真实语义证据仍不完整 |
| 失败流保留 signature、usage | 已收到签名及已捕获 usage 的常规路径有测试；thought 完整对象仍有下述缺口 |
| 文本分块、item 与 call_id | 普通消息分块和同流身份稳定性有覆盖；工具结果数组仍合并文本块；无 ID 的 item scope 仅进程内唯一 |
| 工具身份 | 显式 Map 和 namespace 编码可用；碰到普通名称与编码名称相同会明确报错，不能描述为对所有合法名称组合均无碰撞支持 |
| thought 可逆封装和最小排序 | JSON 路径保留额外字段；SSE 路径不满足同一承诺，需要返工 |
| session metadata | 保留为调用方元数据，未冒充 Google cache/session 字段，符合计划 |
| 完整原值记录 | 已去掉脱敏和错误截断，但缺下游 JSON、SSE HTTP 元信息及原始字节，需补齐 |

## 必须返工

### R1 · P1：SSE thought 回放对象被重建，字段丢失（已完成）

位置：`src/services/interactions/stream.ts` 的 `materialize()`、`delta()`、`verifySnapshot()`。

直接复现结果：

```json
{"source":{"type":"thought","signature":"sig","summary":[{"type":"text","text":"hello","extra_part":1}]},"replayed":{"type":"thought","signature":"sig","summary":[{"type":"text","text":"hello"}]}}
{"source":{"type":"thought","signature":"sig"},"replayed":{"type":"thought","signature":"sig","summary":[]}}
```

原因：`parts` 只保留字符串，materialize 将 summary 全部重建成 `{type,text}`；即使原始对象没有 summary，也补 `summary: []`。`thought_summary` delta 同样只提取 text。签名仍相同，但不能据此声称完整 thought 深度相等；是否影响特定上游签名校验，本次未实测。

此外，终态 thought 才出现的 `provider_metadata: {x:1}` 会静默丢失。`verifySnapshot()` 只专门合并 signature，其余仅比较已存在字段，不保存终态新增字段。现有 SSE 测试仅覆盖 start 中的顶层额外字段，遗漏 summary 子字段和终态新增字段。

最小修正：单次 StepState 保留完整 thought/summary 部件；展示文本可单独读取，但回放不要从展示字符串重造。保留 optional 字段是否存在。终态合并此前缺失的回放字段，已发出的文本、参数和已有签名冲突仍明确失败；不引入跨请求状态或通用合并框架。

验收：start、delta、terminal 三个来源分别覆盖额外字段；signature-only 对象往返深度相等；正常完成和签名后 EOF/error 的回放对象均深度相等；JSON 与 SSE 对同一完整 thought 生成等价回放对象。附加字段是合成测试数据，不宣称 Google 已实际返回这些字段。

### R2 · P1：完整日志存在漏项和字节损失（已完成）

位置：`scripts/interactions-codex-live.ts` 的 `jsonResponse()`、`streamResponse()`、`createBridgeHandler()`。

代码证据：

- JSON 路径记录 `upstream_json` 后直接返回转换结果，没有 `downstream_json`；错误 JSON 也没有统一的下游记录。
- SSE 路径没有记录上游成功响应的 HTTP status/headers，也没有统一记录下游 status/headers。
- `upstreamDecoder` 使用非 fatal TextDecoder，非法 UTF-8 会替换为 U+FFFD；流结束时没有 flush decoder，EOF 中未完成的多字节序列会消失。完整合法 UTF-8 的跨 chunk 测试通过，不等于任意收到的字节可还原。
- 合法入站 JSON 只记录解析后的 payload，原始空白、重复键等不能还原。对协议语义通常无影响，但不符合逐字节原文承诺。

最小修正：在独立脚本记录实际收到的原始 body；SSE chunk 直接保存可逆的 base64 字节表示，可保留文本视图便于阅读。统一补齐下游 JSON 和双方响应 status/headers。记录 Fetch API 可见的 headers 即可，明确它不保留 HTTP 线上头大小写、原始顺序或传输编码。不做脱敏、摘要或截断。

验收：JSON 成功/转换错误/上游错误均有完整双向记录；非法 UTF-8、EOF 半个字符及正常跨 chunk 内容按字节还原相等；长错误和 signature 原值保留；并发日志可关联且完成时已落盘。只修改联调脚本及其测试，不扩散到业务路由。

### R3 · P2：文档结论和验收证据需收紧（已完成；上游 tools 继承语义仍标注未实测）

报告仍写“尚未提交”，实际 HEAD 已是 `49ea45d`。真实验证明确“不写记录文件”，signature 在报告中是缩略展示，因此它属于当时执行者的结果记录，不是本次可独立重放核验的原始 HTTP 证据。

最小修正：更新报告提交状态、将 R1/R2 标为未完成；补测“父引用 + 工具结果”和“父引用 + 新 instructions/省略 instructions”的契约。当前 continuation 测试只断言出站 body，没有证明上游如何继承配置。需要引用现有 v1 规范明确语义，必要时再用独立脚本做有限真实验证，并完整落盘，不靠模型回复一句话推断所有状态保留。

验收：每条结论注明离线、真实原始记录或未验证；完成报告引用可定位证据；非零 cache hit、真实断线恢复继续明确为未验证，不列为本次必须扩展的能力。

## 需要明确的边界，不应扩大成新架构

- 无签名 thought 的失败 output 会包含 summary-only reasoning；直接作为下一轮 input 回传时，`decodeThought(undefined)` 报 `Expected a string`，已直接复现。这符合“不伪造可回放状态”，但调用契约和报错应明确“无签名片段不可回放”。增加这一正反向契约测试；不要静默伪造签名或把 summary 塞进 prompt。
- 无上游 ID 时 response.id 返回空串，调用方必须选择完整历史续轮。现有测试只是拒绝空 parent，并没有自动执行 fallback。文档不应说转换器自动回退了。
- 工具结果 `messageText()` 合并 output 数组；对当前纯文本执行结果未证明语义故障，但“所有文本分块均保留”表述不成立。若按原计划逐块保留，局部将文本数组映射为多个 result text 部件并加一个用例即可。
- 工具编码扩张后名称长度未验证。不要引入 hash 注册表或新的应用白名单；先依据确实适用的 Interactions 名称规则及样本确认边界，再决定是否需要局部调整。
- `responseSequence` 重启归零。只保证同进程连续无 ID 响应不重复；若承诺跨重启 item 唯一，可由调用方显式提供现有 itemIdScope，不需要会话存储。
- Conversations、compaction、OpenAI 原生密文、phase、缓存控制、last_event_id 没有因此获得完整兼容；已声明的范围限制继续有效。

## 执行顺序与完成标准

1. R1：添加能复现完整 thought 损失的测试，再局部修正 SSE 累积与终态补全。
2. R2：补原始字节和漏记方向，增加针对缺口的联调脚本测试。
3. R3：补引用续轮契约证据、更新报告；同时明确无签名片段、空 response ID 和工具结果分块边界。
4. 运行 interactions 聚焦测试、typecheck、改动文件 ESLint；代码调整后运行全量测试及 build。验收以字段/字节对照为准。

不需要数据库、会话仓库、工具全局注册表、新 provider、WebSocket、业务路由改动或全量重写。当前看板 done 是执行记录，不应替代上述验收。

## 补充分析：客户端持有状态，转换器只负责传递（本节限定前述返工范围）

### 1. “保留对象”不是保存会话

这里的保留指转换前后信息可恢复，不指中转将对象持久化。完整历史模式中，客户端接收并保存 Responses output，下一轮再发回来；父引用模式中，上游保存历史，客户端保存引用 ID。中转既不拥有历史，也不应按 session ID 找回历史。

```text
本轮 Google thought/signature
  → 转为 Responses reasoning.encrypted_content
  → 客户端保存
下一轮客户端回传 reasoning.encrypted_content
  → 解包为 Google thought/signature
  → 随本轮请求发给 Google
```

`agdata1.` 是当前实现的可逆数据封装。数据随协议消息交给客户端，不是中转存储的查找键；恢复不应依赖处理上一轮的进程仍然存在。它也不是 OpenAI 原生加密内容。

| 内容 | 谁持有 | 转换器责任 |
|---|---|---|
| 完整历史、工具结果、reasoning 信封 | 客户端 | 从本轮入参读取并转换；将下一轮需要的数据交回客户端 |
| 已存储 interaction 历史 | Google 服务端 | 原样映射真实 parent ID；不查询或复制历史 |
| 当前请求的工具身份 Map | 当前调用者/调用栈 | 由本轮工具声明生成，供同次响应反向转换 |
| SSE 分段内容、签名、事件索引 | 当前流实例，结束释放 | 转换事件并生成合法终态，不延长为会话生命周期 |
| 日志 | 本地联调脚本 | 供人工复现，不参与下一轮请求恢复 |

### 2. 为什么 SSE 仍有单次响应内存

两个协议的字段和事件边界不完全相同。signature 可能晚于 summary 到达；Responses 终态需要包含完整 output。当前转换器因此暂存同次响应的片段，再产生完整 reasoning 项。这属于流式解析和输出组装，与 HTTP 请求体解析需要暂存字节类似。

因此 R1 的最小修复是调整现有 StepState 的数据表示：不要把已经收到的 thought 部件降成字符串后再重造。它不要求新建对象仓库、跨请求缓存或按 session 索引的 Map。终态补全也只能使用同一次上游响应收到的数据。

### 3. 精确保真目标，避免为假设扩建

此前反例证明了结构变化和字段丢失，**没有证明这些合成 extra 字段会影响 Google 实际推理或签名校验**。应分开评价：

- signature 原值、工具 call_id、真实 parent ID 是已知需要正确传递的协议信息。
- thought 额外字段保留是既有计划的可逆封装契约，JSON 路径已经实现，SSE 路径应保持一致；不需要为未知字段设计新的语义或注册机制。
- signature-only 被补成空 summary 是结构不相等，不能直接定性为已确认的上下文故障。修正它是让封装忠实于输入，不是增加会话管理。
- JSON 键顺序和格式空白不属于当前转换器承诺的协议语义；工具参数按 JSON 值等价验收。日志的原始字节完整性是另一项独立要求。

无签名 reasoning 也需要收紧先前结论：当前代码确实拒绝回传，但“没有签名就必定不可回放”不能仅凭代码注释认定为上游协议事实。应核对 v1 对无签名 thought 的规则，区分正常无签名 thought 与中断残片，再决定明确拒绝还是合法转换。不要为此添加客户端历史过滤器，也不要直接丢弃 reasoning。

### 4. 真正需要注意的是工具身份上下文的可获得性

当前 `ConversionOptions.tools` 足以支持本轮请求有工具声明的情况：请求转换产生 Map，同次响应转换使用 Map，结束即释放。这个方案本身不要求中转保存上一轮 Map。

但是，父引用续轮省略 tools 时，请求转换返回空 Map；如果上游随后返回工具调用，反向转换会失败。现有测试明确验证了这种失败。该测试证明的是边界被发现，不是该组合已经兼容。

纯转换器可以要求调用者显式传入必要身份信息，但不能假定未修改的 Codex 会额外发送自定义 Map。联调脚本当前只传 `converted.tools`，因此“上游能恢复历史”也不自动意味着“中转知道原始 namespace/custom 身份”。是否发生该情况，取决于客户端本轮声明和上游配置继承规则，应先核实；不能由此推导必须加 session store。

最小处理顺序：验证目标客户端每轮是否发送所需 tools；验证父引用时上游是否还会使用未重声明的工具；若缺信息且无法无歧义恢复，就明确这一输入组合的限制。不要偷偷保存上一轮状态来掩盖信息缺失。

### 5. 返工范围重新定界

转换器返工只包含 R1 的单次流数据保真，以及经规范确认的必要往返契约测试。R2 完整日志继续属于独立联调脚本，是用户要求的可观测性工作，不是 stateful 协议正确运行的依赖。R3 文档和引用续轮验证用于避免夸大兼容范围。

建议新增一条关键验收：第一轮转出 output 后销毁流实例；用全新实例和客户端回传的数据完成下一轮转换，除显式入参外不依赖上一轮变量。工具声明充分时也重新构造 Map。分别验证完整历史和 parent ID 两条路径，不用日志恢复状态。

最终判断：现有架构没有因为单次流对象组装而偏离纯转换器。需要修的是消息途中被删改的数据和不准确的兼容声明，不需要把会话责任搬到代理。本文前述“完整保留”均按这一责任边界理解。
