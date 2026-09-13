# CliRelay 与当前 copilot-api 实现对比审查

日期：2026-09-13。

## 结论

**对当前个人本地使用、Codex 同会话切换模型、纯协议转换器与鉴权代理解耦的需求，不建议整体替换为 CliRelay。** CliRelay 在多服务商接入、多账号调度、故障转移和管理运维方面功能更广；但本次检查的 Responses → Antigravity 路径并没有提供更完整的工具历史与状态保真，直接迁移可能丢失本项目刚补上的兼容能力。

建议保留 copilot-api 的转换器和现有入口，定点参考 CliRelay 的上游执行器与测试用例，同时修正当前接入层和流式输出中的具体缺陷。不能把这一结论理解为当前实现已完全正确。

## 范围与证据边界

本次为本地源码静态审查，没有启动 CliRelay、执行其测试、发起真实上游调用，也没有做吞吐、延迟或内存基准。下文的优势指可观察到的实现能力，不代表实测稳定性。

- CliRelay 基线：`1effc9b06c3b1d47aa4ab263b4ff1f73bfab43f2`。
- copilot-api HEAD：`d806c98c230a76417d78e42875989b20645e766a`；比较对象为当前磁盘内容，包含工作区修改。
- 重点读取：CliRelay README、部署文件、Antigravity executor/payload、Antigravity 与 Gemini 的 Responses translator；本项目 Antigravity Responses 接入、GenerateContent 请求/流式转换及 Interactions 的相关处理。
- 没有对 CliRelay 全部服务商或全部管理功能逐一审计。

## 架构与适用场景

| 维度 | CliRelay | 当前 copilot-api | 判断 |
|---|---|---|---|
| 产品目标 | CLIProxyAPI 增强版，多租户、配额、门户、渠道管理 | 当前工作流围绕 Copilot/Codex/Antigravity 及独立转换模块 | 个人使用更适合现有项目 |
| 部署 | 官方 Compose 含 PostgreSQL、Redis 和服务组件 | Bun 项目，当前转换路径无需会话数据库 | CliRelay 运维成本更高 |
| Antigravity 执行 | 多 base URL、容量错误重试、模型获取、流式与非流式路径 | 单次 daily 请求，当前 Responses 接口拒绝 stream:false | CliRelay 功能更齐全 |
| 协议拆分 | translator 与 executor 分层；部分 provider 修正在 translator 内 | generate-content/interactions 与 antigravity 分目录 | 两者都有分层，不能简单判定一方完全解耦 |
| Codex 工具历史 | 所查 Gemini Responses translator 未处理 tool_search 历史 | 显式保留搜索历史并合并搜索返回的工具 | 当前项目更贴合已遇到的问题 |
| 状态载体 | reasoning.encrypted_content 直接映射签名 | 自有前缀 carrier 保留模型 parts | 当前方案更有利于辨别来源，但仍需修复边界 |
| 运行性能 | Go 实现 | Bun/TypeScript 实现 | 没有基准，不能凭语言判优 |

CliRelay README 明确把多用户治理作为产品目标。PostgreSQL/Redis 用于日志、配置、配额和运行时治理，并不意味着协议转换本身需要数据库，也不应把这些组件移植进本项目转换器。

## 关键实现差异

### 1. Antigravity 接入：CliRelay 有值得借鉴的执行能力

源码：

- `reference/CliRelay/internal/runtime/executor/antigravity_executor.go:25`：daily Cloud Code 地址；执行路径包含 base URL 回退和容量错误处理。
- `reference/CliRelay/internal/runtime/executor/antigravity_request.go:193`：重试次数及容量错误判断。
- `reference/CliRelay/internal/runtime/executor/antigravity_nonstream.go`：非流式执行路径。
- `src/services/antigravity/create-responses.ts`：当前仅一次 fetch，成功后进行 SSE 转换，上游非成功响应直接返回。

这些是代理执行层能力，适合按实际故障需求逐项引入。不要把账号选择、重试或鉴权放入纯转换函数；流已向客户端输出后不能无条件重放请求，否则会产生重复输出。

### 2. CliRelay 的 Responses 适配不是新的无损协议

`antigravity_openai-responses_request.go` 先调用 Responses → Gemini，再调用 Gemini → Antigravity。响应适配器先取 envelope.response，再调用 Gemini → Responses。

因此它仍然受两端协议差异限制。它使用的是 GenerateContent 转换路径；本次检查的 executor/translator 中没有发现可替代本项目 Interactions 转换器的明确实现。不能因为支持 Antigravity 就认定支持 Interactions。

### 3. tool_search：迁移有具体回退风险

`reference/CliRelay/internal/translator/gemini/openai/responses/gemini_openai-responses_request.go` 的 input switch 处理 message、function_call、function_call_output、reasoning，所查路径没有 tool_search_call/tool_search_output 分支，switch 结束后继续处理下一项。工具声明转换仅接受 type=function。

由这条函数路径可判断：搜索历史不会获得显式转换，搜索结果中的工具声明也不会在此处自动合并。是否有其他入口预处理补救，仍需端到端测试确认，不能推断整个项目所有入口均失败。

本项目 `generate-content/convert.ts:584` 以及 `interactions/convert.ts:324` 显式把搜索记录作为 JSON 文本保留；工具收集逻辑合并 tool_search_output.tools。这是内容保留与后续工具可调用性的兼容处理，**不是将 Gemini 变成原生 OpenAI tool_search 执行器**，也不是工具搜索语义的完全一一对应。

### 4. state：CliRelay 不能证明更保真

CliRelay Gemini 请求转换：

- function_call 添加固定的 thoughtSignature sentinel（约第 273 行）。
- reasoning 把 summary.0.text 和 encrypted_content 直接写成 thought text/signature（约第 333 行）。
- 响应转换确实会把签名放回 reasoning.encrypted_content，且有相关测试。

这能够携带部分签名，但不等于保留原始模型 parts 的结构和签名附着位置。尤其混合模型历史中，不应把其他 provider 的 opaque encrypted_content 当成 Gemini 签名。仅看该函数，没有本项目自有 carrier 前缀那样的来源辨识。

本项目 `generate-content/convert.ts:635` 只解码自己的 carrier；其他 provider 的 reasoning 保留可读 summary。`stream.ts:418` 在存在签名时发出载有累计 parts 的 reasoning item。这更符合客户端持有、下轮回传的方案：代理只处理单次请求与单条流，不建立跨请求会话数据库。

但 carrier 是本项目约定，并非 OpenAI 原生加密状态。客户端是否完整保存、切换到其他上游时如何处理、恢复模型后是否仍可重放，必须靠真实 Codex 往返验证。两者都不能据静态代码宣称“完美保留所有 state”。

### 5. session ID：两种回退都有局限

CliRelay `antigravity_payload.go:61` 使用首条 user 的 parts.0.text 哈希生成 session ID，无文本时随机生成。相同开场文本的不同会话可能得到同一 ID；裁剪历史后第一条文本变化也可能改变 ID。它是启发式稳定标识，不是客户端真实会话身份。

当前 `create-responses.ts` 只读取 x-session-id，缺失时使用 Date.now()。因此在没有该 header 的调用中，跨请求稳定性没有保障。

建议先用真实 Codex 请求验证实际传来的会话字段，在代理层优先传递明确的客户端会话标识；有证据后再制定最小回退。不要把 prompt 文本哈希等同于缓存命中保证。缓存还取决于上游规则、前缀内容、模型和账号等条件。

## 当前实现应优先修正的问题

### P1：流式 item 顺序不一致

`src/services/generate-content/stream.ts:418` 附近，carrier reasoning 事件的 output_index 使用 completedItems.length，但最终通过 completedItems.unshift(reasoningItem) 放到 output[0]。

在已有 message/tool item 的场景下，同一个 reasoning 的事件索引和最终 response.output 位置不一致。这是直接可见的结构问题，可能影响客户端对增量和最终快照的合并。

修复建议：保持最终数组与已发事件的索引一致；优先考虑按已分配位置追加，而非为模仿习惯顺序重排。增加含 message、tool call、signature 的流式索引一致性测试。

### P1：固定调试文件影响请求行为

`src/services/antigravity/create-responses.ts` 在转换之后，对 input.length > 2 的请求同步写 turn2-req.json，且写入与转换共用 catch。

问题是并发请求互相覆盖、同步 I/O、写文件失败被误报为 conversion_error。按用户要求应保留完整内容，不需要脱敏；完整保留与固定文件覆盖是两回事。

修复建议：让显式调试记录使用独立文件和独立错误归类，放在代理/诊断层；转换函数继续只做转换。

### P1：会话标识验证不足

按上节验证实际 header → envelope.request.sessionId 的路径，补两轮相同会话、不同会话及历史裁剪测试。不要直接照搬 CliRelay 的首句哈希。

### P2：取消和错误生命周期

当前 SSE start 的 AbortError 分支不调用 controller.error/close，且 reader 生命周期没有统一 finally 释放。需验证上游中断时消费者是否稳定终止，再做最小修正；静态检查提示风险，不把未复现的挂起当成既成事实。

### P2：按需求补代理容错

参考 CliRelay 的容量错误分类与有界重试。优先覆盖尚未输出数据时的失败、取消中止和 Retry-After；无需照搬多租户调度、治理、数据库或全部 fallback 策略。

## 采用建议与验收

建议继续使用 copilot-api，并按以下顺序推进：

1. 修复 item 索引、调试写入及会话标识传递的确定问题。
2. 使用同一组固定输入对比两者转换结果：tool_search 历史、动态工具、并行工具结果、多个签名 parts、跨 provider reasoning、各档 thinking effort。
3. 对当前代理执行真实 Codex 两轮工具调用与 Gemini → GPT → Gemini 会话切换；检查 carrier、call_id、item.id、事件索引和最终 output，而不只看是否返回 200。
4. 仅在真实故障证明必要时借鉴 CliRelay executor 的重试与 endpoint 策略。
5. 若未来需求变成多用户门户、配额和多账号运营，再单独评估 CliRelay 部署。届时先证明 Copilot 的现有认证/路由与定制模型能迁移；当前所查 executor/translator 未找到明确的 Copilot 专用实现，不能当作直接替换。

本次只创建分析报告，不修改实现、不启动服务、不变更登录或配置。
