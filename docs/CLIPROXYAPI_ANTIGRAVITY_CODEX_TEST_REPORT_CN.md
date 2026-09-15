# CLIProxyAPI + Antigravity + Codex 实测报告

执行对象：[CLIPROXYAPI_ANTIGRAVITY_CODEX_SETUP_TEST_PLAN_CN.md](CLIPROXYAPI_ANTIGRAVITY_CODEX_SETUP_TEST_PLAN_CN.md)

## 结论

计划中的四步全部通过：CLIProxyAPI 在本机构建并启动、Antigravity OAuth 登录成功、经代理的真实推理与工具调用成功、Codex CLI 通过新增的 `cliproxyapi` provider 端到端调用成功。Codex 不需要切换默认 provider，单次命令覆盖 `model_provider` 即可使用 Antigravity 模型。

链路实测为：`Codex Responses → CLIProxyAPI → daily-cloudcode-pa.googleapis.com/v1internal:streamGenerateContent → Responses SSE → Codex`。

## 环境与产物

| 项目 | 值 |
|---|---|
| 构建工具链 | `go1.26.8 windows/amd64` |
| 构建命令 | `go build -buildvcs=false -o ./cli-proxy-api.exe ./cmd/server`（`GOCACHE`/`GOTMPDIR` 指向工作区，`-buildvcs=false` 规避沙箱内 git 读取失败） |
| 二进制 | `reference/CLIProxyAPI/cli-proxy-api.exe`，89,307,136 字节 |
| 运行配置 | `reference/CLIProxyAPI/config.yaml` |
| 凭据目录 | `reference/CLIProxyAPI/auths/` |
| 服务进程 | PID 5528，监听 `127.0.0.1:8317` |
| 账号 | `tokyoblackboxanimesalon@gmail.com`，GCP project `aicode-consumers` |
| Codex CLI | `codex-cli 0.153.4` |
| Codex 配置 | `C:\Users\Jeff\.codex\config.toml`，备份 `config.toml.before-cliproxyapi-20260913-114548.bak` |

计划里写的 `config.local.yaml` / `auths-local` 未采用：这两个名字不在 CLIProxyAPI 自身的 `.gitignore` 内，会污染该嵌套仓库；实际使用 `config.yaml` 和 `auths/`，二者已被 CLIProxyAPI `.gitignore` 忽略，主仓库也已整体忽略 `/reference`。

## 步骤结果

| 步骤 | 结果 | 证据 |
|---|---|---|
| 1 启动服务 | 通过 | `API server started successfully on: 127.0.0.1:8317`，`GET /v1/models` 返回 200 |
| 2 Antigravity 登录 | 通过 | `Antigravity authentication successful!`，凭据文件落盘，服务热加载 11 个模型 |
| 3 代理真实推理 | 通过 | 3 组直接调用（基础、多轮、工具闭环）均 200 且返回预期文本 |
| 4 Codex provider 接入 | 通过 | `codex exec` 退出码 0，`CODEX_ANTIGRAVITY_OK`；工具读取与续接均通过 |

沙箱内出网被拦截，服务与 CLI 必须在沙箱外运行；服务启动日志中先出现 `raw.githubusercontent.com` 拉取失败，改用沙箱外启动后成功拉到 `version=2.13.0`。

## 上游与协议证据

Antigravity 模型列表（11 个）：`gemini-3.8-flash-high`、`gemini-3.7-flash-high`、`gemini-3.6-flash-high`、`gemini-3-flash`、`gemini-3.1-flash-lite`、`gemini-3.1-pro-low`、`gemini-3.1-flash-image`、`gemini-pro-agent`、`claude-opus-4-6-thinking`、`claude-sonnet-4-6`、`gpt-oss-120b-medium`。

实际上游地址为 `https://daily-cloudcode-pa.googleapis.com` + `/v1internal:streamGenerateContent`。依据：`antigravity_executor_request.go` 的 `resolveAntigravityRequestBaseURL` 对无自定义 `base_url` 的消费者凭据返回 daily；本次凭据文件无 `base_url` 字段。请求 UA 为 `antigravity/hub/2.13.0 darwin/arm64`。

服务日志确认每次推理都落到 Antigravity OAuth 凭据：

```
[conductor_execution.go:1803] Use OAuth provider=antigravity auth_file=antigravity-tokyoblackboxanimesalon@gmail.com.json for model gemini-3.8-flash-high
```

缓存命中是上游真实回报，不是客户端估算：翻译层把上游 `cachedContentTokenCount` 映射为 Responses 的 `cached_tokens`（`helps/usage_helpers.go`、`translator/antigravity/...`），Codex 因此输出 `cached_input_tokens`。Codex 工具调用那一轮为 `cached_input_tokens=49215`，续接一轮为 `73808`。直接调用首次命中为 0，符合首次无前缀可复用的预期。

推理载体连续性：工具调用响应中包含 `reasoning` item 的 `encrypted_content`（前缀 `cpa-gemini-responses-carrier-v1`）与 `function_call` 的 `call_id`，回传 `function_call_output` 后模型正确给出最终答案。服务端 `antigravity replay: accumulator commit terminal=true` 在多轮间复用同一 `session=` 值。

## Codex CLI 实测

新增的 provider：

```toml
[model_providers.cliproxyapi]
name = "CLIProxyAPI"
base_url = "http://127.0.0.1:8317/v1"
wire_api = "responses"
env_key = "CLIPROXYAPI_API_KEY"
requires_openai_auth = false
supports_websockets = false
request_max_retries = 0
stream_max_retries = 0
```

默认 `model_provider` 仍为 `copilot_api`，未改动。测试只在命令内覆盖：

```powershell
codex exec --strict-config -c 'model_provider="cliproxyapi"' -c 'model_reasoning_effort="low"' -m gemini-3.8-flash-high -s read-only -C <dir> --skip-git-repo-check --json "<prompt>"
```

| 用例 | 结果 |
|---|---|
| 单轮纯文本 | 退出码 0，返回 `CODEX_ANTIGRAVITY_OK` |
| 工具调用（读取 `fixture.txt`） | 退出码 0，`command_execution` 成功，返回 `CLIPROXY_MARKER_9F3A21` |
| `exec resume` 同 thread 续接 | 退出码 0，未读文件直接复述同一 marker，证明上下文连续 |

## 已知问题与未覆盖

本次测试时 `gemini-3.8-flash-high` 不在 `codex-models.json` 目录里，Codex 每次都会警告 `Unknown model ... falling back to model metadata`。该缺口已修复：目录现含 `gemini-3.8-flash-high`（显示名 Gemini 3.8 Flash），声明 low/medium/high 三档推理强度，slug 是 CLIProxyAPI 唯一接受的上游 id，实际思考深度由 `reasoning.effort` 决定。仓库内 `src/services/antigravity/models.ts` 以扩展条目形式定义，Copilot 网关启动重写目录时不会丢弃。

`web_search` 未在本次禁用，也未验证 Antigravity 是否支持 Responses 的 web_search 工具；Codex 发出的内置工具是否被上游接受需要单独测试。

WebSocket 传输未测试。provider 显式设置 `supports_websockets = false`，仅验证 HTTP/SSE 路径。

未验证多账号轮询、配额耗尽与 429/5xx 退避、图片与多模态输入。`gemini-3.1-flash-image` 在侧仅出现在模型列表中，未做实际调用。

## 测试产物

均在 `reference/CLIProxyAPI/logs/` 下，保留原始内容未做脱敏或截断：

- `server.out.log`、`server.err.log`：服务端日志
- `antigravity-login.out.log`：OAuth 登录输出
- `test-responses-1.sse.log`：直接基础调用
- `test-responses-2-multiturn.sse.log`：直接多轮调用
- `test-responses-3-toolcall-stage1.sse.log`、`test-responses-3-toolcall-stage2.request.json`、`test-responses-3-toolcall-stage2.sse.log`：工具调用两阶段
- `codex-exec-1.jsonl`、`codex-exec-2-toolcall.jsonl`、`codex-exec-3-resume.jsonl`：Codex CLI 三次运行的 JSON 事件

## 回退

停止 PID 5528 即可结束代理；删除 `config.toml` 中的 `[model_providers.cliproxyapi]` 表或还原备份即可撤销 Codex 侧改动。`config.yaml` 中的本地客户端密钥同时作为 `CLIPROXYAPI_API_KEY` 使用，需要按使用场景在启动 Codex 的进程里设置。`auths/` 下的 Google 凭据保留，删除后需重新登录。

## 本地无 key 配置（2026-09-13）

CLIProxyAPI 的 api-keys 已设为空数组；Codex provider 的 env_key 已移除，先前创建的 CLIPROXYAPI_API_KEY 用户环境变量已删除。服务监听 127.0.0.1:8317，Antigravity OAuth 登录凭据继续用于上游鉴权。

验证：不设置客户端 key 的 Codex CLI 调用返回 CODEX_NO_KEY_OK。
