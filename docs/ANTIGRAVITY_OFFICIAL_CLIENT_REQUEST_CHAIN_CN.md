# Antigravity 官方客户端请求链实测（A 阶段）

日期：2026-09-13。对应任务：`capture_official_client_request_chain`。
上游方案：[[docs/ANTIGRAVITY_INTERACTIONS_DISCOVERY_AND_LIVE_TEST_PLAN_CN.md]] 第 4 节 A/B。

## 1. 结论

Google 官方 Antigravity 运行时的 agent 回合，模型调用走的是 **Gemini Developer API 的 SSE 流式生成**，不是 Interactions REST 资源接口：

```text
POST https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:streamGenerateContent?alt=sse
```

请求体是 Cloud Code 形状的 envelope：顶层 `contents`、`generationConfig`、`sessionId`、`systemInstruction`、`toolConfig`、`tools`。

这条结论由两条互相独立的实测支持，且排除了 `base_url` 覆盖本身造成偏差的可能。Interactions 相关 proto（`Interaction`、`previous_interaction_id`、`interaction.created` 事件）确实在同一个二进制里，但它们在这个路径上没有作为 HTTP 资源接口出现。

响应侧同样完成实测：SSE 每个 `data:` 行是未包裹的 `GenerateContentResponse`，`data: [DONE]` 反而不被接受。请求与响应两端契约均已确认。

## 2. 方法与边界

测试对象是 Google 官方发布的 `google-antigravity` PyPI wheel（版本 `0.1.16`，`py3-none-win_amd64`，40.3 MB）。wheel 内打包了 Go 运行时 `google/antigravity/bin/localharness.exe`（131,091,456 字节）。Python 层只负责拉起该进程并通过本机 WebSocket 通信，所有出站请求由该 Go 二进制发出，这一点已在 [[docs/ANTIGRAVITY_SDK_CALL_CHAIN_SCAN_CN.md]] 记录。

方法与 IDE 的 `language_server.exe` 不同：这里用的是官方 SDK 的 harness，不是 Antigravity IDE 的语言服务。选择它的理由是它由 Google 自己发布、无需账号密钥即可驱动、并且能在不改代码的前提下把模型 endpoint 指向本地记录器。它与 IDE 共享同一套 agent 提示词（见第 4 节）与同一套 envelope，但**不等同于 IDE 客户端**，IDE 侧的对应取证仍属独立事项。

未使用 curl 作为验收客户端，也没有中间人 TLS。观测点分别是本地 TCP 记录器与 harness 自身 stderr。

## 3. 实测一：base_url 指向本地记录器

用 `LocalConnectionStrategy` 配置 `ModelTarget(name="gemini-3.8-flash", endpoint=GeminiAPIEndpoint(base_url="http://127.0.0.1:<port>", api_key="fake-probe-key"))`，本地记录器接收原始字节。

记录到的请求行：

```text
POST /v1beta/models/gemini-3.8-flash:streamGenerateContent?alt=sse HTTP/1.1
```

记录到的请求头：

```text
Host: 127.0.0.1:<port>
User-Agent: google-antigravity-sdk/0.1.16 python/3.10.7 client-os/windows client-os-ver/10
Content-Length: 45085
Authorization: Bearer fake-probe-token
Content-Type: application/json
X-Goog-Api-Client: google-genai-sdk/1.71.0 gl-go/go1.28-20260721-RC01 cl/951519500 +3ebc191975 X:boringcrypto,simd,mapsplitgroup
X-Goog-Api-Key: fake-probe-key
Accept-Encoding: gzip
```

注意两点。`base_url` 只替换主机，版本前缀 `/v1beta/models/{model}:streamGenerateContent?alt=sse` 由 harness 自己拼接。SDK 允许同时传 `http_headers`，因此记录里出现了我们注入的 `Authorization`。

请求体（45,085 字节，节选结构）：

```json
{
  "contents": [
    {
      "parts": [{ "text": "<USER_REQUEST>\nReply with exactly: OK\n</USER_REQUEST>\n<ADDITIONAL_METADATA>..." }],
      "role": "user"
    }
  ],
  "generationConfig": {
    "candidateCount": 1,
    "maxOutputTokens": 65535,
    "stopSequences": ["<|user|>", "<|bot|>", "<|context_request|>", "<|endoftext|>", "<|end_of_turn|>"],
    "temperature": 1,
    "thinkingConfig": { "includeThoughts": true },
    "topK": 50,
    "topP": 1
  },
  "sessionId": "-3750763034362895579",
  "systemInstruction": { "parts": [{ "text": "<identity>...</identity><user_information>...</user_information>... (single large prompt)" }], "role": "user" },
  "toolConfig": { "functionCallingConfig": { "mode": "AUTO" } },
  "tools": [{ "functionDeclarations": [ ... ] }]
}
```

关键字段：

| 字段 | 观察值 | 说明 |
| --- | --- | --- |
| `sessionId` | `-3750763034362895579` | 顶层会话标识，与 Cloud Code 参考实现的 `request.sessionId` 同名同位置语义 |
| `contents` | 单条 user content | 纯客户端历史模式，没有服务端资源引用 |
| `systemInstruction` | 一个巨型 system prompt | 见第 4 节 |
| `tools` | `functionDeclarations` 数组 | `ask_question`、`define_subagent`、`find_by_name`、`read_url_content`、`replace_file_content`、`run_command`、`search_web`、`send_message`、`view_file`、`write_to_file` 等 |
| `toolConfig` | `functionCallingConfig.mode = "AUTO"` | 常规函数调用配置 |
| `thinkingConfig` | `includeThoughts: true` | 思考内容回传 |

请求体里没有任何 `interaction_id`、`previous_interaction_id` 或 `model_interaction` 字段。

## 4. 系统提示词与 IDE 的同源性

`systemInstruction` 以如下身份声明开头：

```text
<identity>
You are Antigravity, a powerful agentic AI assistant designed by the Google DeepMind team.
```

并包含 `<user_information>`（OS 版本、workspace URI 到 CorpusName 的映射、App Data Directory、Conversation ID）、`<subagents>`、`<messaging>`、`<artifacts>`、`<communication_style>`、`<user_system_instructions>` 等分节。其中 artifact 目录写作 `<appDataDir>\brain\<conversation-id>`，会话号形如 `6839b9e62ef71bbb3b5b80b7ea940081`。

这与 IDE 侧同一套 Antigravity agent 提示词一致，说明该 harness 就是 Antigravity agent 运行时的官方发行版。

## 5. 实测二：默认 endpoint（排除 base_url 偏差）

第二轮不设置 `base_url`，只给 `GeminiAPIEndpoint(api_key="invalid-probe-key")`，并打开 harness stderr 日志。harness 自己打印了真实目标：

```text
received model response error: doRequest: error sending request:
Post "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:streamGenerateContent?alt=sse":
dial tcp [2001:4860:4842:400::]:443: connectex: An attempt was made to access a socket in a way forbidden by its access permissions.
```

这与第一轮记录到的路径完全一致，说明 `streamGenerateContent` 不是 `base_url` 覆盖带来的分支，而是默认行为。该轮请求被沙箱网络策略拦在 TCP 连接阶段，未到达 Google，也未使用任何有效凭据。

## 6. 二进制中同时存在但未被该路径使用的能力

从同一 `localharness.exe` 提取到以下与 Interactions 相关的字符串或符号，它们证明这些能力存在，但不证明默认 agent 回合使用了它们：

| 观察 | 含义 |
| --- | --- |
| `learning/genai/api/interactions/proto/{interaction,events,sse_events,steps,content,agents,...}.proto` | Interactions 内容与事件模型是该运行时的内部类型系统 |
| `LiveInteractionRequestPayload{ create_interaction, event, step }`，JSON 名 `interaction.create` | 存在一个 live/bidi 形态的 Interactions 请求载荷 |
| `LiveInteractionResponse{ interaction_created, event }`，JSON 名 `interaction.created` | 对应响应载荷 |
| `ws/google.ai.generativelanguage.%s.GenerativeService.%s` | Gemini Live/bidi WebSocket 路径模板 |
| `ws/google.cloud.aiplatform.%s.LlmBidiService/BidiGenerateContent` | Vertex Live/bidi WebSocket 路径模板 |
| `{model}:generateContent`、`{model}:streamGenerateContent?alt=sse`、`publishers/%s/models/%s` | 非流式与流式 generateContent 路径模板 |
| `/v1internal:` 共 44 个 RPC 名（含 `generateContent`、`streamGenerateContent`、`internalAtomicAgenticChat`、`generateChat`、`registerInteraction`） | Cloud Code 内部服务面同样被编入 |
| 无 `/interactions` REST 路径字符串 | 该二进制里不存在公开 Interactions 的资源路径 |

因此可以区分三件事：**类型系统**里有 Interaction；**live/bidi 模块**里有 LiveInteraction 载荷；**默认 agent 回合实际调用**的是 `streamGenerateContent?alt=sse`。前两者的存在不能反推第三条。

## 7. 实测三：响应侧 SSE 契约

记录器返回 `{}` 时 harness 报错 `iterateResponseStream: invalid stream chunk: {}`，说明它按 SSE 逐块解析 JSON。用两个候选形态做对照实验，各自返回一段固定 SSE：

| 形态 | 响应体 | 结果 |
| --- | --- | --- |
| `plain` | `data: {"candidates":[{"content":{"parts":[{"text":"OK"}],"role":"model"},"finishReason":"STOP","index":0}],"modelVersion":"gemini-3.8-flash","usageMetadata":{...}}` | **接受**，会话输出 `OK` |
| `wrapped` | 同上但外层包 `{"response":{...}}` | 拒绝，`model output must contain either output text or tool calls` |

两个细节值得记录。第一，harness 的 SSE 解析器对每个 `data:` 行做 JSON 反序列化，因此标准 Gemini API 的终止标记 `data: [DONE]` 会直接导致 `invalid character 'D' looking for beginning of value`；去掉该行后正常结束。第二，反序列化目标就是 **未包裹的 `GenerateContentResponse`**，文本位于 `candidates[0].content.parts[0].text`，`usageMetadata` 与 `modelVersion` 同层。

由此，Antigravity agent 路径的请求与响应两端契约都得到了实测确认，中间不存在 Interactions 资源接口的参与。

## 8. 对既有判断的影响

此前的实测报告曾写“Cloud Code 上游只接受 `v1internal:*` envelope，没有可用的 Interactions endpoint”，措辞越界。基于本卡的证据，可以给出更窄也更可靠的表述：

> Google 官方 Antigravity 运行时在 agent 回合中通过 `:streamGenerateContent?alt=sse` 调用模型，请求体是 Cloud Code 形状的 `contents`/`sessionId` envelope；该运行时内部确实带有 Interactions 类型系统与 LiveInteraction 载荷，但本轮没有观察到任何 Interactions 资源接口被调用。

仍未回答的是：IDE 语言服务是否与该 harness 完全同路径；Live/bidi 通道何时被启用；是否存在一个未在这两条路径上暴露的 Interactions endpoint。这些留给下一张卡。

## 9. 证据位置

- 记录器原始请求字节：`%TEMP%\antigravity-harness-probe\capture-001.bin`（45,559 字节）与 `capture-001.note.txt`
- 默认 endpoint 运行日志：`%TEMP%\antigravity-harness-default\run.log`
- SSE 契约对照实验：`%TEMP%\antigravity-harness-sse\`（`plain` 与 `wrapped` 两轮）
- 提取出的官方二进制：`%TEMP%\antigravity-wheel-scan\extracted\google\antigravity\bin\localharness.exe`
- 驱动脚本：`%TEMP%\antigravity-wheel-scan\probe_harness_endpoint.py`、`probe_default_endpoint.py`、`probe_sse_response.py`
