# Antigravity Responses 转换器差距修复报告

本报告记录 `antigravity-converter-gap-fixes` 看板这一轮的实际改动、与 CLIProxyAPI 的逐项对比，以及真机
验证结果和仍然缺失的部分。所有结论都以本仓库代码、`reference/CLIProxyAPI` 源码和
`https://daily-cloudcode-pa.googleapis.com` 上的真实请求为依据。

## 1. 运行环境与入口

| 项 | 值 |
|---|---|
| 上游 | `https://daily-cloudcode-pa.googleapis.com/v1internal:streamGenerateContent?alt=sse` |
| 模型 | `gemini-3.8-flash-medium` |
| 鉴权 | 复用本地 `~/.cli-proxy-api/antigravity.json`（凭据内容不入库、不进报告） |
| 适配器 | `scripts/antigravity-responses.ts`（Responses → GenerateContent → Responses SSE） |
| 真机入口 | `bun scripts/antigravity-responses-live-test.ts` |

转换器本体是 `src/services/generate-content/convert.ts`（请求方向）与
`src/services/generate-content/stream.ts`（响应方向）。本轮只改转换逻辑与测试，没有改动 provider 配置、
没有引入服务端会话库、没有新增应用层策略。

## 2. 与 CLIProxyAPI 的逐项对比

### 2.1 工具 schema：布尔 enum / `const`

| | 做法 |
|---|---|
| CLIProxyAPI | 把 `parametersJsonSchema` 改回 `parameters`，再用 `util.CleanJSONSchemaForAntigravityTool` 把 enum 成员字符串化、删掉 `enum`、把 `const` 变成 enum 提示 |
| 本转换器 | 声明为 `parametersJsonSchema`，schema 原样透传 |

真机探测结果（同一 endpoint）：

| 声明 | 结果 |
|---|---|
| `parameters` + `enum:[true]` | 400 `(TYPE_STRING), true` |
| `parameters` + `const:true` | 400 `Unknown name "const"` |
| `parametersJsonSchema` + `const/enum` | 200，模型按声明输出 `{"allow":true}` 布尔值 |

因为存在一个能完整接受 JSON Schema 的字段，这里不需要 CLIProxyAPI 那套改写，客户端 schema 保持逐字节不变。

### 2.2 reasoning 与工具签名

| | 做法 |
|---|---|
| CLIProxyAPI | `internal/signature/gemini_sanitize.go` 用 `GeminiReplaySignatureOrBypass` 把不可识别签名换成 `skip_thought_signature_validator`；`signature_carrier.go` 用带 direction/target 的 `cpa-gemini-responses-carrier-v1:` 载体承载 detached reasoning |
| 本转换器 | 用 `gcparts1.` 原样承载上游 `parts`，重新声明为合法签名则原样回放 |

本轮修掉的实际缺陷：载体里的 `functionCall` 同时带 `thoughtSignature` 和上游 `functionCall.id`
（例如 `call_2682242`），而客户端回放的 `function_call` 项既没有签名、`call_id` 也不同（流层合成）。
旧的整对象比较因此永远不相等，导致同一个调用被发送两次：

```
carrier parts : [{thoughtSignature:"EqcC…", functionCall:{name,args,id:"call_2682242"}}, {text:""}]
converted     : [...同上..., {functionCall:{name,args}}]      ← 重复
```

现在比较走 `partIdentity`：忽略签名字段与 `functionCall.id`，只保留 Responses 能表达的部分。
`pushModelPart` 负责“载体先到”，`dropCarriedParts` 负责“载体后到”，两种顺序结果一致。

真机签名策略探测：

| 回放形态 | 结果 |
|---|---|
| 载体回放 | 200 |
| 完全不带 reasoning | 200，回答连贯 |
| 首个 `functionCall` 无签名 | 200 |
| `skip_thought_signature_validator` | 200 |
| 伪造/垃圾签名 | 400 |

结论：这个 endpoint 接受无签名的合成历史，所以不需要注入 bypass 哨兵；转换器既不注入、也不改写任何
签名（客户端若送来哨兵也原样转发）。

### 2.3 developer/system 指令与工具结果配对

| | 做法 |
|---|---|
| CLIProxyAPI | `pendingDeveloperParts` 缓存指令，等 `pendingFunctionCallIDs` 清空后再作为 user content 发出；对没有结果的调用调用 `buildOpenAIResponsesSynthesizedFunctionResponsePart` 伪造一个结果 |
| 本转换器 | 同样缓存指令（`heldInstruction`），结果按调用顺序合成一个 user turn（`flushAnswers`）；**不伪造**任何工具结果 |

修掉的缺陷：中途指令落在调用与结果之间会把 `model[call] user[instruction] user[response]` 拆开；若指令落在
载体与其回放的调用之间，还会重置 `carrierParts`，让调用变成第二个 model turn（重复调用）。

并行结果此前每个占一个 user turn，现在合并为一个 user turn 并按**调用顺序**排列——上游是按第 N 个
response 对第 N 个 call 配对的，结果报序打乱也要归一化。

### 2.4 additional_tools 合并

| | 做法 |
|---|---|
| CLIProxyAPI | `internal/util/responses_tools.go` 把顶层与 `additional_tools` 都展开成描述符，按限定名（`namespace__child`）选 winner，顶层优先 |
| 本转换器 | 按上游扁平身份 `qualifiedToolName(namespace, child)`（`_<len>_<namespace><name>`）合并，namespace 逐子项过滤 |

修掉的缺陷：旧实现用声明的 `name` 去重，namespace 声明带的正是**组名**，于是“请求已声明同名 namespace”
会整组吞掉后来新增的子工具；“直接工具与 namespace 同名”也会误判冲突。现在顶层声明优先只作用于同一
identity，新增子工具保留，直接工具与同名 namespace 互不影响。两点与 CLIProxyAPI 不同：限定名形式是本仓库
自己的可逆编码（`_<len>_<namespace><name>`，不需要额外反查表），且只把真正的新子项留在声明里，而不是
重新拼一个完整 winner 列表；反向 `ToolIdentity` 表不变，调用仍能还原 namespace。

### 2.5 结构化输出（`text.format`）

| | 做法 |
|---|---|
| CLIProxyAPI | `applyOpenAIResponsesTextFormatToGemini` 写 `generationConfig.responseJsonSchema`，再由 antigravity 翻译层 `normalizeGeminiGenerationConfigResponseSchema` 改名为 `responseSchema` |
| 本转换器 | 直接写 `responseSchema`，schema 原样透传 |

真机探测（同一 endpoint，同一提示词）：

| generationConfig | 结果 |
|---|---|
| 不设置 | 200，散文 |
| `responseMimeType` | 200，散文 |
| `response_mime_type` | 200，散文 |
| `responseJsonSchema` | 200，**散文**（被静默忽略） |
| `responseSchema` | 200，按 schema 的 JSON |
| `responseSchema` + `title`/`additionalProperties`/`anyOf` | 200，按 schema 的 JSON |
| `responseSchema` + `$schema` | 400 `Unknown name "$schema"` |

“被静默忽略”比“报错”更糟，所以转换器直接用这个 endpoint 真正生效的字段名，schema 本身仍然逐字节透传。

## 3. 本轮真机验证

`bun scripts/antigravity-responses-live-test.ts`，run `68983ebf`，
证据目录 `%TEMP%\antigravity-responses-live\2026-09-13T07-28-42-291Z_68983ebf`，8/8 步通过：

| 步骤 | 覆盖内容 | 实际结果 |
|---|---|---|
| `turn.text` | 基础文本轮 + 载体生成 | 200，`"OK"`，产出 reasoning 载体 |
| `turn.continuation` | 带载体续轮，跨轮上下文 | 200，正确回忆 marker `28a52016` |
| `turn.function_call` | 工具调用 | 200，`get_weather({"location":"Tokyo"})` |
| `turn.tool_history` | 真实带工具历史回放（本地断言转换后的 model turn 与载体逐字节一致） | 200，`"The weather in Tokyo is currently sunny and 27°C."` |
| `turn.tool_pairing` | 第二个并行调用 + 指令插在调用组内 + 结果倒序回报 | 200，结果按 `["get_weather","get_time"]` 顺序合成一轮，`"In Tokyo, the local time is 09:30 JST and the weather is sunny at 27°C."` |
| `tool.namespace_identity` | 仅由 `additional_tools` 声明的 namespace 工具 + 反向身份 | 200，调用还原为 `demo.ping` |
| `text.json_schema` | `enum` + `anyOf` 结构化输出 | 200，`{"summary":"It is sunny and 27°C in Tokyo.","temperature_c":27,"conditions":"sunny"}` |
| `history.foreign_provider` | 其他 provider 的 reasoning 历史 + 布尔 enum 工具 schema | 200，`"ok"` |

回归与构建：

- `bun test tests/` — 484 pass，1 skip，0 fail（含请求、SSE、adapter、proxy 既有用例）。
- `bun run build` — 通过。
- 真机结果不是由单测替代：每一步都是经适配器打到 `daily-cloudcode-pa.googleapis.com` 的 HTTP/SSE 往返。

## 4. 仍然缺失或未验证的边界

1. **`$schema` 关键字**：`responseSchema` 会被这个 proto 拒绝（400）。转换器选择原样透传并让上游报错，
   没有像 CLIProxyAPI 那样清洗 schema；若客户端确实要带 `$schema`，需要单独决定是否删除该标记。
2. **`json_object` 只是提示**：此 endpoint 上仅 `responseMimeType: application/json` 并不强制 JSON 输出。
   转换器没有伪造 `{type:"object"}` schema 去补强，因为那等于替客户端发明约束。
3. **不可识别的签名会被上游拒绝**：垃圾签名 400。转换器坚持不改写签名，因此这种输入会失败而不是被替换成
   bypass 哨兵。
4. **没有 GenerateContent 等价物的输入直接拒绝**：`item_reference`、`compaction`、
   `previous_response_id`、`conversation`、`parallel_tool_calls: false`。
5. **仅 SSE**：本轮只覆盖流式 `streamGenerateContent`，非流式 `generateContent` 与 websocket 不在范围内。
6. **模型覆盖有限**：真机只跑了 `gemini-3.8-flash-medium`；`-tiered`/其他档位的结构化输出与签名行为未在本轮
   重新验证。
7. **`max_output_tokens` / `thinkingConfig`** 未在本轮真机复核，仅有既有回归用例。
8. **图片与多媒体**：按既定决定不在转换范围内。
9. `scripts/antigravity-responses-live-test.ts` 第 1 行有一个既存的未使用导入（`Server`），
   `bunx tsc --noEmit` 会报 TS6133；`bun run build` 不受影响，本轮未顺手改动。

## 5. 结论

本轮把此前“单测通过但真机会失败”的五处差距补上，并且每一处都用真实 endpoint 复核过：
布尔 enum 工具 schema、载体签名与调用去重、指令与工具结果配对、`additional_tools` 身份合并、
结构化输出字段选择。转换器仍然是纯协议映射：不改写客户端 schema 与签名、不伪造工具结果、
不引入会话状态库。
