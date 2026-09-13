# Antigravity Interactions 入口定位与真实验收方案

日期：2026-09-13。本文基于 Phase 1 报告、当前代理实现、CLIProxyAPI 参考源码与现有实测报告。本文是后续执行方案，本次没有新增联网测试，也没有证明原生 Interactions endpoint 已可用。

## 1. 对 Phase 1 判断的复核

来源：[antigravity-phase-1-report.md](../../home-server/llm-gateway/docs/antigravity-phase-1-report.md)，重点为第 9.1 节（275–292 行）。

原文先纠正了“上游 RPC 全集只有六个、没有 interactions RPC”，指出参考仓库只能说明 CLIProxyAPI 实现了什么，不能说明上游有什么。**这一纠正成立，必须保留。** 第 4 节把 Interactions 列为未支持项，意味着 Phase 1 没有验证它，不意味着上游没有它。

第 9.1 节给出两组值得继续追踪的线索：

- 客户端包含 `internalAtomicAgenticChat`、`generateChat`、`streamGenerateChat`、`listAgents` 等内部 RPC 名称。
- 客户端包含 `learning/genai/api/interactions/proto/content.proto`，以及 `Turn`、`TextContent`、工具结果、思考等类型。

但“Interactions 是客户端的一等公民”和“CLIProxyAPI 的桥接是对齐缺口”不能直接推出存在一个可凭 Antigravity 登录态调用、兼容公开 Interactions 资源协议的接口。依赖库中的内容类型、实际执行的 RPC、远端暴露的资源 API，是三个需要分别取证的问题。为 agent 设计的公开 API 与内部 agent 服务可以共享类型，也可以使用不同传输与会话管理方式。

当前 [契约调查](ANTIGRAVITY_NATIVE_INTERACTIONS_CONTRACT_CN.md) 记录 `registerInteraction` 的请求涉及 NUX/UI 交互，不能仅凭名字把它作为模型对话入口。该文称 Phase 1 已断言它是“创建/续写接口”也不准确：Phase 1 第 9.1 节末尾明确把它的分工列为待摸底事项。

本次核对 `reference/CLIProxyAPI/internal/translator/antigravity/interactions/interactions_antigravity_request.go`：`ConvertInteractionsRequestToAntigravity` 把 `input` 转成 `request.contents`，初始化 Cloud Code envelope。它证明此参考版本实现了桥接，既不证明原生 Interactions 不存在，也不证明存在。

## 2. 对当前结果的评价

| 现有证据 | 可以下的结论 | 不能下的结论 |
| --- | --- | --- |
| 实现的代理登录、刷新及 Cloud Code JSON/SSE 生成成功 | 鉴权与这些路径的透传已实测 | Antigravity Interactions 已验收 |
| 两个 Cloud Code origin 的 `/v1beta/interactions` 返回 404 | 这些具体请求未访问到可用资源 | 所有版本、主机、内部 RPC 都不存在 Interactions |
| 公开 Interactions 对现有 OAuth token 返回 scope 403 | 该次凭据与该接口的 scope 不匹配 | 所有 Antigravity 凭据都不可能调用 Interactions |
| 客户端二进制存在或缺少特定字符串 | 该文件中观察到或未观察到字符串 | 运行时一定调用或绝不调用该协议 |
| 完整历史回传后续轮成功 | 客户端历史续轮成功 | 服务端 Interaction 引用续轮成功，或 cache hit |

因此，应撤回 [实测报告](ANTIGRAVITY_ENDPOINT_LIVE_TEST_REPORT_CN.md) 中“Cloud Code 上游只接受 envelope，没有可用 Interactions endpoint”的全称判断。准确状态是：**已验证 Cloud Code 生成路径；Antigravity 原生 Interactions 入口仍未定位并验证。**

原生 Interactions 目标不能被已有 7 项通过覆盖。旧测试结果继续有效，但不能据此关闭这个目标。后续也不应因为入口尚未找到，直接新增 Interactions → generateContent 转换来替代它。

## 3. 目标与实现边界

最终目标：定位 Antigravity 实际使用或实际可访问的 Interactions API，使用其登录态，经现有鉴权代理完成真实创建、流式、状态续轮，再验证现有双向转换器。

代理继续只负责登录、刷新与鉴权注入、必要的客户端身份头和 HTTP 透传；转换器仍是独立的双向纯转换。不加入数据库、历史缓存、应用字段白名单或新的 Cloud Code 桥接层。不考虑 WebSocket。

“一定要能测到”作为成功验收条件执行，不能作为接口已存在的前提。入口、权限或协议尚未取得时，任务保持未完成并给出具体缺失证据；不能把 404、403、mock 或 generateContent 成功登记成目标成功。

## 4. 执行顺序

### A0. 优先扫描 Antigravity Python SDK，形成可追踪的调用链

新增参考目录：[google/antigravity](../reference/antigravity-sdk-python/google/antigravity/)。先完成本项，再用 A 的客户端实测验证源码线索；源码可直接定位发送位置时，优先沿该位置取证。

本次初步扫描已确认：`conversation/conversation.py` 的 `Conversation` 在客户端累计 step history，并跟踪 turn 与 compaction；`connections/local/local_connection.py` 使用 `localharness_pb2`、子进程和 `websockets`，包含 `SessionContinuationMode` 的 RESUME/CREATE_OR_RESUME/CREATE_ONLY 映射；`models.py` 暴露 `base_url` 配置。这些是后续追踪入口，尚不能证明 SDK 直接调用远端 Interactions REST API。

| 扫描对象 | 分析内容与产出 |
| --- | --- |
| SDK 根目录版本、依赖声明、README 与 `CHANGELOG.md` | 记录来源与版本，确认 SDK、桌面客户端、随附 harness 的关系；识别下载或加载的外部组件，不能将 Python 目录视为全部网络实现 |
| `agent.py`、`conversation/conversation.py`、`connections/connection.py` | 追踪创建、send/receive、续轮与关闭，画出具体函数调用链；区分客户端历史管理和远端资源状态 |
| `connections/local/local_connection.py`、`local_connection_config.py` | 跟踪 harness 可执行文件定位、启动参数、配置序列化、连接目标及实际发送消息的位置；若网络调用在子进程中，继续追踪该组件，不停在 Python wrapper |
| `models.py`、连接配置与所引用的认证实现 | 确认 model、endpoint、base_url、project/location、API key/OAuth 的来源和优先级；核对是否支持 Antigravity 登录态，不能把 Gemini API key 调用当成该登录链路 |
| `proto/`、`proto_converters.py`、`struct_converter.py`、`event_processor.py` | 追踪 Interactions Content/Turn 类型由谁构造、序列化给谁、响应由谁解析；区分本地 harness 消息、远端资源协议及内部事件 |
| `types.py`、conversation 与 session continuation 相关实现 | 逐字段记录 session ID、历史、续轮、compaction、工具 call/result ID、thought/signature/opaque state 的所有者和传递链；判断 resume 是恢复本地文件、harness 会话还是远端 Interaction |
| `agent_test.py`、conversation 与 connection 相关测试 | 找到可复用的最小创建/续轮用例，标注 mock 与真实网络边界；提取测试输入，不把 mock 返回值作为远端接口证据 |

重点检查 SDK 是否提供可配置 endpoint 或诊断能力，使最小会话可经现有代理运行。`base_url` 存在只说明配置入口存在，必须追踪到实际出站 URL 才能认定能重定向。SDK 内部使用 WebSocket 也不能推出远端使用 WebSocket；先分清 Python → 本地 harness 与 harness → 上游。本项只分析已有传输，不新增 WebSocket 代理。

本项交付：将源码路径、函数/消息类型、配置流、实际网络边界与未知项写成 SDK 调用链分析，并把证实的候选入口交给 B/C。若 SDK 可以作为最小真实客户端，优先复用它执行创建与续轮；若它只暴露本地 harness，则用其启动配置和消息契约帮助 A 定位远端调用。扫描过程中只读参考源码，不把 SDK 的历史保存逻辑搬进鉴权代理。

### A. 从官方客户端实际调用定位入口

1. 记录安装版本、`language_server.exe` 的路径和 SHA-256；定位当前 Antigravity 日志目录、语言服务启动参数、扩展与资源文件。先确认当前版本，避免把旧二进制的扫描结果当成全部客户端行为。
2. 在官方 Antigravity 客户端用可用 Gemini Flash 模型新建一个最短文本会话，再续轮一次。使用独立测试会话和唯一 marker，把操作时间与客户端日志对应起来。
3. 优先使用客户端已有诊断日志或请求日志，取得出站 host、method、path/RPC、Content-Type、请求字段及响应结构。仅有主机连接、RPC 字符串或客户端本地 RPC 不算取得远端请求证据。
4. 日志不足时，追踪客户端实际的请求构造与发送位置。必要时在隔离测试启动中使用受信任的本地 TLS 调试记录器；只配置该测试实例，结束后恢复。不通过关闭证书校验绕过问题。若客户端不接受调试 CA，转向发送前日志或可定位的 transport 调用点，不能把 TLS 抓取失败解释为 API 不存在。
5. 区分 UI → 本地 language server 与 language server → 远端两段流量。前者出现 Interaction 名称不证明后者调用公开 Interactions。

产出：至少一条与真实生成对应的远端请求与完整响应，附客户端版本、时间与调用链来源。若实际会话只观察到 generateContent，继续检查 agent 相关实际调用和加载配置，不将这一条样本推广到全部能力。

### B. 沿类型引用补齐契约，不猜路径

围绕 `internalAtomicAgenticChat`、`generateChat`、`streamGenerateChat` 和 `learning/genai/api/interactions/proto/content.proto`，提取完整消息描述符与引用关系，找到消费 `Turn`/`Content` 的请求类型、所属 service/method、HTTP annotation 或 transport 构造代码。

候选登记必须包含：来源文件/偏移或调用点、请求/响应类型、远端 origin 的来源、传输方式、凭据来源。二进制中出现的 `aicode.googleapis.com` 等只能作为线索；没有路由证据不批量拼接路径请求。`registerInteraction` 仅在发现实际模型输入及结果字段后才重开调查。

重点核对：model/agent 选择方式、project 所在位置、create/continue 的方法、会话引用字段、内容与工具结构、流结束方式。版本采用实际客户端或对应规范证据，不能预设只能是 `v1beta`，也不能凭先前脚本预设 `v1`。

如果发现的是内部 agent RPC，先明确它是否承载 Interaction 资源语义、是否与现有转换器目标格式兼容。名字或共享 Content 类型不足以把它登记为公开兼容接口。如果只有 WebSocket 或不受现有 HTTP 代理支持的传输，记录真实约束，不擅自扩展本轮范围。

### C. 用真实契约重放，再通过现有代理复测

1. 以 A/B 得到的真实请求为样本，使用 Bun 测试客户端发送一个最小请求，保持实际 path/query、字段命名、请求头与内容类型。不要由公开 spec 猜一个内部 endpoint。
2. 先确认现有 Antigravity 登录凭据可调用。若官方客户端成功而测试凭据失败，逐项比较 OAuth client、实际 scope、project、UA 和其他身份头；只有发现差异证据后才修改登录配置或重新授权，不凭空增加 scope。
3. 再调用 `createAntigravityProxyServer`，配置已证实的 origin，把同一原生请求经现有代理重放。直接调用用于定位问题，经过真实代理才算代理验收。代理不组装 envelope、不改响应结构。
4. 两条链路均记录完整请求、响应头、原始响应字节和流事件序列。已有 `scripts/antigravity-proxy-live-test.ts` 的启动与记录方式可参考；Interactions 验收使用独立脚本，保留既有 Cloud Code 测试的含义。

### D. 验证状态，再接转换器

| 检查 | 真正的通过条件 |
| --- | --- |
| 创建 | 上游成功生成，响应结构与已定位契约一致；记录原生资源/会话 ID，不能由测试脚本生成一个 ID 代替 |
| 状态续轮 | 若契约支持父引用，第二轮仅发送新增输入和上游返回的引用，不附第一轮完整历史，正确回答第一轮随机 marker；只证明此契约下上下文连续 |
| 客户端状态回传 | 若契约要求客户端回传历史/opaque state，按原字段完整回传并验证；明确这是客户端状态模式，不能冒称服务端父引用续轮 |
| 流式 | 实际增量到达、结束事件正常；保留原生 ID、内容、工具、签名和最终 usage。非流式成功不代替流式 |
| 工具循环 | 一次最小函数调用 → 客户端执行固定函数 → 原生结果回传 → 最终回答；调用 ID 与协议要求的签名/opaque state 保持一致 |
| 缓存 | 上游明确的 cached token/缓存指标才可报告命中；没有指标就记未观测，session ID 相同和耗时降低不算证明 |
| 转换器组合 | 原生链路先通过，再运行 Responses → Interactions → 代理 → 上游 → 代理 → Interactions → Responses；复测文本、状态和工具循环，最后才用 Codex CLI 验收 |

状态字段以真实契约为准。不要为了满足测试硬塞 `previous_interaction_id`，也不要把内部 session 字段未经验证就映射成公开资源 ID。若接口并不兼容当前转换器，先记录具体字段差异，不能让代理暗中补转换。

## 5. 证据与完成条件

建议每次执行输出到独立本地目录，保留 `client-version.json`、`endpoint-contract.md`、每步的 `request.json`、`response.bin`、`meta.json` 和 `report.json`。JSON 索引不能取代原始字节，流式另记事件到达时间。按用户要求完整保留协议字段、ID、历史、签名、错误与实际鉴权记录，不脱敏、不截断；运行记录留在本地，文档引用目录，不把凭据硬编码进源码。

最终报告必须分别给出：入口定位、登录鉴权、原生创建、原生流式、状态续轮、工具循环、代理透传、转换器组合、Codex CLI 的状态与证据路径。缓存单独报告命中或未观测，不混入续轮结论。

只有真正取得 Antigravity Interactions 入口并成功完成上述核心请求，才可宣布该目标完成。发现内部 agent RPC但尚未证明 Interactions 契约，记为“发现候选，契约未确认”；缺权限记为“鉴权阻塞”；只有 Cloud Code 成功记为“基线通过，目标未完成”。方案无法保证一个未经证实的接口一定存在，但执行不得以替代接口成功或推测来结束这个目标。

## 6. 当前最小建议

先执行 A0，沿 Python SDK 定位 harness、配置和发送链路，再执行 A 取得一次真实生成与续轮的远端请求证据，并用 B 补齐对应协议。当前最缺的是入口和契约，不是更多转换代码。已有登录代理和双向转换器继续保留，等原生请求成功后再组合验证。
