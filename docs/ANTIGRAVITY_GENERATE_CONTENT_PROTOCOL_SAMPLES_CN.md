# Antigravity GenerateContent 协议样本与字段映射

日期：2026-09-13。对应任务：`fix_protocol_samples_and_mapping`。上游方案：[[docs/ANTIGRAVITY_GENERATE_CONTENT_RESPONSES_PLAN_CN.md]]。

本文只用本机已有的真实抓包。没有再次联网，没有探测 Interactions 路径。所有字段都标注来源：**实测**表示来自本机真实响应字节，**文档**表示来自公开协议定义，**待补**表示本地无证据。

## 1. 三个必须分开的层次

真实链路里叠了三层，混淆它们是这套转换最容易出错的地方：

```text
HTTP 目标      POST /v1internal:streamGenerateContent?alt=sse   ← 接入层固定
Cloud Code     { model, project, request, requestId, requestType, userAgent }
  └ request    { contents, sessionId, ... }                     ← 纯转换器的输出
上游 SSE       data: { "response": { …GenerateContentResponse… }, "traceId", "metadata" }
  └ response     { candidates, usageMetadata, modelVersion, responseId }  ← 纯转换器的输入
```

接入层负责第一、二层的外层与 `response` 外壳；转换器只看 `request` 里的内容和 `response` 里的 `GenerateContentResponse`。

## 2. 请求 envelope（实测）

来自 `stream-text.request.json`、`generate-content.request.json`：

```json
{
  "model": "gemini-3.8-flash-medium",
  "project": "aicode-consumers",
  "request": {
    "contents": [{ "parts": [{ "text": "Reply with exactly pong." }], "role": "user" }],
    "sessionId": "-1789260955932"
  },
  "requestId": "agent-0aeeec5d-93cb-4207-94cf-2fbf9dcf4346",
  "requestType": "agent",
  "userAgent": "antigravity"
}
```

| 字段 | 观察值 | 归属 | 说明 |
| --- | --- | --- | --- |
| `model` | `gemini-3.8-flash-medium` | 接入层 | 同一凭据还可选 `gemini-3.8-flash-high`（`defaultAgentModelId`）、`gemini-3.7-flash-*`、`gemini-pro-agent`、`claude-*` 等 |
| `project` | `aicode-consumers` | 接入层 | 与 SDK harness 不同：IDE 系路径带项目名，SDK 路径不带 |
| `request` | GenerateContent 请求体 | 转换器输出 | 唯一的协议内容载体 |
| `requestId` | `agent-<uuid>` | 接入层 | 每次请求新生成，与 `sessionId` 无关 |
| `requestType` | `agent` | 接入层 | 固定字面量 |
| `userAgent` | `antigravity` | 接入层 | 与 HTTP `User-Agent` 指纹是两件不同的事，两者都要有 |
| `request.sessionId` | `-1789260955932` | 客户端 | 见第 5 节 |

同一模型名 `gemini-3.8-flash-medium` 与 SDK harness 使用的 `gemini-3.8-flash` 不同；模型名由接入层决定，转换器不得改写。

## 3. 响应外壳与 SSE 分帧（实测）

`stream-text.sse` 共 1470 字节，两个事件，分隔符是 CRLF，**没有** `data: [DONE]`：

```text
data: {"response": {…candidates[{content:{parts:[{text:"pong"}]}}], usageMetadata, modelVersion, responseId}, "traceId": "…", "metadata": {}}
data: {"response": {…candidates[{content:{parts:[{thoughtSignature:"…", text:""}]}, finishReason:"STOP"}], usageMetadata, modelVersion, responseId}, "traceId": "…", "metadata": {}}
```

判断：

- 每个 `data:` 行是 JSON；外壳是 `{response, traceId, metadata}`，`traceId`/`metadata` 不属于 GenerateContent 语义。
- 文本帧先到，`finishReason` 在**后续**帧里，与先前的文本帧一起出现；终止信号是 `finishReason`，不是 `[DONE]`。
- 两帧带同样的 `responseId` 与 `usageMetadata`。usage 可重复出现，累计时不能重复计数，取末次为准。
- 尾部 `thoughtSignature` 的 part 文本为空串，属于合法 part，不能因为文本为空就丢弃。

非流式 `generate-content.response.json` 是**未包裹**的外壳对象，结构与 SSE 里 `response` 字段的内容一致：

```json
{
  "response": {
    "candidates": [{ "content": { "role": "model", "parts": [{ "thoughtSignature": "…", "text": "OK" }] }, "finishReason": "STOP" }],
    "usageMetadata": { "promptTokenCount": 16, "candidatesTokenCount": 1, "totalTokenCount": 123, "thoughtsTokenCount": 106 },
    "modelVersion": "gemini-3.8-flash",
    "responseId": "oPSlapjMCsf81e8Pz_jX8AY"
  },
  "traceId": "87eb3402d1e260f8",
  "metadata": {}
}
```

注意 `modelVersion` 是 `gemini-3.8-flash`，与请求里的 `gemini-3.8-flash-medium` 不同：不要把 `modelVersion` 当作请求模型回显。

## 4. 字段映射

**实测**一列表示本机有真实字节支持；**文档**一列表示要在实现时对照公开协议定义补齐，本地尚无样本。

| Responses | GenerateContent | 证据 |
| --- | --- | --- |
| `instructions`、developer/system 项 | `systemInstruction.parts[].text` | 待补（本机样本无 system 项） |
| `input` 的 user 项 | `contents[].role = "user"`、`parts[].text` | 实测 |
| `input` 的 assistant 项 | `contents[].role = "model"` | 实测 |
| assistant 项里的 reasoning/不透明状态 | `parts[].thoughtSignature` | 实测（回传时原样保留在同一 part） |
| 文本增量 | `candidates[0].content.parts[].text` | 实测 |
| `tools` 函数定义 | `tools[].functionDeclarations[]` | 待补 |
| `function_call` | `parts[].functionCall` | 待补 |
| `function_call_output` | `parts[].functionResponse` | 待补 |
| 生成参数 | `generationConfig` | 待补（Cloud Code 接受该字段，本机样本未发送） |
| `usage.input_tokens` | `usageMetadata.promptTokenCount` | 实测 |
| `usage.output_tokens` | `usageMetadata.candidatesTokenCount` | 实测（未含 thought） |
| `usage.output_tokens_details.reasoning_tokens` | `usageMetadata.thoughtsTokenCount` | 实测 |
| `usage.total_tokens` | `usageMetadata.totalTokenCount` | 实测 |
| 缓存命中 | `usageMetadata.cachedContentTokenCount` | 实测缺失：本机样本里没有该字段，因此不能报告命中 |
| 正常结束 | `candidates[0].finishReason = "STOP"` | 实测 |
| `status` / 其他结束原因 | `finishReason` 其余取值、`promptFeedback` | 待补 |

两个容易踩的坑：`totalTokenCount` 在本机样本里等于 `prompt + candidates + thoughts`（6+1+102=109；16+1+106=123），所以 `candidatesTokenCount` 不能直接当成 Responses 的 `output_tokens` 而忽略 thoughts；`parts[]` 的顺序同时承载文本和签名，转换时不能重排。

## 5. 状态归属

服务端不持有会话对象。客户端在下一轮把上一轮的模型输出整体回传，`continuation.request.json` 是真实证据：

```text
contents[0] user    "Remember this marker: ab5ec571. Reply with OK."
contents[1] model   parts[0] = { thoughtSignature: "…", text: "OK" }   ← 与上一轮响应逐字节一致
contents[2] user    "Which marker did I ask you to remember? …"
sessionId           "-1789260955932"                                    ← 两轮相同
```

因此：

- 历史与签名由客户端持有；转换器只负责把 Responses 侧状态**可逆地**搬进 `contents` 并搬回来。代理不保存历史，也不需要数据库。
- `thoughtSignature` 必须与实际 part 绑定并原样回传。它是唯一在本地样本中出现的原生不透明字段；截断、重排或换 part 都会破坏续轮。
- `sessionId` 是 envelope 级字段，不是 Interactions 资源 ID，也不能当作 `previous_response_id` 使用。同一会话必须稳定，两轮实测值相同。
- Cloud Code 未提供 `cachedContentTokenCount` 时，缓存一律记为未观测。

## 6. 本地证据缺口

以下情况在本机没有真实字节，实现和测试必须按“合成帧”处理并明确标注，不能当成实测：

- 工具调用与工具结果帧（`functionCall` / `functionResponse`）。
- 文本被拆成多帧的增量流；本机文本只有 3 个字符、单帧到达。
- 上游错误帧、内容拦截、长度截断等非 STOP 结束。
- `systemInstruction`、`generationConfig`、`tools` 在 Cloud Code 路径上的实际接受情况。
- `data:` 行被 TCP 分片切断的情形（需自行构造）。

## 7. 证据位置

- 固化 fixture：[[tests/fixtures/antigravity-generate-content/README.md]]
- 原始运行目录：`%TEMP%\antigravity-proxy-live\2026-09-13T00-55-55-926Z`（含 `report.json`、各步骤 `*.request.json` / `*.response.bin` / `*.meta.json`）
- 模型与 quota 清单：同目录 `fetch-available-models.response.bin`
- 采集脚本：[[scripts/antigravity-proxy-live-test.ts]]
