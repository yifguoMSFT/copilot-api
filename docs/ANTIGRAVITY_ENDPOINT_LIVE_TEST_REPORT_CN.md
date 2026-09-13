# Antigravity endpoint 实测报告

## 1. 头部

| 项 | 值 |
| --- | --- |
| 日期 | 2026-09-13 |
| 分支 | `main` |
| 相关提交 | `e3b17c1`（Antigravity 代理指向 Cloud Code + Hub UA）；执行期间仓库被外部推进到 `1f13429`（归档看板、文档移入 `docs/`） |
| 对应看板 | `antigravity-endpoint-live-test.kanban.json` |
| 方案 | [[ANTIGRAVITY_ENDPOINT_LIVE_TEST_PLAN_CN.md]] |
| 新增实现 | `scripts/antigravity-proxy-live-test.ts`、`tests/antigravity-proxy-live-test.test.ts` |
| 证据目录 | `%TEMP%\antigravity-proxy-live\2026-09-13T00-54-14-548Z`（既有凭据）、`%TEMP%\antigravity-proxy-live\2026-09-13T00-55-55-926Z`（登录凭据） |

## 2. 结论

网页登录、凭据落盘与刷新、本地鉴权注入代理、Antigravity 自己的 Cloud Code 原生接口（`v1internal:*`）这条链路，本轮真实调用**全部通过**：两次独立运行各 7 项检查全部成功，没有失败项，没有用 curl 作为验收客户端。

Responses ↔ Interactions 转换器接入 Antigravity 的链路**仍未验证**，也不因本次结果而成立：Cloud Code 上游只接受 `v1internal:*` envelope，没有可用的 Interactions endpoint。本报告不对转换器、Codex 接入或工具/思考端到端循环作任何通过结论。

## 3. 执行方式

`scripts/antigravity-proxy-live-test.ts` 在进程内使用 `createAntigravityProxyServer` 启动与 `serve` 命令同一个代理实现，绑定随机 loopback 端口，然后由测试客户端自己构造原生请求经代理发往 `https://daily-cloudcode-pa.googleapis.com`。代理只替换 `Authorization` 与 `User-Agent`，方法、路径、query、请求体与响应体原样转发。

```powershell
# 真实网页登录（授权码流程，回调 http://localhost:51121/oauth-callback）
bun scripts/antigravity-proxy.ts login

# 测试 1：使用已有账号凭据
bun scripts/antigravity-proxy-live-test.ts --credential-file "$env:USERPROFILE\.cli-proxy-api\antigravity-tokyoblackboxanimesalon@gmail.com.json"

# 测试 2：使用本次登录产生的默认凭据
bun scripts/antigravity-proxy-live-test.ts --credential-file "$env:USERPROFILE\.cli-proxy-api\antigravity.json"
```

登录进程输出 `credential written: C:\Users\Jeff\.cli-proxy-api\antigravity.json`；该文件含 `access_token`、`refresh_token`、`project_id=aicode-consumers`、`email=tokyoblackboxanimesalon@gmail.com`、`expired=2026-09-13 01:55:41`。

## 4. 逐项结果

两次运行结果一致（模型 `gemini-3.8-flash-medium`，上游 `daily-cloudcode-pa.googleapis.com`）：

| 检查 | 状态 | 实测 |
| --- | --- | --- |
| `metadata.loadCodeAssist` | pass | 200；project `aicode-consumers` |
| `metadata.fetchAvailableModels` | pass | 200；33 个模型；`gemini-3.8-flash-medium` 在列表内 |
| `generate.nonStreaming` | pass | 200；`response.candidates[0].content.parts[0].text = "OK"`；`finishReason=STOP`；`modelVersion=gemini-3.8-flash`；usage 含 prompt/candidates/thoughts 计数 |
| `generate.streaming` | pass | 200；`content-type: text/event-stream`；2 帧；文本 `pong`；首字节到结束约 1966 ms |
| `generate.continuation` | pass | 200；第二轮复用第一轮 marker（`7ef0151e` / `ab5ec571`）；客户端自持完整历史并把上一轮 `candidates[0].content` 原样回传，`sessionId` 保持稳定、`requestId` 每轮新建 |
| `credential.refresh` | pass | 200；仅在证据目录内的凭据副本上强制过期并刷新，副本写回新的 `expired`（2026-09-13T01:54:21.473Z / 2026-09-13T01:56:01.788Z），主凭据未被该步骤改写 |
| `error.invalidRequest` | pass | 400；上游错误体原样透传，未被包装成 Responses/Interactions 错误 |

本地离线验证（同一 runner，受控 loopback 上游，无网络）：

```text
bun test tests/antigravity-proxy-live-test.test.ts \
         tests/antigravity-proxy.test.ts \
         tests/antigravity-proxy-entry.test.ts \
         tests/antigravity-proxy-stream.test.ts \
         tests/antigravity-auth.test.ts \
         tests/antigravity-proxy-converter-integration.test.ts
→ 49 pass / 0 fail（236 expect，6 文件）
bun run typecheck → 通过
```

离线用例断言：runner 经代理访问的是 `loadCodeAssist` / `fetchAvailableModels` / `generateContent` / `streamGenerateContent?alt=sse`，`interactions` 路径从未出现；代理注入的 `Authorization` 与 `User-Agent` 正确；刷新步骤不修改主凭据；上游不可达时逐项记录失败而不抛出。

## 5. 证据

每个请求写三份文件到证据目录：`<step>.request.json`（客户端实际发出的方法路径与请求体）、`<step>.response.bin`（原始响应字节）、`<step>.meta.json`（状态码、完整可见 headers、耗时）；最后写 `report.json`。按方案要求数据完整保留，不脱敏、不截断、不重编码，目录内容如下（以登录凭据那次为例）：

```text
load-code-assist.{request.json,response.bin,meta.json}            3869 B 响应，含 currentTier/allowedTiers/paidTier
fetch-available-models.{request.json,response.bin,meta.json}     196778 B 响应，33 个模型
generate-content.{request.json,response.bin,meta.json}             1169 B 响应，含 thoughtSignature
stream-generate-content.{request.json,response.bin,meta.json}      1470 B SSE 原始字节
generate-continuation.{request.json,response.bin,meta.json}        1163 B 响应
refresh-credential.json + refresh-generate-content.*               611 B 刷新副本（默认只在本地保留）
invalid-request.{request.json,response.bin,meta.json}               127 B，400 INVALID_ARGUMENT 错误体
report.json
```

记录边界如实说明：这些字节是客户端一侧经本地代理看到的 HTTP 数据。真实出站 `Authorization`/`User-Agent` 的注入由受控上游测试核对（见 `tests/antigravity-proxy.test.ts`），真实调用成功提供补充证据；没有为抓取 TLS 建立中间人代理。

## 6. 未验证与限制

1. **转换器与 Codex 接入未验证。** 现有 Responses ↔ Interactions 转换器产出公开 Interactions 报文，Cloud Code 上游接受的是 `v1internal:generateContent` 的 `request.contents` envelope；两者不匹配。把 `scripts/interactions-codex-live.ts` 的 URL 换成 daily 不会改变报文形状，因此本卡片没有用一条注定失败的 Codex 命令冒充验收。
2. **缓存命中未观测。** `generateContent` 响应只有 prompt/candidates/thoughts token 计数，没有 cached token 指标。续轮成功只说明上下文连续，不构成 cache hit 证据。
3. **工具循环与签名未做真实端到端。** 响应里确认存在 `thoughtSignature` 字段，但本轮没有跑真实的函数调用往返；精确字节透传由离线测试覆盖。
4. **代理不是转换层。** 原生请求体由测试客户端构造，代理不组装 envelope、不改 schema，也不实现重试。它只属于鉴权注入与转发。
5. **运行环境变动。** 执行期间仓库被外部提交推进到 `1f13429`（文档移入 `docs/`、归档已完成看板）；基线提交 `e3b17c1` 仍是其祖先，本次新增的两个文件未受影响。

## 7. 后续

要让 Codex 真正用上 Antigravity，必须先决定并实现其一：

- 新增独立的 Interactions → Cloud Code `generateContent` 协议适配（含响应与 SSE 反向转换）；
- 或者取得并验证一个真正兼容 Interactions 报文、且接受 Antigravity 登录态的 endpoint。

两者都不属于本次实测范围。无论采用哪一种，鉴权代理都不应导入转换器。
