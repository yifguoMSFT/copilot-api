# Antigravity `v1internal` 是否提供 interactions 上游的实测探测

## 结论

`daily-cloudcode-pa.googleapis.com/v1internal` **没有** `interactions` 系列方法。所有候选命名都返回 Google 前端的通用 HTML 404，与人工注入的“已知不存在方法”返回完全一致；而已知存在的方法返回的是 JSON 校验错误（400）或正常响应（200）。

因此 Antigravity 侧不存在可直接透传的 Interactions API。Interactions 协议只存在于公开 Gemini 主机（`generativelanguage.googleapis.com/v1beta/interactions`），CLIProxyAPI 也是这样区分的。给 Antigravity 用的转换路径只能是 `GenerateContent SSE ↔ Responses`。

## 探测方法

脚本：[scripts/antigravity-interactions-probe.ts](../scripts/antigravity-interactions-probe.ts)

```powershell
bun run scripts/antigravity-interactions-probe.ts
```

凭据沿用本机 CLIProxyAPI 登录态 `~/.cli-proxy-api/antigravity.json`（过期时自动 refresh）；请求头沿用代理实现的约定：`Authorization: Bearer <token>`、`User-Agent: antigravity/hub/2.9.1 darwin/arm64`、`Content-Type: application/json`。

关键点是校准，而不是猜测状态码含义：

- `v1internal:generateContent`：已知存在，返回 200。
- `v1internal:loadCodeAssist`、`v1internal:fetchAvailableModels`：已知存在，返回 JSON 400（方法被路由，载荷字段被校验）。
- `v1internal:thisMethodDoesNotExist`：人工注入的不存在方法，返回 HTML 404，作为“缺失方法”的基线。

缺失方法在这台主机上的表现是 Google 前端页面的 `<title>Error 404 (Not Found)!!1</title>`，正文为 HTML，不是 JSON。方法存在但载荷错误时返回的是 JSON `{"error":{"code":400,...}}`。两者的差别非常明确，不存在“404 但方法其实存在”的模糊区。

## 探测结果

| 候选 | 方法 | 状态 | 判定 |
|---|---|---:|---|
| `v1internal:generateContent` | POST | 200 | 存在（校准项） |
| `v1internal:loadCodeAssist` | POST | 400 JSON | 存在（校准项） |
| `v1internal:fetchAvailableModels` | POST | 200 | 存在（校准项） |
| `v1internal:thisMethodDoesNotExist` | POST | 404 HTML | 不存在（校准项） |
| `v1internal:interactions` | POST | 404 HTML | 不存在 |
| `v1internal:interactions?alt=sse` | POST | 404 HTML | 不存在 |
| `v1internal:streamInteractions` | POST | 404 HTML | 不存在 |
| `v1internal:createInteraction` | POST | 404 HTML | 不存在 |
| `v1internal:createInteractions` | POST | 404 HTML | 不存在 |
| `v1internal:generateInteraction` | POST | 404 HTML | 不存在 |
| `v1internal:streamInteraction` | POST | 404 HTML | 不存在 |
| `v1internal:interactions` | GET | 404 HTML | 不存在 |
| `v1internal/interactions`（路径风格） | POST | 404 HTML | 不存在 |
| `v1beta/interactions` | POST | 404 HTML | 不存在 |
| `cloudcode-pa.googleapis.com/v1internal:interactions` | POST | 404 HTML | 不存在 |
| `$discovery/rest?version=v1internal` | GET | 404 HTML | 未暴露发现文档 |
| `$discovery/list` | GET | 404 HTML | 未暴露发现文档 |

`$discovery` 未暴露，说明无法通过发现文档枚举方法清单，所以存在性判断完全依赖上面的路由校准。探测脚本对每个候选都落盘了完整未裁剪的响应正文，可逐一复核。

## 交叉验证

`reference/CLIProxyAPI` 侧的证据与实测一致：

- `internal/runtime/executor/antigravity_executor.go` 只登记了 `/v1internal:countTokens`、`/v1internal:streamGenerateContent`、`/v1internal:generateContent`；`sdk/cliproxy/antigravity_models.go` 追加 `/v1internal:fetchAvailableModels`；鉴权路径使用 `/v1internal:loadCodeAssist` 与 `/v1internal:onboardUser`。没有 interactions 路径。
- `internal/runtime/executor/antigravity_executor_interactions_test.go` 的用例名即为把 interactions 请求翻译成上游调用，并断言实际上游路径是 `/v1internal:streamGenerateContent`，同时断言原始 `input` 不会发给上游。也就是说 CLIProxyAPI 对 Antigravity 的 interactions 支持是“翻译到 generateContent”，不是原生透传。
- `reference/antigravity-sdk-python` 中出现的大量 “interaction” 都是 SDK 自身的会话/提问概念（hook、`AskQuestionInteractionSpec`、`AgentInteraction`），没有任何指向 `v1internal` 交互端点的调用。

## 模型目录侧证

`v1internal:fetchAvailableModels`（CLIProxyAPI 使用请求体 `{}`）返回 33 个模型的目录，包含 `supportsImages`、`supportsThinking`、`thinkingBudget`、`supportedMimeTypes`、`quotaInfo` 等字段。整个响应中没有任何 `interaction` 相关字段，也未声明 interactions 能力。目录与本机此前验证的 `gemini-3.8-flash-*` 档位一致，例如 `gemini-3.8-flash-medium` 为 `maxTokens: 1048576`、`maxOutputTokens: 65536`。

## 对现有设计的影响

原先为 Antigravity 设计的 `GenerateContent SSE ↔ Responses` 转换器仍是唯一可行路线；不存在“改走 interactions 透传即可省掉转换”的备选方案。之前反向的假设（Antigravity agent 使用自家 interactions API）被实测否定。

## 证据

最近一次完整运行（上文表格即来自该批次）：

```
%TEMP%\antigravity-interactions-probe\2026-09-13T07-49-35-966Z_13a716e4
```

目录内含每个候选的完整响应 `*.json` 以及汇总 `report.json`。同一轮探测在此之前还产生过 `2026-09-13T07-47-26-536Z_c89cd0f5`（含模型目录）与 `2026-09-13T07-46-58-266Z_8570e6dd`，结论一致。

复现命令（需外网）：

```powershell
bun run scripts/antigravity-interactions-probe.ts
```

## 局限

探测覆盖的是方法名与路径的注册情况，依赖前端 404 与 JSON 400 的语义差别。若 Google 之后以不同主机名、或在同一 `v1internal` 命名空间下按账号白名单开放新方法，本次结论需要重跑脚本核实。探测只使用 GET/POST 与 JSON 载荷，未尝试 gRPC 传输。
