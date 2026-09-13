# copilot-api 接入现有 Antigravity 实现的最小方案

日期：2026-09-13。本文基于当前源码检查，属于实施方案，本轮未修改运行代码，也未重新进行真实调用。

## 1. 现状与失败原因

目前有两条尚未连接的链路：

```text
Codex → copilot-api /v1/responses → model-routing → Copilot 上游
                                               ↑ Gemini 也落入此处

独立测试 → antigravity-responses adapter → Antigravity 鉴权代理 → Cloud Code
             ↕ GenerateContent 转换器
```

| 已有实现 | 当前作用 | 接入时的处理 |
| --- | --- | --- |
| `src/services/antigravity/models.ts`、`codex-models-custom.json` | 提供 low / medium / high 三个 Gemini 目录条目 | 保留条目，补足路由归属 |
| `src/start.ts` | 无条件将 Antigravity 条目加入 extension catalog | 与 provider 启用状态对齐 |
| `src/lib/model-routing.ts` | 仅有 codex / copilot / deepseek；未匹配模型默认到 copilot | 增加 antigravity 归属 |
| `src/routes/responses/handler.ts` | 仅调用三个现有上游 | 增加 Antigravity 分支 |
| `src/services/generate-content/convert.ts` | Responses 请求转 GenerateContent，返回工具身份映射 | 原函数复用 |
| `src/services/generate-content/stream.ts` | GenerateContent SSE 转 Responses SSE，含 Cloud Code 响应包装、工具与状态载体 | 原函数复用 |
| `src/services/antigravity/auth.ts` | 网页 OAuth、凭据文件、刷新、project 发现 | 复用登录与 `AntigravityCredentialStore.current()` |
| `src/services/antigravity/proxy.ts` | Node HTTP 透明转发，注入账号 bearer 与 Antigravity UA | 保留独立原生代理能力 |
| `scripts/antigravity-responses.ts` | Node HTTP adapter，组 envelope 并调用本地 51234 代理 | 将可复用的 envelope 组装移到服务模块，脚本继续可用 |

模型目录不负责网络路由。当前三个 Gemini 名字能显示，不代表 `/v1/responses` 能调用它们；按当前路由代码会发送给 GitHub Copilot。这与此前调试记录中的 `model_not_supported` 一致。

此前 `ANTIGRAVITY_GENERATE_CONTENT_RESPONSES_REPORT_CN.md` 记录独立链路的 medium 文本、续轮和工具调用通过；这不是 copilot-api 接入成功的证据，也不证明三个档位和 Codex 工具闭环都通过。报告中的“无服务端历史缓存”表述过强：该接口要求客户端回传历史，不等于不存在上游缓存。

## 2. 推荐结构：进程内组合已有能力

```text
Codex（现有 copilot-api provider，HTTP Responses）
  → copilot-api /v1/responses
  → antigravity 路由
  → createAntigravityResponses
      1. 调用纯请求转换器
      2. 读取/刷新 Antigravity 凭据，取得 project_id
      3. 组装 Cloud Code envelope，附加 bearer 与既有 UA
      4. 请求 daily-cloudcode-pa.googleapis.com
         /v1internal:streamGenerateContent?alt=sse
      5. 调用纯 SSE 转换器，返回 Web Response
  → Codex
```

采用进程内接入，避免为了调用已有函数再常驻 51234、51235 两个端口。独立登录命令和透明代理仍可单独运行，copilot-api 运行不依赖它们的监听端口，也不依赖 CLIProxyAPI 进程。

解耦以模块职责和依赖方向保证：转换器只收发协议对象/字节，不接触登录、网络、模型目录、配置或凭据；接入层负责组合；鉴权模块不导入转换器。独立透明代理仍原样转发原生请求，不在其中加入 Responses 转换。

暂不为此提取通用 provider 框架或重写 Node 代理为 Fetch 代理。进程内请求复用凭据 store、endpoint 和 UA 常量；少量 HTTP 请求组装无需变成新的通用传输抽象。

## 3. 最小修改范围

### 3.1 配置与路由

在现有 `runtime-config.ts` schema、默认值和合并逻辑中加入 `providers.antigravity`，仅需 `enabled` 与 `credentialFile`。默认关闭；本机配置启用。复用既有凭据文件，不增加 API key、环境变量、key 文件或第二套登录档案。

既有登录脚本默认凭据路径为 `~/.cli-proxy-api/antigravity.json`；这只是兼容历史的存储路径，不意味着必须运行 CLIProxyAPI。实施时确认本机实际使用的文件路径并指向它，不复制多份 token。

对外只发布 `gemini-3.8-flash-tiered`。接入层从请求的 `reasoning.effort` 取得 `low`、`medium` 或 `high`，并只在发往 Antigravity 时构造 `gemini-3.8-flash-<effort>` 上游模型名；缺省 effort 使用模型定义的 `medium`。该映射和目录定义同源，避免两份名单漂移。这是应用层模型归属，不在纯转换器里加白名单。不要将所有 `gemini-*` 都劫持到 Antigravity，Copilot 自身可能提供其他 Gemini。

扩展 `ModelProvider`，在 Copilot 默认分支之前精确解析此 ID；配置禁用时明确报 provider 未启用，不回退 Copilot。检查优先执行的 `published.entries`，保证该条最终路由不会被已有发布项覆盖。启用时发布该条，关闭时不发布；如与其他显式模型归属冲突，按现有路由机制处理。

无需新增 `(antigravity)` 后缀体系；保持单一公开 ID。`reasoning.effort` 仅映射已知的 low、medium、high 到 Antigravity 的模型后缀；不硬编码 high，也不猜测其他 thinking budget。

### 3.2 新增薄接入函数

新增 `src/services/antigravity/create-responses.ts`，供 handler 调用，输入请求体、请求头、取消信号及已初始化的凭据 store，返回 `Promise<Response>`。

复用 `convertResponsesRequestToGenerateContent` 的 `{ body, tools }`，每个请求新建 `createGenerateContentEventStream({ requestedModel, tools })`。将脚本中的 `buildCloudCodeEnvelope` 移到该服务目录内的小模块，脚本与服务共同导入，禁止生产模块反向依赖 `scripts/`。

envelope 的 `model` 使用由 effort 得到的上游后缀，`project` 取登录凭据中的 `project_id`。缺失时给出可定位错误并要求通过已有登录/project 发现补全，不沿用脚本的 `aicode-consumers` 默认值作为账号项目事实。`requestId` 每请求唯一；请求体 `userAgent`/`requestType` 与 HTTP UA 是不同字段，沿用现有约定和常量。

成功响应按块转换并输出，不先收完整 SSE；将取消传到 fetch 和 reader。上游非 2xx 保留状态与完整错误体；流中断必须成为失败，不能吞异常后正常结束，更不能伪造 `response.completed`。完成状态由现有转换器判断。

本次 Codex 接入以 `stream:true` 为验收契约。现有独立 adapter 无条件返回 SSE，不能据此宣称支持 `stream:false`：对非流式请求明确返回暂不支持的错误，不悄悄更换响应协议；实现 JSON 聚合不纳入本次最小修复。

### 3.3 handler 与启动

`handler.ts` 增加 antigravity 分支，并传递原始 headers 与取消信号。在启动时建立一个凭据 store，复用其刷新并发合并能力，不每请求重新建 store。凭据错误只影响 Antigravity 请求，不阻止其他 provider 服务。

保留现有仅针对 Copilot 的 SSE ID 归一化条件，不让它改写转换器生成的调用 ID 或状态载体。更新模型目录启动逻辑与必要的 runtime config 测试夹具；不重构其他 provider。

## 4. 上下文连续性与当前 adapter 差距

- 当前独立 adapter 只识别 `x-session-id`，缺失就用时间戳，每轮可能变化。实施时核对本机 Codex 实际发送的 session 字段，建立明确映射，优先复用稳定的客户端会话标识；不要假定 Codex 已发送 `x-session-id`。缺少稳定标识时不宣称跨轮 session 连续，也不用内容哈希冒充会话 ID。
- `sessionId` 不是历史数据库，也不能保证缓存命中。续轮需要客户端回传完整历史与 `gcparts1.` 状态载体。保留 `thoughtSignature`、原始 parts、工具调用 ID、命名空间和工具结果。
- 转换器已拒绝无法解析的 `previous_response_id` / `conversation` 引用；接入层不补数据库、不保留跨请求对话对象、不静默丢弃这些引用。
- 当前转换器仍有 `parallel_tool_calls:false`、reasoning effort 和文本格式等限制。真实 Codex 若触发限制，应按具体协议差异修复并补测试，不用禁工具、删请求字段或扩大应用校验来掩盖问题。
- 本地调试证据保留完整请求体、完整 SSE、状态载体和上游错误，不套用 handler 现有删除 `encrypted_content` 的日志摘要。只在测试记录层保存证据，不给纯转换器增加日志或录制职责。

## 5. 实施与验收顺序

1. **路由回归**：单一 ID 在启用/关闭场景准确归属；low、medium、high 分别得到正确上游模型名；目录与路由一致；普通 Copilot、DeepSeek、Codex source suffix 行为不变。
2. **接入层集成测试**：mock fetch + 凭据 store 验证实际 URL、模型后缀、project、UA、bearer、稳定 session、完整历史；回传分块 SSE，验证输出事件、状态载体与工具身份。覆盖 token 刷新、上游错误、取消和截断流。
3. **已有协议测试**：运行 `generate-content-request.test.ts`、`generate-content-stream.test.ts`、`antigravity-responses-adapter.test.ts`，迁移 envelope 后保持独立 adapter 可用；补充 handler 和启动配置回归。
4. **构建检查**：目标文件 lint、TypeScript、`bun run build`。记录既有失败与本次新增失败的区别。
5. **真实 copilot-api 调用**：启动本次构建，以单一模型分别带 low、medium、high effort 调用 4141；记录 provider、实际上游模型、上游目标、HTTP 状态和终止事件。不能用独立 adapter 成功替代这一项。
6. **真实 Codex CLI**：保持现有 copilot-api provider，以单一模型分别选择三个 effort 进行短文本测试；随后完成至少一组工具调用→工具结果→最终回复，以及同会话标记续轮。核对真实请求中的 session 和状态载体回传；不能只检查模型能回答“OK”。

验收证据需包含运行版本、公开模型、请求 effort、实际上游模型、路由、完整本地请求/响应文件与 CLI 结果。任一 effort 被上游拒绝，就明确记为失败；缓存指标未返回就记录“未观察到”，不能据 session 相同认定 cache hit。只有真实链路成功才能标接入完成。

## 6. 本次不需要做的工作

不修改 Codex provider 指向 CLIProxyAPI，不引入本地 API key，不重新做 OAuth，不增加常驻转发服务，不重写纯转换器，不增加会话数据库，不做 WebSocket 接入。此次真正缺少的是模型路由与进程内薄接入层，而非另一套代理系统。
