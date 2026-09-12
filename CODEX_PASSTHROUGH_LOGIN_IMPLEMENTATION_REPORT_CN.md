# Codex 透传与登录：实施报告

关联计划：[[CODEX_PASSTHROUGH_LOGIN_IMPLEMENTATION_TEST_PLAN_CN.md]]
关联分析：[[CLIProxyAPI_CODEX_PROXY_ANALYSIS_CN.md]]

## 1. 范围修正（2026-09-12）

用户明确修正方向：Responses 的路由与转发已经通过 `copilot-api` 现有的 Copilot 转发路径长期验证，不需要重新论证透传契约。新目标收敛为：

1. 新增一个 Copilot 之外的 Codex provider，**复用现有转发方式**即可，转发效果与现有 provider 一致。
2. 真正的实现重点是**鉴权**：ChatGPT OAuth 登录、凭据持久化与刷新，以及把凭据注入上游请求。
3. 模型选择仍由 Codex App 通过 `model` 触发，代理按模型选择上游。

因此本报告不再把“逐字节透传”当作验收门槛，也不要求新增协议转换或会话历史补齐。原计划中的 socket 级透传验证降级为可选回归。

## 2. 已完成的本地探测

探测脚本位于 `scripts/codex-probes/`，全部只在 loopback 运行，不接触真实凭据或真实上游。运行时：Bun 1.4.2、srvx 0.8.9、hono 4.9.9、undici 7.16.0。

### 2.1 HTTP 流式与取消（`http-transport.ts`）

| 观测项 | 结果 |
|---|---|
| 经 srvx 网关转发 SSE 的首块延迟 | 3 ms，上游未结束即已下发 |
| 下游 abort 是否触发网关 `request.signal` | 是 |
| abort 是否传导到上游请求 | 是，上游 `request.signal` 触发 |
| 上游 `ReadableStream.cancel()` | 触发，取消后上游停止生产 |

结论：现有转发层天然满足“边收边发”和“下游断开即中止上游”，无需为 Codex 单独设计流式机制。

### 2.2 压缩陷阱（`http-transport.ts`）

| 观测项 | 结果 |
|---|---|
| 上游返回 `content-encoding: gzip` | 保留原 header |
| 客户端收到的实体字节 | 1053 字节，已是解压后内容（无 gzip magic） |
| 客户端收到的 `content-length` | 58（压缩后长度，与实际实体不一致） |
| Bun fetch 默认 `accept-encoding` | `gzip, deflate, br, zstd` |
| 显式请求 `accept-encoding: identity` | 按原值发送，可覆盖默认值 |

结论：Bun 的 fetch 会自动解压响应体但保留压缩相关 header，直接复制上游 header 会让客户端读到“标称 gzip 的明文”。实现时需要强制 `accept-encoding: identity`，或在转发响应时丢弃 `content-encoding`/`content-length`。这是需要显式处理的传输细节，与业务转发无关。

### 2.3 WebSocket Upgrade 与中继（`ws-upgrade.ts`、`ws-relay.ts`）

| 观测项 | 结果 |
|---|---|
| srvx handler 内是否可取到 Bun server | 是，`request.runtime.bun.server` |
| `server.upgrade(request)` | 成功接受 |
| `serve({ bun: { websocket } })` 是否透传 handler | 是 |
| 下游 → 上游 WS 中继 | 成功，帧顺序保持 |
| 多字节 payload | 原样传输 |
| 双向 close 传播 | 上游与下游各触发一次 close |

结论：若 Codex App 确实使用 WebSocket，srvx + Bun 具备完整实现条件。是否需要 WS 仍取决于客户端实际行为，属于真实 App 验收项，不是本阶段的未知风险。

## 3. 鉴权契约（来自 CLIProxyAPI 源码快照）

第三方实现，非官方承诺；常量与参数需在实施时核验。

| 项 | 值 / 位置 |
|---|---|
| 授权端点 | `https://auth.openai.com/oauth/authorize` |
| Token 端点 | `https://auth.openai.com/oauth/token` |
| client_id | `app_EMoamEEZ73f0CkXaXp7hrann` |
| redirect_uri | `http://localhost:1455/auth/callback` |
| scope | `openid email profile offline_access` |
| 额外参数 | `codex_cli_simplified_flow=true`、`id_token_add_organizations=true` |
| PKCE | S256，`code_verifier` 随 code 一起交换 |
| 上游 base URL | `https://chatgpt.com/backend-api/codex` + `/responses` |

上游请求 header（`codex_executor_request.go`）：

- 必须覆盖：`Authorization: Bearer <access_token>`、`Chatgpt-Account-Id`（OAuth 场景）。
- 客户端元数据：`Session-Id`、`X-Client-Request-Id`、`X-Codex-Window-Id`、`X-Codex-Turn-Metadata`、`X-Codex-Beta-Features`、`Version`、`X-OpenAI-Internal-Codex-Responses-Lite`。
- 标识：`User-Agent`、`Originator`（参考实现默认 `codex-tui/0.153.3 ...` 与 `codex-tui`）。
- `Accept`：流式 `text/event-stream`，非流式 `application/json`。

需要重点决策的是：哪些 header 由客户端原样透传、哪些由代理补写。鉴权相关（Authorization、Chatgpt-Account-Id）必须由代理控制，不能信任客户端传入值。

## 4. 待实测项

1. 真实浏览器 OAuth 登录与刷新能否成功，refresh token 是否轮换。
2. Codex App 实际使用 HTTP/SSE 还是 WebSocket，是否请求 `/responses/compact`。
3. App 侧模型目录从哪里读取，切换模型时是否重发完整历史。
4. 上游对 `Accept-Encoding: identity` 的实际响应行为。

以上均需要真实账号或真实客户端，属于看板中的“准备真实账号与 App 验收范围”审查门，不能以 mock 结论代替。

## 5. 任务调整记录

- P0（核验透传契约与运行时能力）：在本次范围内完成并结清，剩余为鉴权契约与待实测项。
- P3 透传实现：收敛为“复用现有转发路径 + 鉴权注入 + 模型路由”，不再要求新增独立透传管线。
- P3 socket 验证：降级为可选回归，仅在真实 App 验收发现传输问题时才需要。
- WebSocket 中继：用户明确不需要。`src/services/codex/` 不实现 WS 中继，看板中的相关实现与验收要求已移除；2.3 仅作为运行时能力记录保留。

## 6. 已实现的鉴权组件（P2）

| 文件 | 职责 |
|---|---|
| `src/services/codex/oauth.ts` | OAuth 常量、PKCE(S256)、授权 URL、code 交换、refresh、ID token 身份解析 |
| `src/services/codex/callback-server.ts` | 仅监听 `127.0.0.1` 的授权码回调服务，含 state 校验与超时 |
| `src/services/codex/auth-manager.ts` | 提前刷新、singleflight、refresh 轮换、凭据版本一致性 |
| `src/lib/codex-credentials.ts` | 独立档案读写、原子替换、Profile 校验、跨进程锁入口 |
| `src/lib/codex-profile-lock.ts` | 基于锁文件的跨进程互斥，含超时与失效回收 |
| `src/codex-auth.ts` | `codex-auth login/status/logout` 命令 |

### 6.1 刷新与一致性规则

1. 访问令牌剩余有效期低于 60 秒（可注入时钟）时，请求前刷新。
2. 同一进程内并发请求共享一次刷新（singleflight），20 并发只消耗一次 grant。
3. 刷新写入前在档案锁内重读凭据：若 revision/令牌已变化（另一进程登录或刷新过），放弃写入并采用磁盘上的版本，避免丢更新与复活已退出档案。
4. 刷新响应缺少 refresh token 时保留旧值；缺少 ID token 时保留旧的身份声明。访问令牌与 account ID 同属一个 revision。
5. 网络失败、429、5xx 归类为“暂时不可用”，保留既有凭据并允许下次重试；`invalid_grant`/`invalid_client`/`access_denied` 归类为“需要重新登录”，并按凭据指纹快速失败，避免反复消耗已撤销的 grant。凭据文件本身不删除，`status` 仍可描述它。
6. `logout` 与登录同样在档案锁内执行，因此“刷新写回”与“退出删除”不会交错；在途刷新发现文件已删除时直接失败，不会重建凭据。
7. 每次取用身份都重新读取档案，不使用长期内存缓存，退出后无法继续用旧令牌。

### 6.2 已知限制

- Windows 上 `chmod`/`mode` 不生效，凭据目录的访问控制依赖用户 profile 目录的默认 ACL（与 P2 报告一致）。
- 刷新失败只做分类与快速失败，不自动重发推理请求；上游 401 的处理留给 P3 网关层。

## 7. 配置、路由与启动（P1）

### 7.1 `providers.codex`

| 字段 | 默认值 | 说明 |
|---|---|---|
| `enabled` | `false` | 缺省关闭，旧配置无需迁移 |
| `baseUrl` | `https://chatgpt.com/backend-api/codex` | 只允许该 origin，禁止把 ChatGPT 凭据发往第三方 |
| `models` | `[]` | 精确匹配的上游模型 ID，启用时至少一个 |
| `authProfile` | `default` | 凭据档案名，按安全文件名规则校验 |
| `transport` | `http` | 目前只接受 `http`，其他值校验失败 |

环境变量覆盖：`COPILOT_API_CODEX_ENABLED`、`COPILOT_API_CODEX_BASE_URL`、`COPILOT_API_CODEX_AUTH_PROFILE`，网关密钥使用独立变量 `COPILOT_API_GATEWAY_API_KEY`。

启用 Codex 时，以下情况在加载配置阶段直接失败：未配置模型、缺少网关密钥、`baseUrl` 不在 `https://chatgpt.com`、`authProfile` 不安全、`transport` 未实现。

### 7.2 模型路由

`resolveModelRoute` 顺序改为 **Codex 精确匹配 → DeepSeek 精确匹配 → Copilot 兜底**，且 Codex 命中时不解析别名、不改写模型名。命中但 `enabled=false` 时直接报错，不回退 Copilot。

`assertModelRoutingConflicts` 拒绝同一模型被两个上游服务：Codex 与 DeepSeek 列表重叠、与 Copilot 别名重叠、与已加载的 Copilot 目录重叠、自身重复。静态部分（别名、DeepSeek、重复）在配置加载时校验；与 Copilot 目录的重叠在目录加载完成后补校验。

### 7.3 启动流程

1. 先加载运行时配置（含全部 provider 校验），再执行目录初始化与 provider 引导。
2. `bootstrapProviders` 只在相应 provider 启用时执行副作用：Codex 只创建凭据目录，Copilot 才走 GitHub token / Copilot token / 模型目录。仅 Codex 安装不会访问 GitHub 或 Copilot 接口。
3. 缺少 Codex 登录不再是启动错误：服务照常启动并打印提示，请求由 P3 网关层拒绝（`503 codex_login_required`）。
4. 默认绑定 `127.0.0.1`，可用 `--host` 显式对外监听。这是相对旧版本的**行为变化**（此前 srvx/Bun 默认绑定 `0.0.0.0`），因为网关持有 ChatGPT 凭据，默认收敛到 loopback。

### 7.4 尚未实现（交给 P3）

- ~~`/responses` 的 Codex 分支目前显式抛错 `Codex provider forwarding is not implemented yet`~~ → P3 已实现，见第 8 节。

## 8. Codex HTTP/SSE 透传（P3）

### 8.1 实现位置

| 文件 | 职责 |
|---|---|
| `src/services/codex/forward-responses.ts` | 目标 URL 与请求头构造、原始 body 与流转发 |
| `src/routes/responses/codex-passthrough.ts` | 网关密钥校验、本地错误映射 |
| `src/routes/responses/handler.ts` | `codex` 分支与 `/responses` 其余流程并列，复用同一响应交付 |
| `src/services/codex/auth-manager.ts` | 新增进程级共享管理器 `getCodexAuthManager()`（并发请求共享一次刷新） |

没有新增独立透传管线：Codex 分支沿用同一个 handler 结构、同一份响应头白名单（`cache-control`、`content-type`、`openai-processing-ms`、`x-request-id`）、同一个 `Response` 交付路径与同一个 `forwardError` 兜底。

### 8.2 请求处理顺序

1. 读取原始 body（`ArrayBuffer`），仅解析副本取 `model` 用于路由。
2. 命中 Codex 模型后，先校验网关密钥，再取凭据快照。
3. `POST {baseUrl}/responses`，`redirect: "manual"`，body 未做任何改写。
4. 上游响应原样交给共享交付路径；Codex 分支不参与 SSE item-ID 规范化。

### 8.3 请求头策略

| 类别 | 处理 |
|---|---|
| `authorization` | 替换为 `Bearer <access_token>` |
| `chatgpt-account-id` | 由凭据快照写入；快照无 account id 时删除 |
| `cookie`、`proxy-authorization`、`x-api-key` | 一律不转发（客户端传入值不生效） |
| `connection` 及其列出的头、`keep-alive`、`te`、`trailer`、`transfer-encoding`、`upgrade`、`host`、`content-length` | 不转发，交给传输层 |
| `accept-encoding` | 强制 `identity`（见 8.4） |
| 其他端到端头（`session-id`、`x-codex-*`、`version` 等） | 原样转发，不伪造 `User-Agent`/`Originator` |

### 8.4 压缩处置（对应 2.2 的陷阱）

采用"强制 `accept-encoding: identity`"这一种方式：既避免上游返回压缩实体，也避免 Bun fetch 解压后仍保留 `content-encoding`/压缩后 `content-length` 的错配。此外共享响应头白名单本身不包含压缩头，因此即使上游仍压缩，客户端也不会读到"标称 gzip 的明文"。

### 8.5 本地错误映射

| 情况 | 状态 | code |
|---|---|---|
| 网关密钥缺失或不匹配 | 401 | `gateway_unauthorized` |
| 无可用 Codex 凭据（未登录、`invalid_grant`） | 503 | `codex_login_required` |
| 刷新暂时失败（网络、429、5xx） | 503 | `codex_auth_unavailable` |
| 上游 401/429/5xx | 原样返回 | 上游响应体 |

网关密钥只保护 Codex 路由；Copilot/DeepSeek 路由保持原有的无鉴权访问方式。上游永不看到网关密钥。

### 8.6 观测结果

```text
bun test tests/codex-passthrough.test.ts
 16 pass, 0 fail
bun test
 173 pass, 1 skip, 0 fail (20 files)
bun run typecheck / bun run lint / bun run build
 全部通过
```

| 验收项 | 观测 |
|---|---|
| 模型命中 | `model=codex-test-model` → 请求发往 `https://chatgpt.com/backend-api/codex/responses`，body 字节与请求完全一致（含空白、多字节文本、未知字段） |
| 模型未命中/禁用 | 未配置的模型仍走 Copilot（回归用例）；列在 Codex 但 `enabled=false` 时报 `Codex provider is disabled`，不发任何上游请求 |
| 鉴权头覆盖 | 上游 `authorization` 为凭据 access token，客户端传入的同名头被替换；快照无 account id 时上游看不到 `chatgpt-account-id` |
| 凭据不外发 | 客户端 `cookie`、`proxy-authorization`、`x-api-key` 均不出现在上游请求头中 |
| 地址与重定向 | 上游 URL 固定为配置 baseUrl + `/responses`；`redirect: "manual"` |
| `Connection` 语义 | `Connection: x-hop-header` 时该头被剥离 |
| 压缩头 | 上游返回 `content-encoding: gzip` + `content-length: 58` + 明文实体时，客户端响应既无压缩头，实体为明文；上游请求头 `accept-encoding: identity` |
| SSE | 上游 SSE 事件（含 `response.output_item.added`/`response.completed`）字节级一致，无补帧、无 ID 改写 |
| 上游错误 | 401/429/500 原样返回状态与实体，且只发起一次上游请求 |
| 未登录 | 503 `codex_login_required`；刷新暂时失败为 503 `codex_auth_unavailable`；两者都不发上游请求 |
| 现有 provider | Copilot 路径仍无鉴权要求、DeepSeek 测试无回归 |

补充说明：上游 3xx 不会被跟随（`redirect: "manual"`），返回给客户端的是共享响应头白名单内的头，因此 `location` 不在其中。这是"不跟随重定向"的直接结果；如需把 3xx 透传给客户端并保持可跟随，应在 P6 审查时单独决策，不在本次改动范围。

## 9. 流式交付与取消的定向回归（P3 验证）

### 9.1 与既有 Copilot 路径的一致性

Codex 分支没有改动传输机制：

- 响应实体仍是上游 `ReadableStream`，经同一个 `new Response(upstream.body, {status, statusText, headers})` 交付；
- 取消仍由 `c.req.raw.signal` → `fetch(..., {signal})` 传递，沿用 Copilot 分支的同一行代码；
- 响应头仍走同一份白名单；Codex 不参与 SSE item-ID 规范化（该步骤只在 `provider === "copilot"` 时执行）。

对照组是报告 2.1 的运行时探测结论（srvx + Bun：首块 3ms 下发、下游 abort 同时触发网关与上游 `request.signal`、上游 `ReadableStream.cancel()` 被调用）。第 2.1 节的结论仍然有效，因为运行时版本与转发代码路径均未改变。

### 9.2 本次改动后的定向回归

新增 `tests/codex-stream-transport.test.ts`，通过 `Bun.serve` 监听真实 loopback socket，客户端用真实 `fetch` 访问 `/v1/responses`，上游用可控流替代（上游 URL 固定为 chatgpt.com，不能指向本地 endpoint，因此上游侧是可控流而非本地 socket）：

| 观测项 | 结果 |
|---|---|
| 上游未结束时客户端是否已收到首块 | 是，`data: first` 到达后才关闭上游流，说明没有缓冲整包 |
| 客户端 abort 是否传导到上游 `signal` | 是，`init.signal.aborted === true` |
| 客户端不读取时上游是否被反压 | 是，`controller.desiredSize <= 0` 时停止入队，远早于 16MB 上限 |
| 分块顺序与内容 | 逐块一致，无补帧、无改写 |

```text
bun test tests/codex-stream-transport.test.ts
 3 pass, 0 fail
bun test
 176 pass, 1 skip, 0 fail (21 files)
bun run typecheck / bun run lint
 通过
```

未新建 socket 测试框架，也未重复运行 `scripts/codex-probes/http-transport.ts` 的完整探测：转发代码路径与运行时版本未变，只有定向回归是必要的。真实 ChatGPT 上游在真实网络下的取消与背压表现仍属于审查门之后的实测项。

## 10. 模型目录与使用说明（P4）

### 10.1 网关 `/models` 与 App catalog 的分工

| 路径 | 决定什么 | 数据来源 |
|---|---|---|
| `GET /models`、`GET /v1/models` | 网关当前能路由哪些模型 | 运行时配置（启用的 Codex 模型、启用的 DeepSeek 模型、Copilot 目录） |
| `model_catalog_json` → `codex-models.json` | Codex 模型菜单里能看到哪些模型 | 启动时生成：上游 catalog + `codex-models-custom.json` |

两者是不同的服务对象，不能互相替代：目录只是元数据，不含端点、密钥与鉴权；`/models` 只发布真正可路由的模型。因此 Codex provider 关闭时 `/models` 不含任何 Codex 条目，禁用模型也不会以“可用路由”的形式对外公布。

### 10.2 改动

| 文件 | 变更 |
|---|---|
| `src/lib/codex-models.ts` | 新增 `codexModelCapabilities`、`loadCodexCatalog`、`buildCodexModelEntries`、`findCodexCatalogGaps`；能力字段走白名单，逐字段校验，坏值退化为缺省 |
| `src/routes/models/route.ts` | 仅在 `providers.codex.enabled === true` 时发布 Codex 条目，并附带目录中存在的能力元数据 |
| `src/start.ts` | Codex 启用时检查目录覆盖率，缺失模型打印一次警告并给出修复路径 |
| `config.example.json` | 补上默认关闭的 `providers.codex` 示例（不含任何秘密） |
| `tests/codex-models.test.ts`、`tests/models-route.test.ts` | M01 覆盖：条目结构、能力白名单、缺失目录容错、覆盖率报告、`/models` 与 `/v1/models` 一致、provider 关闭时不发布 |
| `CODEX_PASSTHROUGH_LOGIN_USAGE_CN.md` | 新增使用说明（第 3–7 节为可执行配置，第 8 节单列未实测与未实现项） |

设计取舍：

1. **不合成目录条目**。配置里出现但目录中没有的模型仍然可路由（`/models` 会列出它），只是 App 菜单看不到；直接生成一条只有 `slug` 的捏造条目会污染 Codex 的模型定义，因此改为启动期警告。
2. **身份字段由配置决定，能力字段才来自目录**。目录是外部输入，只允许补充描述性元数据，不能反向影响 `id`/`owned_by`，也就不可能通过改目录把请求引到别处。
3. **目录读取失败不阻塞服务**。缺失、损坏或尚未生成的目录只会让条目退化为只有身份的形态。

### 10.3 验证结果

```text
bun test tests/codex-models.test.ts tests/models-route.test.ts
 18 pass, 0 fail
bun test
 185 pass, 1 skip, 0 fail (22 files)
bun run typecheck
 通过
bun run lint
 通过
bun run build
 通过
```

离线刷新不损坏目录仍由既有用例覆盖（网络错误、超时、HTTP 错误、非法 JSON、非法 schema 五类失败后 `codex-models.json` 保持原内容且无临时文件残留）。compact 未实现，`tests/codex-compact.test.ts` 与 M02 相应留到 P5 按实测决定；使用说明第 8 节已明确标注该能力当前不可用。

## 11. HTTP compact 的按需判定（P5）

**结论：Skipped: HTTP compact not required or already covered。**

依据：

1. 真实客户端（Codex CLI v0.153.4，provider 指向本网关，模型 `gpt-5.6-luna`）完成两轮请求，其中一轮包含一次 `exec` 工具调用的往返；网关日志中只有 `POST /v1/responses`，没有出现 compact 请求。
2. 网关当前挂载的路径为 `/responses` 与 `/v1/responses`；`POST /v1/responses/compact` 实测返回 404，即未实现、也没有被既有路径覆盖。
3. 本看板的范围修正把重点限定在鉴权注入与既有 HTTP Responses/SSE 透传，未出现“前置 HTTP 接入实际需要 compact”的证据。

因此不新增实现。若后续出现真实 compact 请求，需要把 `/responses/compact` 转发到同一 Codex HTTP endpoint，并复用同一份凭据管理与网关鉴权；届时补 M02 定向测试与一次获准的实际验证。

## 12. 交付检查单（P6）

### 12.1 改动清单

新增：

| 文件 | 作用 |
|---|---|
| `src/codex-auth.ts` | `codex-auth login/status/logout` CLI |
| `src/services/codex/oauth.ts` | 授权 URL、PKCE、token 交换与刷新 |
| `src/services/codex/callback-server.ts` | loopback 回调监听、状态校验、超时与清理 |
| `src/services/codex/auth-manager.ts` | 提前刷新、singleflight、跨进程一致性 |
| `src/services/codex/forward-responses.ts` | 目标 URL 与请求头构造、原始 body 转发 |
| `src/routes/responses/codex-passthrough.ts` | 网关密钥校验与本地错误映射 |
| `src/lib/codex-credentials.ts`、`src/lib/codex-profile-lock.ts` | 凭据存储、权限、原子替换与档案锁 |
| `tests/codex-*.test.ts`、`tests/models-route.test.ts`、`tests/start.test.ts`、`tests/support/async-errors.ts` | 自动化测试 |
| `scripts/codex-probes/` | loopback 运行时探测脚本（历史探测，非交付要求） |
| `CODEX_PASSTHROUGH_LOGIN_USAGE_CN.md` | 使用说明 |
| `CODEX_PASSTHROUGH_LOGIN_IMPLEMENTATION_REPORT_CN.md` | 本报告 |

修改：`src/lib/runtime-config.ts`（`providers.codex` schema、默认值、环境变量、启用校验）、`src/lib/model-routing.ts`（Codex 精确路由与冲突检查）、`src/lib/paths.ts`（凭据目录）、`src/lib/state.ts`（鉴权管理器注入点）、`src/main.ts`（注册子命令）、`src/start.ts`（引导、就绪与目录覆盖提示、默认 loopback）、`src/routes/responses/handler.ts`（codex 分支与共用交付路径）、`src/routes/models/route.ts`（Codex 条目）、`config.example.json`（默认关闭的示例）、相关测试。

### 12.2 实际验证：实测与 mock 的区分

| 结论 | 类型 | 依据 |
|---|---|---|
| 浏览器登录、凭据落盘、`status` 脱敏输出、跨重启复用 | **实测** | 操作者在浏览器完成登录；`codex-auth status` 输出 logged in / 到期时间 / 脱敏邮箱与账号；重启网关直接 `Codex provider ready` |
| 鉴权注入与上游接受 | **实测** | 真实 Codex CLI v0.153.4 经网关请求 `gpt-5.6-luna`，网关日志 `200`，客户端输出 `LUNA-PING-1` |
| 工具调用与结果回传 | **实测** | 同一次真实会话中的 `exec` 工具调用，两次上游请求均 200，客户端输出 `TOOL-OK` |
| 网关鉴权与错误路径 | **实测** | 无密钥/错误密钥 401 `gateway_unauthorized`；未登录档案 503 `codex_login_required` 且不阻塞启动；未配置模型 500 且不回退；compact 404 |
| 透传字节保真、SSE 分块、取消与背压 | 自动化（socket/mock） | `tests/codex-passthrough.test.ts`、`tests/codex-stream-transport.test.ts`（真实 loopback socket，上游为可控流） |
| 并发刷新、轮换、invalid_grant、logout 竞争 | 自动化（mock 时钟与注入 fetch） | `tests/codex-auth-manager.test.ts`、`tests/codex-credentials.test.ts` |
| OAuth 常量与回调校验 | 自动化（mock fetch） | `tests/codex-oauth.test.ts`、`tests/codex-callback.test.ts` |
| 模型目录与服务发布 | 自动化 + 实测 | `tests/codex-models.test.ts`、`tests/models-route.test.ts`；实测 `/models` 返回带能力元数据的 luna 条目 |
| 跨上游 A→B→A 切换 | **未验证（经确认不适用）** | 操作者限定只用 `gpt-5.6-luna`，未启用第二上游 |
| 令牌到期刷新与重新登录 | **未验证（未触发）** | 本次凭据有效期至 2026-09-22，未到期 |
| 桌面 App provider 菜单 | **未验证** | `desktop-model-providers.json` 不存在，补丁未安装；本轮用 CLI + `-c` 覆盖验证 |

### 12.3 检查结果

```text
bun test           185 pass, 1 skip, 0 fail (22 files)
bun run typecheck  通过
bun run lint       通过（--cache，0 error）
bun run build      通过（dist/main.js）
bun dist/main.js codex-auth --help  输出 login/status/logout，退出码 0
```

基线失败：无。既有失败与本次新增失败未混在一起；`1 skip` 是 Windows 下无法验证 POSIX 0600 权限的既有用例。

### 12.4 限制

1. ChatGPT 凭据只能发往 `https://chatgpt.com`，其他 origin 在配置层拒绝。
2. 网关默认只监听 `127.0.0.1`；对外暴露需要 `--host` 并自行承担风险。
3. 推理请求不重试；上游 401/429/5xx 原样返回。
4. 不做协议转换、不做历史迁移、不实现 WebSocket 与 compact（compact 判定见第 11 节）。
5. 真实上游的取消与背压只有 loopback socket 级证据，没有真实网络下的长流观测。

### 12.5 回退

1. 配置层：把 `providers.codex.enabled` 置为 `false`（或删除该段）即回到旧行为；旧配置不含该段时默认关闭，无需迁移。
2. 客户端层：移除 `~/.codex/config.toml` 中的自定义 provider 与 `model_catalog_json`，恢复备份即可。
3. 凭据层：`bun run ./src/main.ts codex-auth logout --profile <name>` 删除本地凭据（不撤销服务端授权）。
4. 代码层：本功能集中在独立的新文件与上述若干文件的 Codex 分支，回退可按提交整体 revert；不需要改动既有 Copilot/DeepSeek 行为。
