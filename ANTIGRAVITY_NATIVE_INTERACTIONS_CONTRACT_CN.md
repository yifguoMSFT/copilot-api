# Antigravity 原生 Interactions 契约调查（本地证据）

日期：2026-09-12。基线：`82e68f3`。对应任务：`confirm_the_native_interactions_contract_from_local_evidence`。

本文只使用两类证据：本机已安装的 Antigravity 客户端二进制，以及仓库内的只读参考源码与已抓取公开规范。**未发起任何网络请求，未读取任何凭据。** 凡本文未直接观察到的，一律标为“未验证”，不按推理当成事实。

## 0. 结论摘要

三条结论都有直接证据：

1. **Antigravity 客户端里没有公开 Interactions 的 create/continue 服务。** 二进制中不存在 `InteractionsService`、`CreateInteraction`、`createInteraction`、`interactions:create`、`deleteInteraction`、`ListInteractions` 任一符号，也不存在 `/v1beta/interactions` 或 `/v1/interactions` 路径字符串。
2. **`v1internal:registerInteraction` 不是创建对话的接口。** 它属于 `JetskiService`，请求字段是 `interaction`，其 oneof 分支是 `nux_interaction`（`nux_id` + `interaction_type`），响应字段是 `message`。这是产品/UI 交互登记，不是模型会话。
3. **公开 Interactions 的会话字段在客户端里完全不存在。** `previous_interaction_id`、`interaction_id`、`interactionId`、`previousInteractionId` 在 156 MB 二进制中的出现次数均为 **0**。

由此，Phase 1 报告第 9.1 节“`registerInteraction` 是创建/续写 Interaction 的接口”这一推断**不成立**，应当作废。客户端里确实存在 Interactions 的**内容词汇表**（`Turn`、`TextContent`、`ThoughtSummaryContent`、`ToolCallContent` 等），但它被用在 Live/bidi 生成路径上，而不是一个 Interactions 资源服务。

对计划的直接影响见第 5 节：代理的目标上游**大概率不是 Cloud Code**，而是 `https://generativelanguage.googleapis.com`。这是候选，不是已验证事实。

## 1. 调查方法

| 项 | 值 |
| --- | --- |
| 客户端二进制 | `C:\Users\Jeff\AppData\Local\Programs\antigravity\resources\bin\language_server.exe`，156,513,792 字节 |
| 提取方式 | 对二进制做只读字符串/符号扫描：`rg -a -o --no-line-number <pattern> <bin>`，必要时按字节偏移窗口导出可打印串 |
| 参考源码 | `reference/CLIProxyAPI/internal/auth/antigravity/constants.go`、`internal/runtime/executor/antigravity_executor.go`、`internal/translator/antigravity/interactions/*` |
| 公开规范 | `antigravity-interactions-api-docs/google-ai-interactions-api.md`、`antigravity-interactions-api-docs/gemini-enterprise-interactions-api.md` |

符号名与描述符路径是**本地观察**。它们证明客户端包含哪些类型和 RPC，不能证明远端一定以同名 HTTP 接口提供服务——这一点正是第 5 节待联网确认的内容。

## 2. 问题 1：候选 origin、method、path、Content-Type、必要请求头

**本地观察：客户端没有提交流向的 Interactions REST 路径。**

- 二进制中的 `v1internal:` RPC 名共 **60 个**（按去重后计数），完整清单中的关键项包括：`generateContent`、`streamGenerateContent`、`countTokens`、`fetchAvailableModels`、`loadCodeAssist`、`onboardUser`、`registerInteraction`、`listAgents`、`internalAtomicAgenticChat`、`generateChat`、`streamGenerateChat`、`retrieveUserQuota`、`retrieveUserQuotaSummary`、`tabChat`。
- 搜索 `v1beta/interactions`、`/v1/interactions`、`InteractionsService`、`CreateInteraction` 均为 **0 命中**。
- 二进制中与 HTTP 相关的 Google 主机包括 `https://cloudcode-pa.googleapis.com`、`https://daily-cloudcode-pa.googleapis.com`、`https://generativelanguage.googleapis.com`、`https://aiplatform.googleapis.com`、`https://aicode.googleapis.com`、`https://alkalimakersuiteapplets.pa.googleapis.com`。其中 `generativelanguage.googleapis.com` 存在，但没有跟随 Interactions 路径。

**公开规范给出的真实协议（已抓取的文档，非本机客户端证据）：**

| 操作 | Method 与 URL |
| --- | --- |
| 创建 | `POST https://generativelanguage.googleapis.com/v1beta/interactions` |
| 检索 | `GET https://generativelanguage.googleapis.com/v1beta/interactions/{id}` |
| 取消 | `POST https://generativelanguage.googleapis.com/v1beta/interactions/{id}/cancel` |
| 企业版创建 | `POST https://aiplatform.googleapis.com/v1beta1/projects/{project}/locations/global/interactions` |

注意版本是 **`v1beta`**，不是 `v1`。这与仓库里 `scripts/interactions-codex-live.ts` 之外的假设不同，需要在实作与联调时按 `v1beta` 处理。

**候选结论（推断，非事实）：** 如果目标是“用 Antigravity 登录态直接使用公开 Interactions”，那么代理的固定上游更可能是 `https://generativelanguage.googleapis.com`，路径由调用方按 `v1beta/interactions...` 原样给出。Cloud Code 的 `v1internal:` 命名空间里没有对应的创建接口。

请求头只能给出方向性判断：`Content-Type: application/json` 与 `Authorization: Bearer <access_token>` 是公开 Interactions 的常规要求；是否存在额外的 key 头、`x-goog-user-project`、UA 要求，本地无法判定。

## 3. 问题 2：`registerInteraction` 实际做什么

**观察到的类型与调用链：**

```
google.internal.cloud.code.v1internal.JetskiService
  JetskiService_RegisterInteraction_Handler
  RegisterInteractionRequest   -> field: interaction   (getter GetInteraction)
  RegisterInteractionResponse  -> field: message       (getter GetMessage)
  Interaction                  -> oneof: nux_interaction (getter GetNuxInteraction), interaction_data
  NUXInteraction               -> fields: nux_id (GetNuxId), interaction_type (GetInteractionType)
```

描述符文件路径为 `google/internal/cloud/code/v1internal/jetski_service.proto`。同服务下的其他方法包括 `GetHealth`、`FetchUserInfo`、`TabChat`、`SetUserSettings`、`CheckUrlDenylist`、`RecordTrajectoryAnalytics`、`ListCascadeNuxes`、`UploadPerformanceProfile` 等，整体是客户端侧的产品/遥测/设置接口集合，而不是模型对话接口。

`NUX` 指 new-user-experience。“登记一次 NUX 交互”与“创建一个模型 Interaction 资源”在字段层面没有任何共同点：前者没有 model、没有 input/turn、没有 tools、没有 id、没有 previous 引用。

**判定：** `registerInteraction` 与公开 Interactions 的创建/续写**无关**。任何把它当作对话入口的实现都建立在错误前提上。

## 4. 问题 3：凭据、scope 与 project 归属

**已知（来自 Phase 1 实测与参考源码，非本次新增证据）：**

- 登录使用 Google 授权码流程，回调 `http://localhost:51121/oauth-callback`；凭据文件在 `~/.cli-proxy-api/antigravity-<email>.json`，字段含 `access_token`、`refresh_token`、`expired`、`project_id`。
- 参考实现的 scopes 为 `cloud-platform`、`userinfo.email`、`userinfo.profile`、`cclog`、`experimentsandconfigs`。
- 在 Cloud Code 生成路径上，`project` 位于**请求 body 的 envelope 顶层**（与 `model`、`requestId`、`request.sessionId` 同级），而不是 header。
- 同一凭据已实测可完成 `loadCodeAssist`、`fetchAvailableModels`、`generateContent`、`streamGenerateContent?alt=sse`。

**新增观察：** 二进制中还出现 `https://www.googleapis.com/auth/aicode` 与主机 `https://aicode.googleapis.com`，说明客户端另有 aicode 相关 scope 与主机；这属于观察到的存在，不构成任何接口可用性结论。

**未验证：** 该 access token 是否被 `generativelanguage.googleapis.com/v1beta/interactions` 接受。`cloud-platform` 是 Google Cloud scope，而 AI Studio 的 Generative Language API 通常使用 API key 或 OAuth；两者是否互通必须由一次真实调用回答，本地无法判定。若走企业版路径，`project` 出现在 **URL path** 中（`/projects/{project}/locations/global/interactions`），与 Cloud Code 的 body 位置不同。

## 5. 问题 4：二进制字段 vs 公开规范的逐项对照

**存在于二进制**（`learning/genai/api/interactions/proto/content.proto`、`in_context_file_citation.proto`）：

| 类别 | 观察到的基本符号 |
| --- | --- |
| 容器 | `Content`、`ContentList`、`Turn`、`TurnList` |
| 文本与思考 | `TextContent`（含 `Annotation`）、`ThoughtContent`、`ThoughtSummaryContent` |
| 工具 | `ToolCallContent`、`ToolResultContent`、`FunctionCallContent`、`FunctionResultContent`、`FunctionResultSubcontent`、`FunctionResultSubcontentList`、`McpServerToolCallContent`、`McpServerToolResultContent` |
| 内置工具 | `GoogleSearchCallContent`、`GoogleSearchResultContent`、`GoogleMapsCallContent`、`GoogleMapsResultContent`、`UrlContextCallContent`、`UrlContextResultContent`、`CodeExecutionCallContent`、`CodeExecutionResultContent`、`FileSearchCallContent`、`FileSearchResultContent` |
| 引用与元数据 | `Citation`、`UrlCitation`、`FileCitation`、`PlaceCitation`、`InternalMetadata`、`ReferenceMetadata`、`ReviewSnippet`、`ContentIngestionOptions` |
| 多模态 | `AudioContent`、`ImageContent`、`VideoContent`、`DocumentContent`（各带 MIME 枚举） |

`Turn` 的字段为 `role`、`content`；其中 `content` 是 oneof，分支为 `content_string` 与 `content_list`。

**关键差异：**

1. **有内容、无资源。** 客户端里有 `Turn`/`Content` 的全部词汇，却没有 `Interaction` 资源类型、没有 `id`、没有 `previous_interaction_id`、没有 create/retrieve/cancel 方法。公开规范的核心是“一个可创建、可续写、可检索的 Interaction 资源”，客户端里没有这一层。
2. **`Turn` 被用在别处。** 唯一能观察到 `Turn` 作为字段被消费的位置是 `v1main_prediction_service_go_proto.(*BidiGenerateContentClientContent).GetTurns`，即双向流式生成路径，不是 REST Interactions 服务。
3. **字段命名不可推断。** 公开规范用 snake_case（`previous_interaction_id`）；客户端里该名字不存在。反向转换器目前正是依赖 `previous_interaction_id` 构造父引用（`src/services/interactions/convert.ts:527`），这在 Antigravity 侧没有对应物。
4. **版本不一致。** 公开文档为 `v1beta`（AI Studio）与 `v1beta1`（Vertex），仓库里已有的联调脚本按 `v1/interactions` 组织。若后续要用 Antigravity 登录态，需按 `v1beta` 核对。

## 6. 问题 5：必须联网才能确认的清单

以下项目本地证据无法回答，逐条对应一次最小真实调用：

1. Antigravity 的 OAuth access token 能否用于 `https://generativelanguage.googleapis.com`（scope 是否足够、是否被要求 API key）。
2. `POST /v1beta/interactions` 在该 token 下的真实状态码与响应体：200 成功、401/403 鉴权失败、404 路径不存在，还是 400 参数形状不符。
3. 流式是否存在、以什么形式（SSE、`?alt=sse`、还是同一路径下的流式变体）。
4. `project` 的实际归属：body 顶层、header，还是 URL path（企业版形状）。
5. 创建后返回的 Interaction `id` 是否可用于下一轮 `previous_interaction_id`，以及服务端是否据此保持上下文。
6. `tools`、`function_call`/`function_result`、`thought` 与签名在真实响应中的字段名是否与已抓取公开规范一致。
7. 缓存指标：同一稳定上下文重复请求时，响应中是否出现可观测的 cached token 计数。仅凭 ID 相同不能判定 cache hit。
8. `registerInteraction` 与 `v1internal:*` 命名空间在远端是否可达、是否只是本地/内网接口。

在这些项目有结果之前，[[ANTIGRAVITY_NATIVE_INTERACTIONS_PROXY_PLAN_CN.md]] 与 [[ANTIGRAVITY_NATIVE_INTERACTIONS_PROXY_REPORT_CN.md]] 都必须把“Antigravity 原生 Interactions 可用”列为未验证。

## 7. 对计划的修正建议

1. 把“Antigravity 背后的 Interactions API”改写为“**Antigravity 登录态 + 公开 Interactions API**”。代理的固定上游应配置为 `https://generativelanguage.googleapis.com`，而不是 Cloud Code。
2. 删除以 `v1internal:registerInteraction` 为线索的探测方向，它的语义已经确定，与对话无关。
3. 保留代理“只注入鉴权、正文原样转发”的设计。这个设计在上述修正后依然成立，而且比原设想更简单：不需要 envelope 组装，也不需要理解 Interactions 语义。
4. 路径版本参数由调用方给出；代理不补、不改 `v1beta` 或 `alt=sse`。
5. 转换器继续按公开规范工作，不需要为 Antigravity 做特殊分支；需要实测的只是鉴权与连通性。

## 8. 实测补充（2026-09-13，已获授权的有界调用）

第 6 节的清单是“只有联网才能回答”的问题。本次按批复确认书执行到第一条外部端点探测，并在 403 处按停止条件终止；未重试、未换端点、未改用 `generateContent`。

| 第 6 节条目 | 实测结果 |
| --- | --- |
| 1. Antigravity access token 能否用于 `generativelanguage.googleapis.com` | **不能（scope 不足）。** 403 `ACCESS_TOKEN_SCOPE_INSUFFICIENT`；响应头 `www-authenticate` 要求 `https://www.googleapis.com/auth/generative-language` 及其 tuning / retriever 变体 |
| 2. `POST /v1beta/interactions` 的真实状态码与响应体 | **403。** 错误 `details[0].metadata.method` 为 `google.learning.gemini.api.interactions.v1beta.InteractionsService.CreateInteractionHttp`，`service` 为 `generativelanguage.googleapis.com`，因此该方法真实存在，失败原因是鉴权而不是路径 |
| 3. 流式形式 | 未推进（按停止条件中止） |
| 4. `project` 的实际归属 | 未推进（未获得任何成功响应） |
| 5. `id` 与 `previous_interaction_id` 语义 | 未推进 |
| 6. 真实字段名是否与公开规范一致 | 未推进 |
| 7. cache 计数 | 未推进 |
| 8. `v1internal:*` 远端可达性 | 未推进 |
| 额外确认 | 第 4 节问题的口径修正：既有凭据的刷新在真实 Google 端可用；`POST https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist` 返回 200，`currentTier.id = free-tier` |

抓取文件在 Git 之外：`%TEMP%\antigravity-live-capture\01-loadcodeassist.*`、`02-interactions-create.*`（`authorization` 已替换为 `Bearer <redacted>`）。完整结论见 [[ANTIGRAVITY_NATIVE_INTERACTIONS_PROXY_REPORT_CN.md]] 第 4.1 与第 6 节。
