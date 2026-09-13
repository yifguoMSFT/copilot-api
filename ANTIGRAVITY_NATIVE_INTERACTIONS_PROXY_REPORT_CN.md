# Antigravity 原生 Interactions 鉴权代理实现报告

## 1. 头部

| 项 | 值 |
| --- | --- |
| 日期 | 2026-09-13 |
| 分支 | `main` |
| 基线 commit | `82e68f3`（`docs(antigravity): add native Interactions auth proxy plan`） |
| 当前 commit | 尚未提交；本报告的改动仍在工作区，提交由看板任务 `commit_the_completed_antigravity_proxy_work` 完成 |
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
| `src/services/antigravity/proxy.ts` | 单一固定上游 origin 的透明转发监听器与 server 工厂；只改写 `Authorization` |
| `scripts/antigravity-proxy.ts` | 唯一的可运行入口：`login` 与 `serve` 两种操作、参数校验、用法与退出码 |
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
| 计划措辞修正为“Antigravity 登录态 + 公开 Interactions API”，代理固定上游默认为 `https://generativelanguage.googleapis.com` | 推断，已反映在本报告与入口默认值中 |

**仍需一次真实调用才能确认**（原样保留，未用推理填补）：

1. Antigravity 的 OAuth access token 能否用于 `https://generativelanguage.googleapis.com`（scope 是否足够、是否被要求 API key）。
2. `POST /v1beta/interactions` 在该 token 下的真实状态码与响应体（200 / 401 / 403 / 404 / 400）。
3. 流式是否存在，以什么形式（SSE、`?alt=sse`，还是同一路径下的流式变体）。
4. `project` 的实际归属：body 顶层、header，还是 URL path。
5. 返回的 Interaction `id` 能否用于下一轮 `previous_interaction_id`，服务端是否据此保持上下文。
6. `tools`、`function_call`/`function_result`、`thought` 与签名在真实响应中的字段名是否与公开规范一致。
7. 缓存指标：重复稳定上下文时是否出现可观测的 cached token 计数。
8. `v1internal:*` 命名空间在远端是否可达，是否只是本地/内网接口。

### 4.1 真实调用结果（2026-09-13，已获人工授权）

用一个本机已有的 Antigravity 凭据（`~/.cli-proxy-api/antigravity-<email>.json`，访问令牌已过期）执行了两次真实调用，原始抓取保存在 Git 之外的本地 scratch 目录：

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
| **已确认** | `POST https://generativelanguage.googleapis.com/v1beta/interactions` 就是真实的 Interactions 创建方法（`InteractionsService.CreateInteractionHttp`），路径与版本 `v1beta` 正确，不是 404、也不是另一套协议 |
| **已确认** | Antigravity 登录凭据当前的 scope 集合（`cloud-platform`、`userinfo.email`、`userinfo.profile`、`cclog`、`experimentsandconfigs`）**不足以**调用该接口；Google 明确要求 `https://www.googleapis.com/auth/generative-language*` 家族 scope |
| **已确认** | 既有凭据的刷新链路在真实 Google 端可用，`loadCodeAssist` 仍返回 200 |
| **仍然未知** | 追加 `generative-language` scope 重新授权后是否可用；是否也接受 API key；流式形式；`project` 归属；`previous_interaction_id` 语义；真实字段名；cache 计数；`v1internal:*` 的远端可达性 |
| **按停止条件中止** | 403 属于批复确认书列出的停止条件，因此未执行流式尝试、第二轮、工具往返、父引用续轮与 Codex CLI 环节；没有重试、没有换端点、没有改用 `generateContent` |

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

真实调用的抓取文件（Git 之外，凭据值已替换为 `Bearer <redacted>`）：

```
%TEMP%\antigravity-live-capture\01-loadcodeassist.request.json
%TEMP%\antigravity-live-capture\01-loadcodeassist.response.json
%TEMP%\antigravity-live-capture\01-loadcodeassist.response.bin
%TEMP%\antigravity-live-capture\02-interactions-create.request.json
%TEMP%\antigravity-live-capture\02-interactions-create.response.json
%TEMP%\antigravity-live-capture\02-interactions-create.response.bin
```

全量测试里唯一的 skip 是既有用例 `Codex credential store > stores the credential with owner-only permissions`，与本轮工作无关。

对看板验证指令的一处替换如实记录：任务条目写的是 `bunx tsx scripts/antigravity-proxy.ts`，但 `tsx` 不是本仓库依赖，且 `bunx` 在当前沙箱无法运行（`error: bun is unable to write files to tempdir: EPERM`，重定向 `TEMP`/`TMP`/`TMPDIR` 后同样失败）。等价的检查使用了仓库自身的 TypeScript 运行时 `bun scripts/antigravity-proxy.ts`，未新增 `tsx` 依赖。

## 6. 已验证 vs 未验证

| 已验证（离线测试直接证明） | 未验证（只有真实调用才能证明） |
| --- | --- |
| 凭据文件按 CLIProxyAPI 形状解析，缺失/过期/不可解析的 `expired` 报明确类型错误 | Antigravity 登录能否在真实 Google 端完成，token exchange 与 userinfo 是否被接受 |
| 过期前安全窗口内刷新、并发刷新合并为一次、响应不带新 refresh token 时保留旧值、原子写入 | 真实网络下的并发合并与刷新失败分支（单次真实刷新已于 2026-09-13 确认，见 4.1） |
| 登录回调的 state 校验、error 回调、缺 code、超时四条失败路径 | 真实浏览器授权码流程（`loadCodeAssist` 的真实 200 与 project 返回已于 2026-09-13 确认，见 4.1） |
| 未知路径与资源子路径都落到唯一固定 origin；`Host`、absolute-form、`X-Forwarded-*` 无法改变目标 | 代理对真实上游的端到端转发（上游确实提供 `v1beta/interactions` 已在 2026-09-13 确认，见 4.1） |
| 重复/空 query、转义路径、二进制 body、重复 JSON key、大整数、非 JSON 字节原样往返 | 真实上游对 body 形状（`model`、`input`、`tools`、`generation_config`）的接受度 |
| 入站 `Authorization` 被替换为凭据 token；凭据不可用时零上游请求 | 是否也接受 API key 认证（Antigravity OAuth token 的 scope 不足已于 2026-09-13 确认，见 4.1） |
| 401/403/429/5xx 状态与 body 原样、每次恰好一次上游请求；302 返回不跟随 | 真实配额失败与流式错误的行为（真实 403 状态与错误体、`www-authenticate` 已在 4.1 记录，但代理对真实上游的错误透传未执行） |
| hop-by-hop 与 `Forwarded`/`X-Forwarded-*` 被剥离，端到端头与 `Content-Encoding` 保留 | 上游是否要求额外的 UA 或路由头 |
| SSE 跨 chunk 字节重组、首段增量交付、注释/未知事件/空帧/终止帧原样、无终止帧不被补全 | 真实流式的存在形式（SSE / `alt=sse` / 其他） |
| 客户端取消传播到上游；上游中途断流不会变成正常完成、不追加合成帧 | 真实断流与恢复行为 |
| 转换器经代理的文本、流式、工具往返、签名 thought 重放、父引用续轮在离线 mock 下成立 | 原生响应字段与公开规范一致；真实 cache hit（必须观察 cached token 计数） |

### 6.1 2026-09-13 真实调用已确认

- 真实上游行为：`POST /v1beta/interactions` 存在且由 `InteractionsService.CreateInteractionHttp` 提供；候选 origin、方法与版本正确。
- 真实鉴权行为：Antigravity OAuth token 被拒绝，403 `ACCESS_TOKEN_SCOPE_INSUFFICIENT`，`www-authenticate` 列出了所需的 `generative-language` scope 家族。
- 真实凭据刷新：过期凭据经 `https://oauth2.googleapis.com/token` 成功刷新。
- 真实只读查询：`loadCodeAssist` 返回 200，`currentTier.id = free-tier`。

### 6.2 仍未被任何真实调用确认

- 是否接受 API key；追加 scope 重新授权后是否可用。
- 流式形式、`project` 归属、`previous_interaction_id` 语义、真实字段名、cache 计数。
- 代理对真实上游的端到端转发（直连未成功，按确认书要求未执行代理复现）。
- Codex CLI 经“转换器 + 代理”的真实单轮与续轮。
| 代理与转换器互不 import；`src/services/interactions/` 无 Antigravity 引用 | 原生上游对 `previous_interaction_id` 的语义与是否保持上下文 |

## 7. 已知限制

以下限制在本轮**没有**被修复，也没有被测试掩盖：

- **未签名 reasoning 回放仍然失败。** 没有 `encrypted_content` 的 `reasoning` 项会被转换器拒绝：`Reasoning item has no replay envelope; only a signed thought can be replayed`。离线集成测试只覆盖了带签名的路径。
- **省略工具声明的父引用续轮仍未解决。** `function_result` 的名字只能来自本次请求内的调用历史或显式 `name`；在带 `previous_interaction_id` 且两者都缺失时，名字会被省略，工具身份无法还原。
- **`metadata` 不是 cache 证据。** `prompt_cache_key` 与 `client_metadata` 只留在转换器返回的 metadata 中，本次测试同时断言它们**没有**出现在上游 body 里；缓存是否命中必须由真实响应的 cached token 计数判断。
- **上游 HTTP trailer 未转发。** `trailer` 与 `transfer-encoding` 属 hop-by-hop，按 RFC 9110 被剥离；计划文本提到过 trailer，任务条目未要求，本轮按限制记录。
- **登录流程只有 mock 覆盖。** `onboardUser` 轮询实现了但没有测试触达；真实登录属于后续真实接入任务。
- **凭据中内嵌的 client id/secret 来自仓库内的 CLIProxyAPI 参考快照。** 它是公开的已安装应用密钥，不是用户凭据，但值得评审注意。
- **代理未对真实上游跑过一次成功转发。** 直连创建在鉴权阶段就被 403 拒绝，按批复确认书的停止条件，未执行“直连成功后经代理复现”这一步。代理的正确性目前完全由离线 mock 证据支撑，真实上游的端到端转发仍未验证。
- **Codex CLI 真实单轮未执行。** 它排在流式、第二轮与工具往返之后，全部因同一个 403 停止条件未运行。
- **Antigravity 登录凭据当前不能直接调用原生 Interactions。** 需要的 scope（`https://www.googleapis.com/auth/generative-language*`）不在现有登录 scope 集合中；补齐 scope 需要一次新的 OAuth 授权，属于新的授权边界，本轮未在批复范围内执行。

## 8. 非目标

来自计划、本轮明确不做：

- 代理内不做任何协议转换，不理解 Responses，也不理解 Interactions 语义。
- 不支持 WebSocket。响应体只当作字节流处理。
- 不做多账号池、账号切换、端点回退或自动重放。
- 不做 provider 注册、模型注册、数据库、管理 UI 或配置框架。
- 代理本体不新增录制/脱敏子系统；完整保存由测试调用方负责。
- 不修改任何既有路由、配置或 `src/services/interactions/*`。
