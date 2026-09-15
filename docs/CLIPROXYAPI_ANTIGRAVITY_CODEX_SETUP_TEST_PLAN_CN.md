# CLIProxyAPI 启动、Antigravity 登录测试与 Codex 接入计划

状态：已执行完毕，实测结果与产物见 [CLIPROXYAPI_ANTIGRAVITY_CODEX_TEST_REPORT_CN.md](CLIPROXYAPI_ANTIGRAVITY_CODEX_TEST_REPORT_CN.md)。执行中的两处偏差：运行配置改用 CLIProxyAPI 自身已忽略的 `config.yaml` 与 `auths/`，避免污染嵌套参考仓库；服务与 Codex CLI 需在沙箱外运行，否则无法访问 Google。

## 目标与范围

先运行本地 `reference/CLIProxyAPI`，通过其网页登录 Antigravity，验证真实模型调用成功，再向 Codex 的 `config.toml` 增加 CLIProxyAPI provider 并实测。

链路：Codex Responses → CLIProxyAPI 自带协议转换 → Antigravity Cloud Code → CLIProxyAPI Responses SSE → Codex。

本次使用 CLIProxyAPI 已有能力，不开发新转换器，不改 copilot-api 的路由、鉴权或转换器，不执行其他看板。本文是执行计划，尚未启动服务、登录或修改 Codex 配置。

## 已核对的依据

- `reference/CLIProxyAPI/cmd/server/main.go`：支持 `-config`、`-antigravity-login`、`-no-browser`。
- `reference/CLIProxyAPI/config.example.yaml`：默认端口 8317，使用 `auth-dir` 保存账号凭据、`api-keys` 校验本地客户端请求。
- `reference/CLIProxyAPI/internal/api/server_routes.go`：提供 `GET /v1/models`、`POST /v1/responses`。
- `reference/CLIProxyAPI/internal/translator/antigravity/openai/responses/`：已有 Responses 请求及响应转换。
- `reference/CLIProxyAPI/go.mod`：本地版本要求 Go 1.26.0，执行前检查工具链。
- 用户已验证 IDE 使用 `https://daily-cloudcode-pa.googleapis.com/v1internal:streamGenerateContent?alt=sse`。实测记录 CLIProxyAPI 最终使用的 Cloud Code 地址；不能把公开 Gemini API 调用当作 Antigravity 调用。

## 1. 启动 CLIProxyAPI

1. 检查本地参考仓库说明、版本、Go 工具链、可用二进制和 8317 端口。存在运行实例时先识别配置与账号，不覆盖或终止无关服务。
2. 在 `reference/CLIProxyAPI` 下使用一份 `config.local.yaml` 和独立的 `auths-local` 目录。本次只登录 Antigravity，避免调用落到其他 provider。运行配置和凭据不加入 Git。
3. 配置直接包含本地 API key，不另建 key 文件或多层配置引用。生成真实随机值替换以下说明性占位符：

```yaml
host: "127.0.0.1"
port: 8317
auth-dir: "I:/Cache/workshop/copilot-api/reference/CLIProxyAPI/auths-local"
api-keys:
  - "<执行时生成的本地客户端访问密钥>"
remote-management:
  allow-remote: false
  secret-key: ""
  disable-control-panel: true
```

此 key 是 Codex 访问本地代理的密钥，与 Google OAuth 凭据不同；不需要 Gemini API key。

没有适用的现成二进制时，在 `reference/CLIProxyAPI` 工作目录构建并启动：

```powershell
go build -o ./cli-proxy-api.exe ./cmd/server
./cli-proxy-api.exe -config ./config.local.yaml
```

若后台启动，使用隐藏窗口，记录 PID 与日志路径。验收：进程持续运行，带本地 key 请求 `/v1/models` 能获得正常 HTTP 响应。未登录时模型为空不代表推理已通过。

## 2. 使用 CLIProxyAPI 登录 Antigravity

在相同工作目录、另一个终端执行：

```powershell
./cli-proxy-api.exe -config ./config.local.yaml -antigravity-login
```

使用其真实 OAuth 浏览器流程，由用户完成 Google 账号选择及授权。检查 CLI 回调成功、凭据落入指定 auth-dir、服务加载该账号。若服务没有自动加载，重启本次实例。

不能用“生成了授权链接”或“打开了浏览器”作为登录成功。等待用户授权期间保持该步骤未完成。记录 CLIProxyAPI 使用的 User-Agent 和上游地址，不自行替换为 curl UA。

## 3. 通过运行中的代理进行真实调用

使用一个最小本地 HTTP 测试脚本调用 CLIProxyAPI，不绕过它直接请求 Google。请求头为 `Authorization: Bearer <本地客户端访问密钥>`。

1. 请求 `GET http://127.0.0.1:8317/v1/models`，保存模型列表。选择确实由已登录 Antigravity 账号提供的模型 ID；如存在目标 Gemini 3.8 Flash 则使用其实际 ID，否则如实报告，不猜测或静默替换。
2. 向 `POST http://127.0.0.1:8317/v1/responses` 发送实际模型 ID 和简单文本，`stream: true`，完整读取 SSE 至终态。
3. 检查真实文本、事件顺序、最终响应及错误；结合服务日志确认请求走 Antigravity Cloud Code，记录实际 endpoint。
4. 追加一轮携带历史的调用，以及 function call → function output → 最终回答测试。按 CLIProxyAPI 实际支持的续接方式传递状态；记录 ID、工具关联、reasoning/signature 的真实表现，不先假定支持 `previous_response_id` 服务端续接。

最小请求：

```json
{
  "model": "<模型列表确认的 Antigravity 模型 ID>",
  "input": "请只回复 ANTIGRAVITY_PROXY_OK",
  "stream": true
}
```

保存完整请求、响应 SSE、终态和日志，不对协议字段做脱敏、截断或删除。不得以 HTTP 200、空 SSE、模型列表成功代替推理成功。失败时定位登录、模型路由、上游调用或协议转换层，保留原始错误。

## 4. 增加 Codex provider 并调用

仅在上一步真实文本推理通过后执行。确定实际 `CODEX_HOME`；未设置时使用 `C:/Users/Jeff/.codex/config.toml`。先备份，检查是否已有同名 provider，再只增加所需条目，保留已有默认模型、provider、项目设置和其他内容。

预期配置如下，执行时对照已安装 Codex CLI 的支持情况核对：

```toml
[model_providers.cliproxyapi]
name = "CLIProxyAPI"
base_url = "http://127.0.0.1:8317/v1"
env_key = "CLIPROXYAPI_API_KEY"
wire_api = "responses"
requires_openai_auth = false
```

`CLIPROXYAPI_API_KEY` 由启动测试的 PowerShell 从 `config.local.yaml` 的真实 key 设置到当前进程环境，供 Codex 子进程继承；不新增凭据文件。正式持续使用时，确保启动 Codex 的进程也有该变量。

用单次配置覆盖选择新增 provider，不改变全局默认：

```powershell
codex exec -c 'model_provider="cliproxyapi"' -m '<已验证的模型 ID>' '请只回复 CODEX_ANTIGRAVITY_OK'
```

记录 CLI 版本、退出码、输出及对应代理日志。随后在临时测试目录验证一次文件读取工具调用，以及同一会话的后续提问。不得通过禁用 `web_search`、删除工具或丢弃状态来宣称兼容；不支持的能力单独记录。本文验证 HTTP/SSE，不新增 WebSocket 工作。

Codex 配置官方参考：<https://developers.openai.com/codex/config-reference>。本次撰写时网络访问受限，未能在线读取该页；配置字段及命令需在执行阶段核对本机 CLI，不把模板视为已经实测。

## 验收与交付

按顺序记录：服务启动、OAuth 登录完成、Antigravity 真实 SSE 推理、工具及多轮结果、Codex 配置新增、Codex CLI 端到端结果。每项分别标记通过、失败或等待，不用前一项成功代替后一项。

交付一份实际测试报告，附配置路径、账号凭据目录、进程 PID、模型 ID、实际上游地址、完整测试产物路径及已知兼容性问题。任何失败项保留为未完成，并写明下一步。不要提前宣称“已可直接使用”。

回退时只停止本次启动的服务、撤销本次新增的 Codex 配置条目及进程环境变量；保留测试证据和登录凭据，不批量清理其他内容。
