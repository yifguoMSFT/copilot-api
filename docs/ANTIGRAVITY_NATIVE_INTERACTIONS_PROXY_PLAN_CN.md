# Antigravity 原生 Interactions 鉴权代理与转换器接入计划

日期：2026-09-12。状态：方案，尚未实现或进行本轮联网验证。

## 1. 目标与结论

增加一个独立的 Antigravity HTTP 代理，负责 OAuth 登录、令牌保存与刷新、鉴权注入和原始 HTTP 转发。代理直接暴露上游真实的 Interactions 接口，不理解 Responses，不转换请求或响应。现有 Responses ↔ Interactions 转换器继续作为独立纯函数模块使用，由调用方完成 HTTP 调用与两端连接。

**首个前置工作是确认 Antigravity 原生 Interactions 的真实传输契约。** 当前参考材料证明了登录与 Cloud Code generateContent 可用，也提供了 Interactions 相关二进制线索，但尚未证明其具有与公开 Gemini Interactions 相同的 HTTP 接口。不能直接把公开 `/v1/interactions` 拼到 Cloud Code 域名后当作已知端点。

本计划不把 generateContent 包装成 Interactions，也不借此引入第二套协议转换。若原生契约尚无法确认，登录与透明转发可独立完成并用 mock 验收，真实接入明确保留为未完成。

## 2. 依据与证据边界

参考材料：

- [Phase 1 报告](../home-server/llm-gateway/docs/antigravity-phase-1-report.md)：第 7.5、8、9.1 节。
- [Phase 1.1 原生透传 POC](../home-server/llm-gateway/docs/antigravity-phase-1.1-raw-proxy-poc.md)：透明代理的完整设计与验收矩阵；该文件状态为“待实现”，只能作为实现参考。
- `reference/CLIProxyAPI/sdk/auth/antigravity.go`：授权码流程、随机 state 校验、默认 localhost:51121/oauth-callback、凭据构造。
- `reference/CLIProxyAPI/internal/auth/antigravity/constants.go`、`auth.go`：OAuth 端点与 scopes、token exchange、loadCodeAssist 与必要的 onboardUser。
- `reference/CLIProxyAPI/internal/runtime/executor/antigravity_executor_auth.go`：access token 有效期判断、refresh token 更新、并发刷新合并。
- `src/services/interactions/convert.ts`、`stream.ts`：现有转换器接口。
- [无状态契约核查](INTERACTIONS_STATELESS_CONTRACT_NOTES_CN.md)、[转换保真返工报告](INTERACTIONS_CONVERSION_FIDELITY_REWORK_REPORT_CN.md)：既有能力和已知限制。

| 事实 | 可以推出的结论 | 不能推出的结论 |
| --- | --- | --- |
| Phase 1 实测 Bearer + Cloud Code JSON/SSE 生成成功 | 登录凭据与该生成链路可用 | 原生 Interactions 已经可用 |
| 报告记录 language_server.exe 存在 registerInteraction 与 Interactions protobuf 类型 | 值得继续调查真实方法与类型 | registerInteraction 就是创建/续写公开 Interaction 的接口 |
| CLIProxyAPI 有鉴权、生成执行器及 Interactions 翻译代码 | 登录实现可参考 | 其翻译器证明 Antigravity 原生 Interactions 透传成立 |
| 现有转换器面向已抓取的公开 Interactions 形状 | 可以复用已实现的纯转换函数 | 内部 protobuf 类型必然与该 JSON/SSE 契约相同 |

报告头部和部分旧段落仍写“未执行真实测试”，后续第 7.5 节已给出成功记录；以具体记录为依据。第 9.1 节“CLIProxyAPI 桥接属于对齐缺口”的判断不能替代原生接口证据。本计划也不继承报告中的脱敏、计费或 Gateway adaptor 建议。

### 已落地能力与可复用设计的准确范围

`home-server/llm-gateway/antigravity-feasibility` 是已经实现并验证过的独立 Go 探测程序。它读取仓库外 JSON 中的 `access_token`、`project_id` 与可选 RFC3339 `expired`，拒绝缺失或过期凭据，在 daily Cloud Code origin 上注入 Bearer、Content-Type、固定 Antigravity UA，并实测完成 JSON 与 SSE 的 `generateContent` 请求。它会拒绝 redirect、保留 TLS 校验、传播取消与 deadline，且不重试、换端点、刷新凭据或改写既有文件。其 mock 测试还覆盖了鉴权失败不出网、401/403/429 仅请求一次和 SSE 增量交付。

网页登录也已有真实证据，但不是该 Go 模块实现：Phase 1 使用 CLIProxyAPI 的 `--antigravity-login` 完成浏览器授权码流程，经 loopback `localhost:51121/oauth-callback` 获取 token、查询 project，并将凭据写入 `~/.cli-proxy-api/antigravity-<email>.json`。该文件字段与本计划所需凭据兼容：`access_token`、`refresh_token`、`expired`、`project_id`，并含 email、type、expires_in、timestamp、disabled 等元数据。

Phase 1.1 文档定义了“单一固定 origin、任意 HTTP path/query、原始 body/SSE 逐字节透传、覆盖 Authorization、禁用自动解压与重定向跟随”的 raw proxy，并已列出 mock 与真实验收方法；但 `cmd/rawproxy/` 在该工作区不存在，文档明确为待实现。因此本计划采用其传输契约和测试矩阵，不把它称为已经可运行的代理。

## 3. 最小结构与依赖方向

```text
Codex CLI
  │ Responses HTTP
  ▼
调用方 / 薄 HTTP 接入程序
  ├─ 调用 Responses → Interactions 纯函数
  ├─ HTTP 请求独立代理
  └─ 调用 Interactions JSON/SSE → Responses 转换器
           │ 原生 Interactions HTTP
           ▼
Antigravity 鉴权代理
  ├─ 独立 login 命令与凭据刷新
  └─ 原始 body / 原始响应流转发
           │ Bearer + 原生路径 / query / body
           ▼
Antigravity 上游
```

代理不 import 转换器；转换器不 import 代理、凭据或 HTTP 客户端。两者可分别测试、启动与替换。调用方仅通过代理 base URL 和原生 HTTP 契约连接两者；转换器仍是库，无需为它单独部署服务。

原生 Interactions 客户端可以直接使用代理，不经过 Responses 接入程序。现有公开 Gemini 接入仍可使用同一转换器，不依赖 Antigravity 登录。

建议仅新增 `scripts/antigravity-proxy.ts`、`src/services/antigravity/auth.ts`、`src/services/antigravity/proxy.ts` 及对应测试。入口提供 login/serve 两种操作即可，不引入 provider 框架、多账号调度、数据库、模型注册或管理 UI。本轮方案不修改既有路由、配置和实现；后续联调优先使用独立入口。

实现时优先复用两项已验证的外部事实：CLIProxyAPI 登录生成的现有凭据文件可作为 `--credential-file` 输入，Phase 1 已确认该文件中的 access token 与 project 可用于生成。不得复用 feasibility probe 的 envelope 组装、响应解包或 SSE 解析代码，因为它们属于 Cloud Code generateContent 的业务协议，与这里的原生 Interactions 透明代理无关。

## 4. 第一步：确认原生接口

从报告指出的官方客户端描述符与实际请求证据入手，确认以下最少信息，写成一份可复现的契约记录：

1. 上游 origin、HTTP method、完整 path/query、Content-Type、必要请求头；是否为 JSON/SSE，还是 protobuf/gRPC。
2. registerInteraction 的实际用途，以及真正创建、续写 Interaction 的方法；不要根据方法名推断语义。
3. 登录凭据是否适用、scopes 是否足够、project 位于 header/path/body 哪一处。
4. 最小文本请求、完整响应及流式样本；模型 ID 从该接口证据确认，不能直接套用 generateContent 的 alias。
5. 父引用、完整历史、签名与工具结果的原生字段，是否与现有转换器匹配。

验收：同一原生请求在直连和仅注入鉴权的代理上都能完成。取得至少一个非流式和一个增量响应样本；不把 200 空响应或登记成功当成生成成功。

若契约等同于公开 Interactions，直接复用现有转换器。若存在外层 envelope 或字段差异，先记录精确差异，转换只能在转换器侧显式实现并测试；代理仍不拆包、补字段或重写正文。若上游只有不同协议的证据，先报告缺口，不能悄悄改走 generateContent。

## 5. 登录与凭据

采用已经实测可用的 CLIProxyAPI Google 授权码登录方式：启动 loopback 回调、生成并验证 state、打开授权 URL、交换 token，结束后关闭回调服务。授权端点为 `https://accounts.google.com/o/oauth2/v2/auth`，token 端点为 `https://oauth2.googleapis.com/token`。客户端标识、scope、redirect URI 按参考源码核对，文档不重复抄写常量。

一个账号、一个正式凭据 JSON 即可。保存 `access_token`、`refresh_token`、`expired`，以及上游实际需要的 `project_id`；兼容读取既有 CLIProxyAPI 凭据字段，不再加 key 路径套层。可使用 `~/.cli-proxy-api/antigravity-<email>.json` 作为显式输入，也可让独立 login 写入用户指定的一个文件。

project 发现属于登录控制流程：只有原生接口确需 project 时才使用 loadCodeAssist/必要的 onboardUser。若 project 必须写在业务 body，由调用方显式提供给转换器/请求构造过程，代理不得为此解析、修改 body。代理的凭据文件不成为转换器的输入依赖。

网页登录与读取既有凭据可以先独立验收。随后实现请求前刷新：有效期采用参考实现的安全窗口；并发请求共享一次在途刷新，成功后原子更新同一凭据文件。刷新响应不带新 refresh token 时保留旧值。刷新失败直接返回明确本地错误；收到上游 401/403/429 时保留原始响应，不自动重放生成请求、不切账号或端点。Phase 1 探测程序刻意不刷新 token，因此不能把它当成刷新实现的证据。

这是认证状态，不是对话状态。代理不保存历史、Interaction 对象、工具身份表或 session 映射。

## 6. 透明转发契约

- 代理使用一个明确配置的上游 origin，本地监听 loopback。路径和 query 按原生接口原样转发，不虚构公开 API 路由，也不接受请求任意指定目标域名。
- 原始请求 body 直接流式送出，不 JSON parse/stringify，不校验模型、tools、schema、签名、内容类型或应用字段。
- 注入 `Authorization: Bearer <access_token>`，替换客户端用于本地入口的鉴权头。只有实证必需的上游 UA/路由头才显式设置。
- 按 HTTP 要求处理 Host、hop-by-hop headers 和消息 framing；其余端到端头保留，包括请求 ID、session/cache 相关头。使用不会隐式解压后保留旧 Content-Encoding 的转发方式。
- status、端到端 headers、错误 body、JSON/SSE 内容原样交付，不剥离 usage、不做脱敏或截断、不合成结束事件。
- SSE 作为字节流处理，不按事件解析或合并。网络 chunk 边界允许变化，但拼接后的实体字节必须相同，且首段不能等待整个上游响应结束。
- 客户端取消传播到上游；流式中断保留中断事实，不能转成正常结束。网络失败在响应开始前返回本地网关错误，开始后关闭流，不追加伪造业务帧。
- 不跟随上游重定向到其他 origin；将重定向响应交还调用方。不包含 WebSocket 支持。

本地验证记录完整保存请求/响应 body、headers、错误和时序，不采用脱敏、摘要替代原文或固定长度截断。二进制以 base64 完整保存。记录保留在本机文件，报告引用文件路径，不要求复制凭据到提交的 Markdown。记录功能放在测试调用方，代理本体不新增录制系统。

## 7. 转换器接入与状态边界

调用方使用现有接口：

1. `convertResponsesRequestToInteractions(request, options)` 产出 `body`、`metadata` 和当前请求的 `tools` 映射。
2. 将原生请求发送到代理，模型与原生路径由已验证配置提供。
3. 非流式成功响应调用 `convertInteractionsResponseToResponses`；流式成功响应使用 `createInteractionsEventStream`。当前请求的工具映射显式传入转换选项。
4. 原生上游错误如何呈现为 Responses 由调用方/转换器边界决定；鉴权代理只返回原始错误。

`metadata` 是调用上下文，不等于已经传到上游。当前代码把 `prompt_cache_key` 和 `client_metadata` 留在返回的 metadata 中，不能据此宣称 Antigravity cache 命中。只有原生契约确认相应字段/头后才显式映射；没有对应项时记录限制，不猜造 sessionId。

| 状态 | 负责方 | 代理行为 |
| --- | --- | --- |
| 完整历史与客户端回传的 thought 信封 | 客户端；转换器完成编码/还原 | 原样转发 |
| previous_response_id ↔ previous_interaction_id | 转换器；上游保存父引用对应历史 | 不生成、不缓存、不替换 ID |
| 工具调用 ID、签名、顺序 | 客户端与转换器 | 不读取、不修复 |
| SSE 分段拼装状态 | 转换器当前响应实例 | 仅传输，不跨请求保留 |
| OAuth token/到期时间/project | 登录与鉴权模块 | 仅保存账号认证上下文 |

保持现有明确限制：无签名 reasoning 回放、父引用续轮省略工具声明时的身份恢复不能假称已解决；独立代理不会解决这些转换问题。任何必要返工留在转换器及其测试中。稳定 session ID 也不保证 cache hit，必须观察上游缓存计数。

## 8. 实现顺序与测试验收

| 顺序 | 工作 | 必要验收 |
| --- | --- | --- |
| A | 确认原生契约 | 保存真实路径、鉴权要求、JSON/SSE 样本及未确认项；生成与登记行为区分清楚 |
| B | 独立登录/刷新模块 | 先用 CLIProxyAPI 登录产出的现有凭据做读取验收；再 mock 验证 state 错误、拒绝授权、超时、token exchange、刷新失败、旧 refresh token 保留、并发刷新合并、凭据原子写入 |
| C | 原始 HTTP 代理 | 采用 Phase 1.1 的 raw proxy 契约：mock 上游验证 body 字节相等、未知字段/签名不变、path/query 不变、鉴权替换、状态及错误原样、重定向不跟随 |
| D | 流式传输测试 | 跨 chunk UTF-8/SSE、注释/未知事件/尾帧、取消与断流；证明增量交付，确认不补结束事件；压缩正文与 headers 一致 |
| E | 独立接线测试 | 既有转换器 + mock 原生上游 + 新代理，覆盖文本 JSON/SSE、工具往返、带签名历史、父引用；代理单测完全不加载转换器 |
| F | 真实接入 | 先原生直连与代理对照，再使用 Codex CLI；保存完整本地记录，分别报告传输与转换结果 |

真实验证按最少调用递进：短文本 → 两轮完整历史 → 一次工具调用及结果回传 → 原生支持时的父引用续轮 → Codex CLI 单轮及续轮。每一步先查看原始证据，失败不反复盲重试。模型采用 A 阶段验证过的 ID；Phase 1 的 `gemini-3.8-flash-medium` 仅是候选。

cache 测试使用原生允许的稳定上下文重复请求并观察缓存 usage；零值/缺字段如实记录，不能仅以 ID 相同判定成功。真实断流恢复、工具声明继承等若没有证据，报告中仍列为未验证。

本仓库新增 TypeScript 使用 Bun 测试，完成聚焦测试、`bun run typecheck`、`bun run build` 和定向 lint；修改转换器时运行现有转换回归测试。mock 通过与真实上游通过分别记录，不相互替代。

## 9. 完成条件

原生客户端可单独使用鉴权代理；Codex 调用方通过既有转换器接入同一代理；两者没有代码依赖、会话存储或隐式状态共享。代理对正文的唯一行为是传输，登录和刷新具备独立测试。原生契约、端到端样本和明确限制写入报告后，才能宣布真实接入完成。
