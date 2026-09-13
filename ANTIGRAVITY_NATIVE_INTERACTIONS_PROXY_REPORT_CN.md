# Antigravity 原生 Interactions 鉴权代理实现报告

## 1. 头部

| 项 | 值 |
| --- | --- |
| 日期 | 2026-09-13 |
| 分支 | `main` |
| 基线 commit | `82e68f3`（`docs(antigravity): add native Interactions auth proxy plan`） |
| 当前 commit | `cd26a07`（`feat(antigravity): add native Interactions auth proxy`）；随后按 2026-09-13 的实测把默认上游更正为 Antigravity 自己的 origin，该更正仍在工作区 |
| 对应看板 | `antigravity-native-interactions-proxy.kanban.json` |

## 2. 范围

本报告记录 [[ANTIGRAVITY_NATIVE_INTERACTIONS_PROXY_PLAN_CN.md]] 的实现结果：一个独立的 Antigravity 登录 + 鉴权注入 + 原始 HTTP 转发代理，以及让它与既有 Responses ↔ Interactions 转换器互不耦合地组合起来的测试。

本工作是**纯新增**：

- 没有修改任何既有路由、配置文件或 provider 注册。
- 没有修改 `src/services/interactions/*` 及其任何既有测试（`git status --short` 中这些文件均无改动）。
- 唯一的既有文件改动是基线 commit `82e68f3` 本身，它只加入了计划文档。
- 代理不做协议转换：它只替换 `Authorization`，其余方法、路径、query、请求体字节与响应字节原样透传。

## 3. 实际新增内容

下表按写报告时的 `git status --short` / `git show --stat` 逐行核对。

| 文件 | 责任 |
| --- | --- |
| `ANTIGRAVITY_NATIVE_INTERACTIONS_PROXY_PLAN_CN.md` | 计划文档，已在 `82e68f3` 提交（149 行） |
| `ANTIGRAVITY_NATIVE_INTERACTIONS_CONTRACT_CN.md` | 本地证据契约调查：客户端符号扫描结果、公开规范端点、必须联网确认的清单 |
| `src/services/antigravity/auth.ts` | 凭据文件读写、刷新、并发合并、授权码登录、project 发现；所有 HTTP 走一个可注入的 transport |
| `src/services/antigravity/proxy.ts` | 单一固定上游 origin 的透明转发监听器与 server 工厂；只改写 `Authorization` 与 `User-Agent`（后者按 CLIProxyAPI 的固定指纹注入） |
| `scripts/antigravity-proxy.ts` | 唯一的可运行入口：`login` 与 `serve` 两种操作、参数校验、用法与退出码；`serve` 的默认上游是 Antigravity 自己的 `https://daily-cloudcode-pa.googleapis.com` |
| `tests/antigravity-auth.test.ts` | 凭据文件、刷新、并发、登录回调的 12 个离线测试 |
| `tests/antigravity-proxy.test.ts` | 路径/query/body 字节一致、鉴权替换、错误透传、重定向不跟随、hop-by-hop 处理的 13 个离线测试 |
| `tests/antigravity-proxy-entry.test.ts` | 入口参数解析与“无参数时打印用法并返回非零”的 9 个测试 |
| `tests/antigravity-proxy-stream.test.ts` | SSE 分块重组、增量交付、不合成、取消、上游断流、压缩一致的 7 个离线测试 |
| `tests/antigravity-proxy-converter-integration.test.ts` | 转换器经代理的 5 个端到端离线用例 + 1 个解耦断言 |
| `ANTIGRAVITY_NATIVE_INTERACTIONS_PROXY_REPORT_CN.md` | 本报告 |

保留未改动的既有本地改动（不属于本轮工作，也未提交）：`.kanbansession`、`codex-models.json`、`src/lib/codex-models.ts`、`src/lib/model-routing.ts`、`src/routes/responses/handler.ts`、`tests/codex-passthrough.test.ts`、`tests/model-routing.test.ts`。

## 4. 契约调查结论

完整记录见 [[ANTIGRAVITY_NATIVE_INTERACTIONS_CONTRACT_CN.md]]。要点：

| 结论 | 证据类型 |
| --- | --- |
| 客户端二进制中不存在 `InteractionsService`、`CreateInteraction`、`interactions:create`、`deleteInteraction`、`ListInteractions`，也不存在 `/v1beta/interactions` 或 `/v1/interactions` 路径串 | 本地观察（对 156 MB `language_server.exe` 做只读符号扫描，全部 0 命中） |
| `v1internal:registerInteraction` 属于 `JetskiService`，请求字段 `interaction` 的 oneof 分支是 `nux_interaction`（`nux_id`、`interaction_type`），响应字段 `message` | 本地观察（描述符 `google/internal/cloud/code/v1internal/jetski_service.proto`） |
| Phase 1 报告第 9.1 节“`registerInteraction` 创建/续写 Interaction”的推断不成立 | 由上两行推出，已在该文档中作废 |
| 公开 Interactions 的会话字段 `previous_interaction_id`、`interaction_id`、`interactionId`、`previousInteractionId` 在二进制中出现次数为 0 | 本地观察 |
| 公开规范端点为 `POST https://generativelanguage.googleapis.com/v1beta/interactions`、`GET .../v1beta/interactions/{id}`、`POST .../v1beta/interactions/{id}/cancel`，企业版为 `POST https://aiplatform.googleapis.com/v1beta1/projects/{project}/locations/global/interactions` | 已抓取的公开文档，版本是 `v1beta` / `v1beta1`，不是 `v1` |
| 代理固定上游应当是 Antigravity 自己的 `https://daily-cloudcode-pa.googleapis.com`，路径按 `v1internal:*` 给出 | 2026-09-13 真实调用（见 4.2）。原先的“公开 Interactions / `generativelanguage.googleapis.com`”推断已作废 |

**仍需一次真实调用才能确认**（原样保留，未用推理填补）。其中第 1、2、3、8 项已由 4.1 与 4.2 回答，第 4-7 项属于公开 Interactions 的语义，在 Antigravity 自己的 origin 上不适用：

1. Antigravity 的 OAuth access token 能否用于 `https://generativelanguage.googleapis.com`（scope 是否足够、是否被要求 API key）。
2. `POST /v1beta/interactions` 在该 token 下的真实状态码与响应体（200 / 401 / 403 / 404 / 400）。
3. 流式是否存在，以什么形式（SSE、`?alt=sse`，还是同一路径下的流式变体）。
4. `project` 的实际归属：body 顶层、header，还是 URL path。
5. 返回的 Interaction `id` 能否用于下一轮 `previous_interaction_id`，服务端是否据此保持上下文。
6. `tools`、`function_call`/`function_result`、`thought` 与签名在真实响应中的字段名是否与公开规范一致。
7. 缓存指标：重复稳定上下文时是否出现可观测的 cached token 计数。
8. `v1internal:*` 命名空间在远端是否可达，是否只是本地/内网接口。

### 4.1 第一轮：打到公开 Google API（产品面判断错误，结论作废）

用一个本机已有的 Antigravity 凭据（`~/.cli-proxy-api/antigravity-<email>.json`，访问令牌已过期）执行了两次真实调用，原始抓取保存在 Git 之外的本地 scratch 目录。这一轮把 `generativelanguage.googleapis.com` 当成 Antigravity 的后端，方向是错的，保留在此仅作记录：

| 步骤 | 请求 | 结果 |
| --- | --- | --- |
| 凭据刷新 | `AntigravityCredentialStore.current()` → `https://oauth2.googleapis.com/token` | 成功换取新 access token（长度 260），凭据文件按原子写入更新 |
| 只读连通性 | `POST https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist`，body `{"metadata":{"ideType":"ANTIGRAVITY"}}` | **200**，3869 字节，返回 `currentTier.id = free-tier`，与既有 Phase 1 结论一致 |
| 最小创建（直连） | `POST https://generativelanguage.googleapis.com/v1beta/interactions`，body `{"input":"Reply with the single word: pong","model":"gemini-3.8-flash"}` | **403 `ACCESS_TOKEN_SCOPE_INSUFFICIENT`**，495 字节 |

这次 403 不是“接口不存在”，而是“凭据权限不足”，而且响应本身确认了候选契约：

```
details[0].metadata.method  = google.learning.gemini.api.interactions.v1beta.InteractionsService.CreateInteractionHttp
details[0].metadata.service = generativelanguage.googleapis.com
www-authenticate: Bearer realm="https://accounts.google.com/", error="insufficient_scope",
  scope="https://www.googleapis.com/auth/generative-language
         https://www.googleapis.com/auth/generative-language.tuning
         https://www.googleapis.com/auth/generative-language.tuning.readonly
         https://www.googleapis.com/auth/generative-language.retriever
         https://www.googleapis.com/auth/generative-language.retriever.readonly"
```

| 状态 | 条目 |
| --- | --- |
| **已确认（仅关于公开接口）** | `POST https://generativelanguage.googleapis.com/v1beta/interactions` 是真实的公开 Interactions 创建方法（`InteractionsService.CreateInteractionHttp`），路径与版本 `v1beta` 正确，不是 404 |
| **已确认** | Antigravity 登录凭据当前的 scope 集合（`cloud-platform`、`userinfo.email`、`userinfo.profile`、`cclog`、`experimentsandconfigs`）**不足以**调用该公开接口；Google 明确要求 `https://www.googleapis.com/auth/generative-language*` 家族 scope |
| **已确认** | 既有凭据的刷新链路在真实 Google 端可用，`loadCodeAssist` 返回 200 |
| **作废** | 由这一轮推出的“代理固定上游应为 `generativelanguage.googleapis.com`”结论，已被 4.2 推翻 |

### 4.2 第二轮：改打 Antigravity 自己的 origin（本次更正）

`language_server.exe` 中的专有主机是 `cloudcode-pa.googleapis.com`、`daily-cloudcode-pa.googleapis.com` 与 `aicode.googleapis.com`。用同一凭据对前两台重放，envelope 与 Phase 1 一致（顶层 `model`、`userAgent: "antigravity"`、`requestType: "agent"`、`project`、`requestId: "agent-<uuid>"`、`request.sessionId`）：

| # | 请求 | 结果 | 抓取 |
| --- | --- | --- | --- |
| 1 | `POST https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist` | 200 | `10-prod-loadcodeassist.*` |
| 2 | `POST https://cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels` | 200，33 个模型 | `11-prod-fetchmodels.*` |
| 3 | `POST https://cloudcode-pa.googleapis.com/v1beta/interactions` | **404**（HTML） | `12-prod-v1beta-interactions.*` |
| 4 | `POST https://cloudcode-pa.googleapis.com/v1internal:generateContent` | **429 `RESOURCE_EXHAUSTED`** | `20-prod-generate.*` |
| 5 | `POST https://daily-cloudcode-pa.googleapis.com/v1internal:generateContent` | **200**，文本 `pong`，`finishReason=STOP` | `21-daily-generate.*` |
| 6 | `POST https://cloudcode-pa.googleapis.com/v1internal:createInteraction` | **404**（HTML） | `22-prod-createInteraction.*` |
| 7 | `POST https://daily-cloudcode-pa.googleapis.com/v1beta/interactions` | **404**（HTML） | `23-daily-v1beta-interactions.*` |
| 8 | `POST https://daily-cloudcode-pa.googleapis.com/v1internal:loadCodeAssist` | 200 | `30-daily-loadcodeassist.*` |
| 9 | `POST https://daily-cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels` | 200，同样 33 个模型 | `31-daily-fetchmodels.*` |

第 5 步的响应体（节选）：

```json
{"response":{"candidates":[{"content":{"role":"model","parts":[{"thoughtSignature":"…","text":"pong"}]},"finishReason":"STOP"}],
 "usageMetadata":{"promptTokenCount":8,"candidatesTokenCount":1,"totalTokenCount":74,"thoughtsTokenCount":65}}}
```

**上游按 Antigravity 客户端的指纹校验请求头。** 同一条 `v1internal:generateContent` 请求带上 Antigravity 的 UA（`antigravity/hub/2.9.1 darwin/arm64`）返回 200，换成 curl 的 UA 时返回 **403 `SUBSCRIPTION_REQUIRED`**（`domain: cloudaicompanion.googleapis.com`，`metadata.error_number: 1001`）。

这个 UA 不是猜的，来自 CLIProxyAPI 参考实现：

| 证据 | 内容 |
| --- | --- |
| `internal/runtime/executor/antigravity_executor.go:907-941`（`HttpRequest`） | 白名单式清空**所有**入站 header，然后只设 `Content-Type`（若有）、`User-Agent`、`Authorization` |
| `internal/runtime/executor/antigravity_executor_request.go:124-127` | `Content-Type: application/json`、`Authorization: Bearer <token>`、`User-Agent: resolveUserAgent(auth)` |
| `internal/misc/antigravity_version.go:115-118` | `AntigravityUserAgent()` = `antigravity/hub/<version> darwin/arm64`，版本默认 `2.9.1` |

所以 UA 属于鉴权注入的一部分，不是调用方的自由字段。代理据此在转发前把 `User-Agent` 换成上面这个固定值（与 `Authorization` 一起注入），其余 header、方法、路径、query 与 body 字节仍然原样透传。

### 4.3 通过代理的端到端实测（同一轮，成功）

把 `serve` 的默认上游改成 `https://daily-cloudcode-pa.googleapis.com` 后，用 curl 打本地代理，再经代理转发到真实 Antigravity 后端。代理启动输出确认为 `antigravity proxy: http://127.0.0.1:51234 -> https://daily-cloudcode-pa.googleapis.com`。

第一次运行只注入了 `Authorization`，于是 curl 自带的 UA 被原样送到上游：

| 请求 | 结果 |
| --- | --- |
| `curl -X POST http://127.0.0.1:51234/v1internal:generateContent` | **403 `SUBSCRIPTION_REQUIRED`** |
| 同一请求手工加 `user-agent: antigravity/hub/2.9.1 darwin/arm64` | **200**，真实模型响应（`42-proxy-generate-ua.json`） |
| `.../v1internal:streamGenerateContent?alt=sse` 手工加同一个 UA | **200**，SSE（`43-proxy-stream-ua.txt`） |

确认 UA 是上游的门之后，代理改成按 4.2 的 CLIProxyAPI 证据自行注入 UA，再用**完全不设 UA 的普通 curl** 复测，调用方不需要知道任何 Antigravity 细节：

| 请求 | 结果 |
| --- | --- |
| `curl -X POST http://127.0.0.1:51234/v1internal:generateContent`（不传 UA） | **200**，真实模型响应（`50-proxy-generate-plain.json`） |
| `curl -X POST "http://127.0.0.1:51234/v1internal:streamGenerateContent?alt=sse"`（不传 UA） | **200**，SSE，2 个 `data:` 事件，首个事件文本 `pong`、`modelVersion: gemini-3.8-flash`（`51-proxy-stream-plain.txt`） |

这四行合起来即是“代理对真实上游的成功转发”，第 6.2 节原先相应条目的“未验证”状态据此撤销。

| 状态 | 条目 |
| --- | --- |
| **已确认** | Antigravity 专有的模型面是 `https://daily-cloudcode-pa.googleapis.com` 的 `v1internal:*`；`generateContent` 与 `streamGenerateContent?alt=sse` 都返回 200 |
| **已确认** | Antigravity 的 origin 上不存在 Interactions 路径：`/v1beta/interactions` 与 `v1internal:createInteraction` 在两个 origin 上都是 404 |
| **已确认** | 代理能对真实上游完成端到端转发，且路径、query、body 字节与响应字节保持原样，`Authorization` 与 `User-Agent` 被替换成 Antigravity 指纹 |
| **已确认** | 上游按 UA 校验；非 Antigravity UA 即使是合法 token 也返回 403，注入固定 UA 后普通客户端可直接复用 |
| **仍然未知** | 缓存/`previous_interaction_id` 语义（Antigravity 的 origin 上没有 Interactions 资源，该问题改由公开 Interactions 路径承担）；`v1internal` 各 RPC 的完整请求形状 |

## 5. 实际执行过的测试命令与结果

以下每一行都是本轮真实执行过的命令及其观察到的输出，没有未执行的结果。

| 命令 | 观察结果 |
| --- | --- |
| `bun test tests/antigravity-auth.test.ts` | 12 pass, 0 fail, 39 expect() calls |
| `bun test tests/antigravity-proxy.test.ts` | 13 pass, 0 fail, 82 expect() calls |
| `bun test tests/antigravity-proxy-entry.test.ts` | 9 pass, 0 fail, 35 expect() calls |
| `bun test tests/antigravity-proxy-stream.test.ts` | 7 pass, 0 fail, 16 expect() calls |
| `bun test tests/antigravity-proxy-converter-integration.test.ts` | 6 pass, 0 fail, 33 expect() calls |
| `bun test tests/antigravity-proxy.test.ts tests/antigravity-proxy-entry.test.ts tests/antigravity-auth.test.ts` | 34 pass, 0 fail, 156 expect() calls |
| `bun test`（全量） | 422 pass, 1 skip, 0 fail, 1363 expect() calls, 40 files |
| `bun run typecheck` | exit 0 |
| `bun run build` | exit 0；tsdown 输出 `dist/main.js` 133.59 kB（gzip 35.57 kB）、`dist/main.js.map` 282.87 kB |
| `bunx eslint --fix` 逐个覆盖 `src/services/antigravity/auth.ts`、`src/services/antigravity/proxy.ts`、`scripts/antigravity-proxy.ts` 与四个 Antigravity 测试文件 | 每次 exit 0，无残留问题 |
| `bun scripts/antigravity-proxy.ts`（无参数） | exit 2；stdout 为空，stderr 打印用法；不含任何 token 值 |
| `rg -n "antigravity" src/services/interactions/` | 无命中（exit 1） |
| `rg -l "antigravity/(auth\|proxy)" src/` | 无命中，`src/` 下没有任何文件 import 这两个模块 |
| `bun <scratch>/probe.mjs loadCodeAssist`（已授权联网） | 凭据刷新成功；`loadCodeAssist` 200，3869 字节 |
| `bun <scratch>/probe.mjs create`（已授权联网） | 403 `ACCESS_TOKEN_SCOPE_INSUFFICIENT`，495 字节；随后按停止条件中止 |
| `bun test tests/antigravity-proxy-entry.test.ts tests/antigravity-proxy.test.ts tests/antigravity-auth.test.ts tests/antigravity-proxy-stream.test.ts tests/antigravity-proxy-converter-integration.test.ts`（改上游与注入 UA 之后） | 47 pass, 0 fail, 207 expect() calls |
| `bun run typecheck`（同上） | exit 0 |
| `bun <scratch>/probe3.ts`（已授权联网，`cloudcode-pa` / `daily-cloudcode-pa` 共 9 次调用） | 见 4.2 的逐条状态码 |
| `bun scripts/antigravity-proxy.ts serve --credential-file <cred> --port 51234` + `curl`（已授权联网） | 见 4.3 的四条结果 |

真实调用的抓取文件（Git 之外，凭据值已替换为 `Bearer <redacted>`）：

```
%TEMP%\antigravity-live-capture\01-loadcodeassist.request.json
%TEMP%\antigravity-live-capture\01-loadcodeassist.response.json
%TEMP%\antigravity-live-capture\01-loadcodeassist.response.bin
%TEMP%\antigravity-live-capture\02-interactions-create.request.json
%TEMP%\antigravity-live-capture\02-interactions-create.response.json
%TEMP%\antigravity-live-capture\02-interactions-create.response.bin
%TEMP%\antigravity-live-capture\10-prod-loadcodeassist.*        (下标 10-31：4.2 的逐条探测)
%TEMP%\antigravity-live-capture\21-daily-generate.response.txt
%TEMP%\antigravity-live-capture\40-proxy-generate.json          (修正前的 403)
%TEMP%\antigravity-live-capture\50-proxy-generate-plain.json    (修正后的 200)
%TEMP%\antigravity-live-capture\51-proxy-stream-plain.txt
```

全量测试里唯一的 skip 是既有用例 `Codex credential store > stores the credential with owner-only permissions`，与本轮工作无关。

对看板验证指令的一处替换如实记录：任务条目写的是 `bunx tsx scripts/antigravity-proxy.ts`，但 `tsx` 不是本仓库依赖，且 `bunx` 在当前沙箱无法运行（`error: bun is unable to write files to tempdir: EPERM`，重定向 `TEMP`/`TMP`/`TMPDIR` 后同样失败）。等价的检查使用了仓库自身的 TypeScript 运行时 `bun scripts/antigravity-proxy.ts`，未新增 `tsx` 依赖。

## 6. 已验证 vs 未验证

| 已验证（离线测试直接证明） | 未验证（只有真实调用才能证明） |
| --- | --- |
| 凭据文件按 CLIProxyAPI 形状解析，缺失/过期/不可解析的 `expired` 报明确类型错误 | Antigravity 登录能否在真实 Google 端完成，token exchange 与 userinfo 是否被接受 |
| 过期前安全窗口内刷新、并发刷新合并为一次、响应不带新 refresh token 时保留旧值、原子写入 | 真实网络下的并发合并与刷新失败分支（单次真实刷新已于 2026-09-13 确认，见 4.1） |
| 登录回调的 state 校验、error 回调、缺 code、超时四条失败路径 | 真实浏览器授权码流程（`loadCodeAssist` 的真实 200 与 project 返回已于 2026-09-13 确认，见 4.1） |
| 未知路径与资源子路径都落到唯一固定 origin；`Host`、absolute-form、`X-Forwarded-*` 无法改变目标 | 代理对真实上游的端到端转发（已于 2026-09-13 确认，见 4.3；上游在专有面上提供的是 `v1internal:*`，不是 `v1beta/interactions`，见 4.2） |
| 重复/空 query、转义路径、二进制 body、重复 JSON key、大整数、非 JSON 字节原样往返 | 真实上游对 body 形状（`model`、`input`、`tools`、`generation_config`）的接受度 |
| 入站 `Authorization` 被替换为凭据 token；凭据不可用时零上游请求 | 是否也接受 API key 认证（Antigravity OAuth token 的 scope 不足已于 2026-09-13 确认，见 4.1） |
| 401/403/429/5xx 状态与 body 原样、每次恰好一次上游请求；302 返回不跟随 | 真实配额失败与流式错误的行为（真实 403 状态与错误体、`www-authenticate` 已在 4.1 记录，但代理对真实上游的错误透传未执行） |
| hop-by-hop 与 `Forwarded`/`X-Forwarded-*` 被剥离，端到端头与 `Content-Encoding` 保留 | 上游是否要求额外的 UA 或路由头（已于 2026-09-13 确认：要求 Antigravity Hub UA，代理据此注入，见 4.2/4.3） |
| SSE 跨 chunk 字节重组、首段增量交付、注释/未知事件/空帧/终止帧原样、无终止帧不被补全 | 真实流式的存在形式（SSE / `alt=sse` / 其他） |
| 客户端取消传播到上游；上游中途断流不会变成正常完成、不追加合成帧 | 真实断流与恢复行为 |
| 转换器经代理的文本、流式、工具往返、签名 thought 重放、父引用续轮在离线 mock 下成立 | 原生响应字段与公开规范一致；真实 cache hit（必须观察 cached token 计数） |

### 6.1 2026-09-13 真实调用已确认

- 真实上游行为：Antigravity 专有的模型面是 `https://daily-cloudcode-pa.googleapis.com` 的 `v1internal:*`；`generateContent` 与 `streamGenerateContent?alt=sse` 都返回 200 并有真实模型输出。
- 真实上游行为：Antigravity 的 origin 上没有 Interactions 路径，`/v1beta/interactions` 与 `v1internal:createInteraction` 都返回 404。
- 真实鉴权行为：Antigravity OAuth token 在公开 `generativelanguage.googleapis.com` 上被拒（403 `ACCESS_TOKEN_SCOPE_INSUFFICIENT`，`www-authenticate` 要求 `generative-language*`），在 Cloud Code 专有面上被接受。
- 真实凭据刷新：过期凭据经 `https://oauth2.googleapis.com/token` 成功刷新。
- 真实只读查询：`loadCodeAssist` 返回 200，`currentTier.id = free-tier`；`fetchAvailableModels` 返回 33 个模型。
- 真实端到端：代理对真实上游完成转发，普通 curl 无需任何 Antigravity 知识即可拿到 200。
- 真实请求头要求：上游按 Antigravity Hub 的 UA 校验，该值来自 CLIProxyAPI 的实现而不是猜测。

### 6.2 仍未被任何真实调用确认

- 公开 Interactions 是否接受 API key；追加 `generative-language` scope 重新授权后是否可用。
- 公开 Interactions 的 `previous_interaction_id` 语义、真实字段名与 cache 计数（Antigravity 的 origin 上没有这一层，无法用它回答）。
- `v1internal` 其余 RPC（`countTokens`、`generateChat`、`streamGenerateChat`、`retrieveUserQuota` 等）的请求形状。
- Codex CLI 经“转换器 + 代理”的真实单轮与续轮：现有转换器输出的是公开 Interactions 报文，与 `v1internal:*` 不是同一种负载，因此这条链路还不能直接跑通。

## 7. 已知限制

以下限制在本轮**没有**被修复，也没有被测试掩盖：

- **未签名 reasoning 回放仍然失败。** 没有 `encrypted_content` 的 `reasoning` 项会被转换器拒绝：`Reasoning item has no replay envelope; only a signed thought can be replayed`。离线集成测试只覆盖了带签名的路径。
- **省略工具声明的父引用续轮仍未解决。** `function_result` 的名字只能来自本次请求内的调用历史或显式 `name`；在带 `previous_interaction_id` 且两者都缺失时，名字会被省略，工具身份无法还原。
- **`metadata` 不是 cache 证据。** `prompt_cache_key` 与 `client_metadata` 只留在转换器返回的 metadata 中，本次测试同时断言它们**没有**出现在上游 body 里；缓存是否命中必须由真实响应的 cached token 计数判断。
- **上游 HTTP trailer 未转发。** `trailer` 与 `transfer-encoding` 属 hop-by-hop，按 RFC 9110 被剥离；计划文本提到过 trailer，任务条目未要求，本轮按限制记录。
- **登录流程只有 mock 覆盖。** `onboardUser` 轮询实现了但没有测试触达；真实登录属于后续真实接入任务。
- **凭据中内嵌的 client id/secret 来自仓库内的 CLIProxyAPI 参考快照。** 它是公开的已安装应用密钥，不是用户凭据，但值得评审注意。
- **转换器与 Antigravity 专有面之间还差一层。** 代理已能对真实上游完成转发（4.3），但现有 Responses ↔ Interactions 转换器产出的是公开 Interactions 报文，而 Antigravity 的 origin 只认 `v1internal:*` 的 Gemini/Cloud Code 负载。两者不是同一协议的两种写法，因此“转换器 + 代理”的 Codex CLI 真实链路仍未跑通，本轮也没有伪造任何替代结果。
- **Codex CLI 真实单轮未执行。** 原因与上一条相同：没有对接 `v1internal:*` 的转换器，本轮不新增转换逻辑。
- **Antigravity 登录凭据不能调用公开 Interactions。** 需要的 scope（`https://www.googleapis.com/auth/generative-language*`）不在现有登录 scope 集合中；补齐 scope 需要一次新的 OAuth 授权，属于新的授权边界，本轮未执行。同时 Antigravity 自己的 origin 上根本没有 Interactions 路径（404），所以补 scope 也不会让这条代理路线变成 Interactions 代理。

## 8. 非目标

来自计划、本轮明确不做：

- 代理内不做任何协议转换，不理解 Responses，也不理解 Interactions 语义。
- 不支持 WebSocket。响应体只当作字节流处理。
- 不做多账号池、账号切换、端点回退或自动重放。
- 不做 provider 注册、模型注册、数据库、管理 UI 或配置框架。
- 代理本体不新增录制/脱敏子系统；完整保存由测试调用方负责。
- 不修改任何既有路由、配置或 `src/services/interactions/*`。
