# Gemini Interactions v1 → Codex CLI 转换器联调方案

日期：2026-09-12。状态：方案，尚未实施网络接入或修改 Codex 配置。
工作目录：I:/Cache/workshop/worktree/copilot-api-antigravity-interactions。
前置审核：ANTIGRAVITY_INTERACTIONS_REVIEW_CN.md。

## 目标与最小范围

使用 gemini-3.8-flash，经 https://generativelanguage.googleapis.com/v1/interactions 验证已有 Responses ↔ Interactions 转换器。新增一个独立本地测试桥接脚本和测试样本即可，不接入 copilot-api 现有路由、启动流程、模型目录或鉴权模块。

链路：

Codex CLI → HTTP POST http://127.0.0.1:4830/v1/responses → 现有转换函数 → HTTPS POST Google /v1/interactions → JSON/SSE 转换 → Codex CLI。

端口 4830 是建议值，启动前检查占用。不实现 WebSocket。测试 Google 模型，不设置 Antigravity agent；这项验收不能证明 Antigravity endpoint 或登录兼容性。

## 前置条件与已核对事实

- 本机 codex-cli 0.153.4、Bun 1.4.2；已只读查看 exec 和 exec resume 帮助。
- 正确配置名是 config.toml，不是 config.tomal。
- 用户配置通常是 C:/Users/Jeff/.codex/config.toml；执行前检查实际 CODEX_HOME，若已设置则使用其 config.toml，不覆盖 CODEX_HOME。
- 新版官方参考明确：项目级 .codex/config.toml 不接受 provider 配置，provider 应放用户级配置。
- v1 官方 REST 示例使用 /v1/interactions 和 x-goog-api-key。
- 页面 banner 明确给出 gemini-3.8-flash，但枚举与示例存在滞后；第一步必须用该模型做最小请求。失败记录原始 HTTP 状态和脱敏诊断，不换成 3.6、3.7 或 v1beta。
- 当前没有可供调用的桥接服务；以下脚本名、配置与命令是待实现方案，不是现成功能。

## 本地密钥 placeholder

按用户要求先保留占位项，不搜索更多凭据，不复用 OAuth token。

建议新增 scripts/interactions-codex-live.example.json：

```json
{
  "geminiKeySource": {
    "path": "<LOCAL_GEMINI_CONFIG_PATH>",
    "field": "<GEMINI_API_KEY_FIELD>"
  }
}
```

联调时在版本控制外的本地副本填写真实配置路径和字段。初版只需读取选定 JSON 配置的点分字段路径，使用普通属性访问，不用 eval；若实际来源是其他格式，确认后实现那个格式即可，不做通用凭据发现器。缺文件、缺字段、空串或 placeholder 必须在监听及出网前失败。

Gemini key 仅由桥接进程读取并注入 x-goog-api-key。不得写入 Markdown、Codex config.toml、命令行参数、URL 或日志。不要把项目现有 deepseek.apiKey 当 Gemini key。脚本不调用现有 runtime-config，因其 schema 没有 Gemini 配置。

## 独立桥接脚本

建议新增 scripts/interactions-codex-live.ts，用 Bun.serve 与 fetch，直接 import 两个现有转换模块。

职责限制：

1. 仅监听 127.0.0.1；处理 POST /v1/responses 和一个无敏感数据的 health 接口。其他路径明确不支持，Upgrade 不升级。
2. 验证单独的本地临时 Bearer token；它与 Gemini key 不同，通过启动终端的 INTERACTIONS_TEST_TOKEN 环境变量供桥接器和 CLI 使用。
3. 将请求 JSON 交给 convertResponsesRequestToInteractions。显式 upstreamModel=gemini-3.8-flash，requestedModel 回显 CLI 模型名，customTools 从当前请求转换结果传给两个响应转换方向。
4. Google 上游地址固定，不接受客户端提交任意 endpoint。出站头只构造 Content-Type、Accept 和 x-goog-api-key；不复制 CLI Authorization、Cookie 或 OpenAI 账号头。不跟随意外重定向携带密钥。
5. stream=false 使用 JSON 转换；stream=true 逐字节喂给新的 InteractionsEventStream，输出 text/event-stream。正常 reader EOF 调用 flush；断开调用 cancel 并 abort fetch、取消 reader，释放资源。
6. 设请求体上限、有限超时和流空闲超时；初轮关闭自动重试，便于定位一次请求的真实失败。
7. 发出 SSE 前的上游 HTTP 非 2xx 返回 Responses 风格 error JSON，并保留可用 HTTP 状态；已发出 SSE 后发生失败必须输出失败终态或可辨识断流，不能补一个 completed。网络异常应有明确错误路径。
8. 可开启脱敏记录：入站 body、转换后的 body、上游 JSON/SSE、下游 SSE、CLI JSONL。只使用合成提示与测试文件；剔除认证头、key、签名明文及任何真实个人数据。签名连续性比较在内存中完成，记录相等布尔值、长度及摘要即可。
9. 当前请求的 session-id、prompt_cache_key 作为 metadata 传递/观测。不要声称 Google 识别 OpenAI session header，不自动塞进 labels，也不注入 prompt。不存会话历史，不建立 ID 映射表。

先修复审核中的累计 usage 和 errors 数组问题；实际 CLI 请求字段若被拒绝，保留脱敏 fixture 后在转换器内最小修正。不要在桥接层维护第二套转换逻辑。

## 用户级 config.toml 新增 provider

执行阶段先备份配置，追加唯一的新表；同名表存在时核对后修改该表，不能重复追加。保持已有默认 model_provider 等值。

```toml
[model_providers.gemini_interactions_test]
name = "Gemini Interactions v1 test"
base_url = "http://127.0.0.1:4830/v1"
wire_api = "responses"
env_key = "INTERACTIONS_TEST_TOKEN"
requires_openai_auth = false
supports_websockets = false
request_max_retries = 0
stream_max_retries = 0
```

不把 base_url 设为 Google 地址：Codex 发 Responses 协议，必须经过本地转换。无需在 provider 配置中存 Gemini key。临时 token 在启动终端内生成，传给桥接器及 CLI 子进程，不打印或写入文件；测试后移除当前进程环境中的该变量。

CLI 每次用 -c 显式选择 provider。无需新增模型目录或 profile，不影响其他会话。若已有用户默认 reasoning、verbosity、工具等设置导致不兼容，先记录实际请求，再用本次 CLI 覆盖已核实的配置；不要修改全局默认或静默删除有语义字段。

## 分阶段验证

### 1. 直接验证 Google v1

独立测试脚本从本地配置读 key，以同一个固定 endpoint 发送：

```json
{
  "model": "gemini-3.8-flash",
  "input": "Reply exactly V1_OK.",
  "store": false,
  "stream": false
}
```

要求 HTTP 2xx、可解析 interaction、实际 model/状态记录。再发送 stream=true，记录真实事件形状与统计位置。鉴权、配额、模型不可用或 endpoint 错误属于环境失败，不能归因于转换器。

随后用合成 Responses 请求分别验证桥接 JSON 和 SSE；同一上游录制 fixture 离线经过两条路径应产生相同最终 output/usage。两次真实生成可能不同，不能按文字全等比较两次模型调用。

### 2. 实际 Codex CLI 冒烟与请求采样

以下命令在脚本实现、provider 表追加、临时 token 设置后执行。CLI 的 --json 是本地运行事件，不是原始 HTTP SSE，必须同时保留桥接侧记录。

```powershell
codex exec --strict-config -c 'model_provider="gemini_interactions_test"' -c 'model_reasoning_effort="low"' -c 'web_search="disabled"' -m gemini-3.8-flash -s read-only --skip-git-repo-check -C "<SYNTHETIC_TEST_DIRECTORY>" --json "Do not call tools. Reply exactly CODEX_V1_OK."
```

成功条件：请求到达本地 bridge，出站路径和模型正确，CLI 正常结束并展示文本；没有 WebSocket Upgrade，未落到原有 provider。

第一份真实请求用于审核 tools、parallel_tool_calls、reasoning、text、include、phase 等实际字段。出现 unsupported field 是接入缺口，不通过把所有校验关闭来解决。记录哪些功能被 CLI 配置关闭，防止误报“完整 Codex 支持”。

### 3. 工具闭环与历史连续性

在隔离测试目录创建仅含合成数据的 fixture.txt，请 CLI 读取文件并回答其中随机标记。只提示它读取，模型并不保证执行，因此必须从 CLI 工具事件和桥接 call_id/result 记录确认真的执行。

要求：上游 function_call → Responses 工具调用 → Codex 执行 → 下一次请求中的 function_call_output/custom_tool_call_output → Google function_result → 正常回答。call_id 始终关联同一调用，参数和结果原文不变。实际 custom grammar 工具若被拒绝，先按审核建议处理再验收，普通 function 成功不能替代 custom 验收。

首轮启动不使用 --ephemeral。保存 CLI JSONL 中本次 thread/session ID；不要使用 --last，避免选中其他任务。用 exec resume 指定该 ID，示例：

```powershell
codex exec resume "<TEST_SESSION_ID>" -c 'model_provider="gemini_interactions_test"' -c 'model_reasoning_effort="low"' -c 'web_search="disabled"' -c 'sandbox_mode="read-only"' -m gemini-3.8-flash --json "Repeat the marker from the previous turn without reading the file again."
```

确认第二轮带回完整历史且无重复追加。再重启桥接进程，保持相同本地 token 和 provider，resume 同一测试会话，验证上下文仍连续。

### 4. Thought 重放与 ID

用需要多步推理和工具的合成任务取得实际 thought/signature。比较上游 thought → 下游 agdata1 → CLI 下一轮 encrypted_content → 解包后的 thought，要求签名字节一致、顺序不变、Google 接受。若本次未产生 thought/signature，结果是未覆盖，不能标通过。

同时观察不同轮次 step_0 等 item ID 是否引起替换、丢项或重复。response.id 原样使用 interaction.id 的策略需以真实 CLI 接受和续轮结果确认。

主验收使用 store=false 和完整历史。previous_response_id 的上游存储增量模式作为单独可选测试，不能与完整历史同时附加导致重复上下文；须先修复孤立工具结果 name 的限制。

### 5. 缓存、失败与取消

| 用例 | 证据与通过标准 |
|---|---|
| 同一合成长前缀连续请求 | 固定模型/key/指令/工具和历史顺序；记录 Google total_cached_tokens 与映射值相等 |
| 缓存没有命中 | 如实记录零或缺失；上下文正确不等于缓存命中，零命中不自动判转换失败 |
| 统计仅在 delta/stop 出现 | 终态保留最近累计统计，不能重复累加 |
| HTTP 401/403/429/5xx | 用本地响应替身覆盖错误转换；真实环境错误单独记录，不故意消耗配额 |
| SSE 中断、坏帧、超时 | CLI 看见失败；部分文本不丢，不出现虚假成功 |
| CLI 取消 | fetch/reader 停止、实例释放；后续请求独立正常 |
| 两个交错会话 | 不串文本、工具参数、metadata 或签名 |

缓存测试限制为少量请求，例如每个固定前缀最多三次；选择符合已核对模型缓存条件的合成长前缀。不通过无限重复调用追求 cache hit，不新增显式缓存资源管理。

## 交付与通过标准

执行阶段新增 bridge 脚本、placeholder 示例、脱敏真实 fixtures 及一份实际结果报告；仅修正本转换器和新增测试中经验证的缺口。测试日志放版本控制外，精简脱敏 fixture 才入库。

报告至少记录提交/CLI/Bun 版本、endpoint、模型、各用例结果、HTTP 状态、错误诊断、真实工具次数、thought 重放是否覆盖、usage 来源与 cache 数值；不包含 key。

核心验收要求文本、真实工具闭环、完整历史续轮、桥接重启后续轮和真实 thought 重放通过。缓存命中单独报告，未观测到就标未验证。此次 Google 模型测试不构成 Antigravity 验收。

结束时停止桥接器、清除临时 token，仅移除本次新增 provider 表或保留为显式测试入口；如期间配置有其他修改，不用旧备份整文件覆盖。既有源码接线、默认 provider 和主检出不变。

## 官方依据

- https://ai.google.dev/api/interactions-api-v1
- https://ai.google.dev/static/api/interactions-v1.md.txt
- https://generativelanguage.googleapis.com/v1/interactions
- https://learn.chatgpt.com/docs/config-file/config-reference （由 developers.openai.com/codex/config-reference/ 跳转）

配置字段已在线核对；本机 CLI --help 已核对。本轮只准备文档，未追加 provider、未启动桥接器、未使用凭据或调用 Gemini 生成。
