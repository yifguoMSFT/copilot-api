# Antigravity Python SDK 调用链扫描（A0）

日期：2026-09-13。范围：`reference/antigravity-sdk-python/`。方法：只读源码、proto 与打包配置扫描，未联网、未读取凭据。

对应任务：`scan_python_sdk_call_chain`（看板 [[antigravity-interactions-discovery-live-test.kanban.json]]）。
上游方案：[[docs/ANTIGRAVITY_INTERACTIONS_DISCOVERY_AND_LIVE_TEST_PLAN_CN.md]] 第 4 节 A0。

## 1. 结论摘要

1. **Python 层不是网络客户端。** 整个 SDK 只有本地 WebSocket、本地 LiteRT HTTP 和 `google.genai` 类型引用，没有任何指向 Google 主机的 HTTP 调用。真正访问远端模型的是随 wheel 发布的 Go 二进制 `localharness`。
2. **SDK 内置完整的 Interaction 契约。** `proto/interaction.proto` 定义了带 `id`、`previous_interaction_id`、`status`、`outputs`、`steps`、`usage` 的 `Interaction` 资源；`proto/sse_events.proto` 定义了 `interaction.created`、`interaction.status_update`、`content.delta` 等流式事件名。这与公开 Interactions API 的资源与事件模型同源。
3. **服务/RPC 层被有意裁掉。** `proto/interaction_service.proto` 只有 license 与 `package genai;`，没有任何 `service` 或 `rpc`。远端 host、HTTP 路径与方法名不在这份公开导出里。
4. **存在可实测的重定向入口。** `GeminiAPIEndpoint.base_url` 与 `VertexEndpoint.base_url` 会随 harness 配置一起下发，可用于把远端调用导向本地网关；`ANTIGRAVITY_HARNESS_PATH` 可以替换 harness 二进制，用于在真正的网络层插桩。`localharness.proto` 另有 `CustomEndpoint`，但当前 Python 导出没有构造点。
5. **该 SDK 的鉴权面与 Antigravity IDE 不同。** 这里用 Gemini API key、Vertex Express API key 或 ADC，而不是 Antigravity 桌面端的 Cloud Code OAuth。因此它是“契约来源”和“可跑通的 Interactions 客户端”，不能直接证明 IDE 登录态可以调用同一 endpoint。

## 2. 三层结构与真实网络边界

SDK 自述的三层是 Agent（Layer 1）→ Conversation（Layer 2）→ Connection（Layer 3）。网络职责全部落在 Layer 3。

| 层 | 文件 | 职责 | 是否产生远端流量 |
| --- | --- | --- | --- |
| Agent | `google/antigravity/agent.py` | 配置、生命周期、工具与 hooks 装配 | 否 |
| Conversation | `google/antigravity/conversation/conversation.py` | step 历史累积、turn 与 compaction 索引、`chat()` 便捷方法 | 否 |
| Connection（抽象） | `google/antigravity/connections/connection.py` | `Connection` / `ConnectionStrategy` / `AgentConfig` 抽象；`DebugConfig` | 否 |
| Connection（local） | `google/antigravity/connections/local/local_connection.py` | 拉起 harness 子进程、WebSocket 通信、工具调用回传 | 是，但只到本机 harness |
| Connection（litert） | `google/antigravity/connections/local/litert_connection.py` | 本地 LiteRT 模型，直接 `urllib` 访问本地服务 | 仅本地 |
| Connection（openai 兼容） | `google/antigravity/connections/local/local_openai_connection.py` | 指向任意 OpenAI 兼容本地服务 | 仅本地 |

`connections/README.md` 把 `LocalConnection` 描述为 “connects to a Go-based local harness”，并说明传输是 WebSocket、负载是 protobuf 经 JSON 序列化的 `OutputEvent` / `InputEvent` / `StepUpdate`。`skills/google-antigravity-sdk/references/architecture.md` 把 `LocalConnectionStrategy` 描述为 “Connects to the remote Gemini API”，即远端调用发生在 harness 内部。

## 3. 进程与传输握手

实测的启动顺序（`local_connection.py:1335-1440`）：

1. `_get_default_binary_path(env)` 解析 harness 路径，顺序为：调用方 `env` 字典 → `os.environ` → `importlib.metadata` 中 wheel 的 `google/antigravity/bin/localharness[.exe]` → `importlib.resources` 回退 → `PATH` 查找 `localharness`。
2. `subprocess.Popen([binary_path], stdin/stdout/stderr=PIPE, env=merged_env)`。
3. 向 stdin 写入 4 字节小端长度前缀 + 序列化的 `InputConfig`（`storage_directory`、`client_info`、`env`）。
4. 从 stdout 读 4 字节长度 + `OutputConfig`，其中含 harness 自选 `port` 与一次性 `api_key`。
5. `websockets.connect(f"ws://{host}:{port}/", additional_headers={"x-goog-api-key": api_key}, max_size=None)`，host 依次尝试 `localhost`、`127.0.0.1`，最多 5 次退避重试。
6. 发送 `InitializeConversationEvent(config=harness_config)`，读取 `InitializeConversationResponse`，其中可带 `history`、`cumulative_usage`、`trajectory_usage`。

结论：Python ↔ harness 走本机 WebSocket，harness ↔ Google 走 Go 内部的 HTTP/SSE 客户端。计划中“排除本地 WebSocket 干扰”的提醒在这里得到确认——SDK 层的 WebSocket 与远端协议无关。

## 4. 配置如何下发到 harness

`_build_harness_config()`（`local_connection.py:1112-1185`）把 SDK 配置映射为 `HarnessConfig`，关键字段：

| HarnessConfig 字段 | 来源 | 说明 |
| --- | --- | --- |
| `cascade_id` | `conversation_id` | 会话标识，对应 Antigravity 内部 cascade 术语 |
| `session_continuation_mode` | `SessionContinuationMode` | `RESUME` / `CREATE_OR_RESUME` / `CREATE_ONLY` |
| `models` | `types.ModelTarget[]` | 每个含 endpoint oneof |
| `system_instructions` | `SystemInstructions` | appended/custom 两类 |
| `tools` / `harness_side_tools` | 工具装配 | 含 MCP server 配置 |
| `compaction_config` / `budget_config` | 配置对象 | 对应 `AntigravityCompactionConfig` / `BudgetConfig` |
| `agent_behavior` | `AgentBehavior` | `AUTONOMOUS` / `INTERACTIVE` / `MINIMAL` |

`ModelConfig`（`localharness.proto:152`）的 endpoint oneof 在 proto 中共四项：

- `GeminiAPIEndpoint{ base_url, http_headers, api_key, options }`
- `VertexEndpoint{ base_url, http_headers, project, location, options }`
- `GemmaEndpoint{ base_url }`
- `CustomEndpoint{ backend_type, config_json }`

Python 侧 `build_models_proto()`（`local_connection.py:208-249`）只构造前两项，遇到其他类型直接 `raise ValueError`。`GemmaEndpoint` 属于 LiteRT 本地模型路径，`CustomEndpoint` 在当前导出里没有任何 Python 构造点。因此从 SDK 配置层能真正使用的重定向手段只有 `GeminiAPIEndpoint.base_url` 与 `VertexEndpoint.base_url` 两个。

`http_headers` 是任意 map，可由调用方设置。`base_url` 非空时 Python 侧的 `validate_endpoint()` 直接返回，不再要求 `GEMINI_API_KEY` 或 project/location（`models.py:115-124`、`150-167`）。`VertexEndpoint` 还有一个显式设计：只要带 `base_url`，就跳过从环境变量注入 `GOOGLE_CLOUD_PROJECT` / `GOOGLE_CLOUD_LOCATION`，注释写明是为了不把环境 project 污染到外部网关（`models.py:135-148`）。

对代理接入而言，这意味着两件事：SDK 支持把模型流量指向自建 gateway；且 SDK 作者预期外部网关会自行处理鉴权。

## 5. Interaction 契约（本次最重要的发现）

`google/antigravity/proto/` 下共 25 个 proto：23 个属于 `package genai;`、1 个是 `gaos.parsing`（json 注解）、1 个是 `antigravity.localharness`（harness 自身协议）。其中两个 `genai` 文件直接给出 Interactions 语义。

### 5.1 `interaction.proto`

`Interaction` 带静态 JSON 字段 `object: "interaction"`，字段包括：

| 分组 | 字段 |
| --- | --- |
| 标识与生命周期 | `id`、`status`、`created`、`updated`、`role` |
| 状态续轮 | `previous_interaction_id`（field 34） |
| 输入 | oneof：`content_list` / `string_content` / `turn_list` / `step_list` / `content` |
| 请求类型 | oneof：`model_interaction`（discriminator `"model"`）/ `agent_interaction`（discriminator `"agent"`） |
| 环境 | oneof：`env_id` / `remote_environment` |
| 输出 | `outputs[]`、`steps[]`、`errors[]` |
| 控制 | `system_instruction`、`tools[]`、`response_modalities[]`、`response_mime_type`、`service_tier`、`environment_id` |
| 用量 | `usage` |

`Interaction.Status` 枚举：`UNSPECIFIED`、`IN_PROGRESS`、`REQUIRES_ACTION`、`COMPLETED`、`FAILED`、`CANCELLED`、`INCOMPLETE`、`BUDGET_EXCEEDED`。

`Interaction.Usage` 是分割粒度的 token 统计，包含 `total_input_tokens`、`total_cached_tokens`、`total_output_tokens`、`total_tool_use_tokens`、`total_thought_tokens`、`total_tokens`，以及按模态拆分的 `*_by_modality` 与 `grounding_tool_count`。**缓存指标是一等字段**，这直接关系到方案里“cache hit 必须由上游指标证明”的要求。

### 5.2 `sse_events.proto`

流式事件用 `InteractionStreamingEvent` 的 oneof 表达，JSON discriminator 如下：

`interaction.start`、`interaction.created`、`interaction.complete`、`interaction.completed`、`interaction.status_update`、`content.start`、`content.delta`、`content.stop`、`step.start`、`step.delta`、`step.stop`、`error`。

事件体携带 `event_id`；`InteractionStartEvent` / `InteractionCompleteEvent` 包裹完整 `Interaction`，`InteractionStatusUpdate` 只带 `interaction_id` + `status`。`StepStop` 同时带累计 `usage` 与单步 `step_usage`，可据此区分“累计值”与“本步增量”，避免重复累加。

### 5.3 `interaction_service.proto`

只有 license header 与 `package genai;`，无 `service`、无 `rpc`、无 `google.api.http` 注解。远端 host、版本前缀与 method 名在这份导出中不可见。**这是 A0 无法回答的部分，必须在 A/B 阶段用真实客户端或 harness 补足，不能靠推测填路径。**

## 6. 与 Antigravity IDE 的关系

SDK 的模型鉴权是 Gemini API key / Vertex Express key / ADC，模板见 `README.md` 的 `GEMINI_API_KEY`、`vertex=True`、`project`+`location` 与 `gcloud auth application-default login`。这属于公开 Gemini Developer API 与 Gemini Enterprise Agent Platform（原 Vertex AI）两条产品面。

IDE 侧走的是另一套：Cloud Code 专有 origin（`daily-cloudcode-pa.googleapis.com`）与 Cloud Code OAuth 凭据，路径为 `v1internal:*`。两者 scope、host、envelope 均不同。

因此 A0 的产出应当这样使用：SDK 提供 **可确认的 Interaction 资源契约与事件契约**，并提供一条**可运行的公开 Interactions 客户端路径**；它不证明 IDE 登录态能调用同一 endpoint，也不能替代 A 阶段的官方客户端取证。

## 7. 未知项与后续动作

| 项 | 现状 | 由谁补足 |
| --- | --- | --- |
| 远端 host 与 HTTP 路径/版本 | 不在 Python 导出中 | A：官方客户端或 harness 请求观测 |
| method 名与 RPC 形态 | `interaction_service.proto` 为空 | A/B |
| Interactions 的 create/continue 语义细节 | 只有消息字段，无 RPC | B |
| harness 是走 Interactions 还是 envelope | 无证据 | A/B，属核心待验证假设 |
| `CustomEndpoint.backend_type` 的取值域 | 只有 `string` + `config_json`，未枚举 | B（可从 harness 二进制提取） |
| SDK 能否直接复用为最小真实客户端 | 未安装、无 key | 需要安装 wheel 与可用 key，见第 8 节 |

## 8. 用 SDK 取证的可执行路径

按可行性从高到低排列，均未执行：

1. **替换 harness。** 设置 `ANTIGRAVITY_HARNESS_PATH` 指向自建或插桩的 harness，即可在 Go 层记录真实出站请求。`LocalConnectionStrategy(env={...})` 可直接传入该变量，无需改动 SDK。
2. **重定向 base_url。** 给 `GeminiAPIEndpoint(base_url=...)` 或 `VertexEndpoint(base_url=...)` 指向本地记录器，观察 SDK/harness 发出的真实路径与 body 形状。这是最轻的观测手段，只要求安装 wheel 与任意可用 key。
3. **安装官方 wheel。** `pip install google-antigravity`（当前 `pyproject.toml` 声明版本 `0.1.16`）后，`google/antigravity/bin/localharness.exe` 会出现在 site-packages 中。对该二进制做只读字符串与符号扫描，可直接得到 host、路径与 RPC 名，这是 A0 之后成本最低的一手证据。本机当前未安装该包，`pip` 缓存中也没有对应 wheel。
4. **启用 SDK 日志。** `DebugConfig(logging_level="DEBUG")` 会把 `google.antigravity` logger 打到 DEBUG；`enable_server_side_tracing` 默认 `True`，但注释指向服务端而不是本地出站抓取，不要指望它给出请求字节。

第 3 条不需要任何 key，也不产生外部流量，是下一步最该先做的动作。第 2 条需要 key，但能同时验证连接与契约。

## 9. 本次扫描的边界

以下内容没有被本文件证明，后续任务不得当成既有事实：harness 实际调用的 host 与路径；是否存在独立 Interactions endpoint；SDK 的 Interactions 契约与 IDE 登录态是否可互通；`previous_interaction_id` 在真实服务端是否被接受；缓存指标是否真的出现。这些问题只有在 A/C 阶段取得真实请求与响应后才能回答。
