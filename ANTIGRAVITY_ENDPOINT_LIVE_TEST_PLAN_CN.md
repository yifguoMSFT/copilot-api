# Antigravity endpoint：现有实现的真实测试方案

日期：2026-09-13。状态：方案，尚未执行本方案中的真实测试。

## 1. 结论与范围

先验收已经实现的网页登录、凭据刷新和原生 HTTP/SSE 代理。测试必须经过本仓库的 `scripts/antigravity-proxy.ts`，真实上游使用 `https://daily-cloudcode-pa.googleapis.com`。使用 Bun 测试程序调用代理，不以 curl 直连上游的成功代替实现验收。

代理继续只负责登录、鉴权相关 header 注入与转发；Cloud Code 请求体由测试客户端提供。测试客户端拼一个原生请求，不是新增协议转换器，也不是给代理加入 envelope 组装。

现有 Responses ↔ Interactions 转换器不能直接接到当前已验证的 Antigravity endpoint。此轮如能完成原生代理测试，只能报告“Antigravity 登录与原生代理通过”，不能报告“转换器或 Codex 接入通过”。本方案不修改业务代码、转换器、既有路由、provider 或用户 Codex 配置，不引入数据库、会话服务、自动 fallback、协议白名单。

## 2. 已核对的现状

| 实现/证据 | 实际能力与限制 |
| --- | --- |
| `src/services/antigravity/auth.ts` | 授权码网页登录、回调 state 校验、token 交换、账号信息与 project 发现、凭据读写、过期前刷新 |
| `scripts/antigravity-proxy.ts` | 已有 `login`、`serve` 入口；默认监听 `127.0.0.1:51234`，默认上游为 daily Cloud Code |
| `src/services/antigravity/proxy.ts` | 使用 credential store 注入 Authorization 和 Antigravity UA；方法、原始路径/query、正文透传，响应以 pipe 转发；不解析模型协议 |
| `src/services/interactions/convert.ts`、`stream.ts` | 转换公开 Responses/Interactions 请求、响应和流事件，不处理 Cloud Code `request.contents` 与 `candidates` |
| `scripts/interactions-codex-live.ts` | 面向公开 Google `v1/interactions` 的测试桥；修改 URL 不会使报文变成 Cloud Code 协议 |
| `tests/antigravity-proxy-converter-integration.test.ts` | 本地 mock 实现 `/v1beta/interactions`，证明模块可以组合；不证明 Antigravity 提供此 API |
| 既有 contract/report 的历史实测记录 | daily 的生成与流式调用曾返回 200；prod 生成曾返回 429；已探测的 Interactions 路径返回 404；公开 Interactions 对该 OAuth 凭据返回 scope 403。本轮未重新执行，不能写成当前验收结果 |

404 只证明所测路径在当次请求条件下不可用，不能据此断言所有未知 Antigravity Interactions 接口都不存在。但目前没有可用于接入的原生 Interactions endpoint 证据，不能继续猜路径。

源码参考：`reference/CLIProxyAPI/internal/runtime/executor/antigravity_executor_request.go` 的 `buildRequest`、`geminiToAntigravity` 及 `internal/misc/antigravity_version.go`；另外参考 `../home-server/llm-gateway/docs/antigravity-phase-1-report.md`。只采用原生 endpoint、header 与 envelope 依据，不运行 CLIProxyAPI 替代本仓库代理，也不搬入其转换、清洗或重试逻辑。

## 3. 实际调用链

```text
用户浏览器 → 本仓库 login → Google OAuth 回调/token/project → 本地凭据
                                                            ↓
Bun 原生请求测试 → 本仓库 serve → credential store → Antigravity endpoint
               ← 原始 JSON / SSE ← 原始上游响应
```

新增一个独立、显式执行的 `scripts/antigravity-proxy-live-test.ts` 即可。它负责启动现有 serve 子进程、发送原生请求、断言和保存结果、退出时停止自己启动的子进程。它不自行实现登录、刷新或转发，也不默认纳入 `bun test`，避免普通离线测试触发网络。

计划执行入口（测试脚本尚待实现）：

```powershell
# 必须先真实走一次网页登录；入口会输出授权 URL，用户在浏览器授权。
bun scripts/antigravity-proxy.ts login --credential-file "$env:USERPROFILE/.cli-proxy-api/antigravity.json"

# 待新增脚本实现后执行，复用上述同一凭据文件。
bun scripts/antigravity-proxy-live-test.ts --credential-file "$env:USERPROFILE/.cli-proxy-api/antigravity.json"
```

这就是现有入口默认的正式凭据位置；不再增加 key 文件、placeholder 或多层配置。测试脚本只需凭据文件参数，端点直接采用现有常量。实际执行时如默认端口被占用，报告冲突或显式使用现有 `--port` 参数，不停止未知进程。

## 4. 请求依据与数据

生成使用 `POST /v1internal:generateContent`；流式使用 `POST /v1internal:streamGenerateContent?alt=sse`，均通过本地代理访问 daily origin。元数据调用也先通过同一代理访问 `/v1internal:loadCodeAssist`、`/v1internal:fetchAvailableModels`。不能将这些请求发到 OAuth 的 userinfo 主机，也不使用公开 Gemini API key。

代理自动设置 `Authorization: Bearer <当前登录凭据>` 和代码中的 `ANTIGRAVITY_USER_AGENT`，当前值为 `antigravity/hub/2.9.1 darwin/arm64`。测试客户端只提供正常的 JSON Content-Type，不自行设置 UA 来掩盖代理注入问题。请求体中的 `userAgent: "antigravity"` 是另一个字段，不等于 HTTP UA。

原生文本请求骨架如下；动态值由测试客户端填入，不能直接把占位符发送上游：

```json
{
  "model": "<fetchAvailableModels 返回的实际模型 ID>",
  "userAgent": "antigravity",
  "requestType": "agent",
  "project": "<登录发现的 project_id>",
  "requestId": "agent-<每次请求的新 UUID>",
  "request": {
    "sessionId": "<同一测试会话保持稳定的 ID>",
    "contents": [
      {"role": "user", "parts": [{"text": "Reply with exactly pong."}]}
    ]
  }
}
```

执行前按上述参考源码核对 sessionId 格式与元数据请求体，不增加猜测字段。优先选择历史记录出现过的 `gemini-3.8-flash-medium`，但必须在本次模型列表中确认；若不存在，报告模型不可用，不能默默替换成其他模型或沿用公开 API 的 `gemini-3.8-flash` 别名。

## 5. 执行顺序与通过条件

| 顺序 | 操作 | 必须获得的证据 |
| --- | --- | --- |
| 1 登录 | 执行现有 login，打开其输出的 URL，用户完成授权 | 本次回调成功、进程退出 0、凭据落盘并含可用 access token 与 project_id；仅发现旧凭据不算网页登录通过 |
| 2 启动与元数据 | 测试脚本启动现有 serve，通过本地地址调用元数据 RPC | 启动进程确为本仓库入口；真实 200、project 与模型列表可读取；记录实际 origin、模型 ID |
| 3 非流式生成 | 发上述最小原生请求 | 200，原始响应内存在真实候选文本；按实际 envelope 定位 candidates，并校验目标文本、finishReason、usageMetadata；HTML 或 error 不算成功 |
| 4 流式生成 | 同模型调用 streamGenerateContent | 200 与 SSE Content-Type；收到完整原始 SSE、可解析生成内容并正常结束；记录首字节时间及读到的 chunk，不要求网络 chunk 对齐 SSE event |
| 5 客户端续轮 | 客户端保留首轮完整候选 parts，连同首轮 user 和新问题组成下一轮 contents；保持 sessionId、更新 requestId | 两轮真实成功；第二轮能使用首轮给出的随机标记；签名/思考字段如返回则原样保留；代理不保存历史、不产生父 ID |
| 6 刷新 | 用独立测试凭据副本，仅调整 expired 使现有 store 走刷新路径，启动独立代理后生成一次 | 真实 token 刷新成功、副本更新、生成成功；不手写 token 交换，不修改主凭据的到期时间，不把单纯旧 token 仍可用当刷新通过 |
| 7 上游失败 | 经代理发一条确定格式错误的原生请求 | 收到真实非 2xx 及完整上游错误；保持原生错误结构，不包装成 Responses/Interactions 错误。精确字节保真由离线测试补证 |

状态只使用“通过 / 失败 / 未执行 / 阻塞”。用户尚未完成授权时，登录仍是未完成；401/403、429、超时应保留真实状态和错误，不能标记通过或无限重试。元数据与生成分别报告，不把模型列表 200 当生成成功。

## 6. 透传、state 与缓存如何验证

真实上游用于验证凭据、产品面和正常请求链。精确透传使用已有 `tests/antigravity-proxy.test.ts`、`tests/antigravity-proxy-stream.test.ts` 的受控上游核对请求/响应字节、路径/query、断流和 header 行为；不能拿两次独立模型生成结果比较字节，它们本来可能不同。

续轮的完整历史由测试客户端维护。保持 `sessionId` 只证明身份字段延续；上下文成功还要通过第二轮问答验证。`requestId` 每次更新，不把 `previous_response_id` 或 `previous_interaction_id` 强塞进 Cloud Code，也不捏造与这些 ID 等价的映射。

缓存只观察真实响应的 usage 字段，完整记录实际出现的 cached token 指标；没有指标或计数为零时，写“未观测到 cache hit”。不能由 sessionId 相同、响应更快或答对上一轮内容推断缓存命中。此轮不增加缓存实现或缓存命中的强制断言。

工具调用、签名等原生字段的精确转发由已有字节保真测试覆盖；若未做真实工具循环，不声称已完成工具端到端验证。Responses/Interactions state 转换仍由转换器自己的测试覆盖，不能以原生续轮替代。

## 7. 完整本地证据

每次运行写入一个独立的本地结果目录，例如 `%TEMP%/antigravity-proxy-live/<run-id>/`。保留完整请求体、响应体原始字节、SSE 字节、可获取的完整 headers、状态码、时间、stdout/stderr 与断言结果；不截断、替换或脱敏正文、签名、sessionId、project、工具数据。二进制可保存为原始文件，辅助 JSON 仅用于索引。

登录输出和凭据证据也在本地完整保留，避免报告声称有记录却只写 `<redacted>`。记录边界必须如实标注：测试客户端看到的是本地代理两端中客户端这一侧的 HTTP 数据；仅靠客户端日志看不到代理出站 Authorization。出站 header 的注入由已有受控上游测试核对，真实调用成功提供补充证据，不为抓取 TLS 新建中间人代理。

报告列出代码版本及未提交改动、命令、实际 endpoint/模型、逐项状态、完整证据路径。本文档不包含实际凭据。本次只编写方案，不能预填成功数字或沿用上一 agent 的 200 作为本轮结果。

## 8. 转换器与 Codex 的明确边界

当前缺口是报文协议，不是测试客户端的选择：Codex 输出 Responses，已有转换器输出公开 Interactions；已验证的 Antigravity 接口接受 Cloud Code envelope，输出 Cloud Code JSON/SSE。把现有测试桥的 upstream URL 换为 daily 或改掉路径，仍然无法完成转换。

所以本方案不运行一条注定报文不匹配的 Codex 命令冒充验收，也不在测试脚本里偷偷补第三套转换。转换器对 Antigravity 的真实验收标为“阻塞：没有已验证的兼容 Interactions endpoint”。

要继续 Codex 联调，须另行确定并实现独立的 Cloud Code 协议适配，或取得可用且报文兼容的 Antigravity Interactions endpoint 证据；两者均不属于本轮测试。无论后续采用哪种方式，代理仍不导入转换器。既有 mock 组合测试保留其离线意义，不再作为真实产品面可用的结论。

本轮完成标准：网页登录、原生生成/流、续轮、刷新与错误路径各有实际结果，受控透传测试有独立结果；失败项保持失败，未完成项保持开放。只有实际通过的能力可以验收，不能把整个“Interactions + Codex 接入”看板一并判为完成。
