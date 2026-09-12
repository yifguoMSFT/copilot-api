# Codex 透传与登录：使用说明

本文说明如何让 Codex 通过本地 copilot-api 网关使用 ChatGPT/Codex 账号，并在同一个 provider、同一个端点的前提下，用切换模型的方式把请求路由到 Codex、Copilot 或 DeepSeek。

范围与依据：[CODEX_PASSTHROUGH_LOGIN_IMPLEMENTATION_TEST_PLAN_CN.md](CODEX_PASSTHROUGH_LOGIN_IMPLEMENTATION_TEST_PLAN_CN.md) 的 P4，以及 [CODEX_PASSTHROUGH_LOGIN_IMPLEMENTATION_REPORT_CN.md](CODEX_PASSTHROUGH_LOGIN_IMPLEMENTATION_REPORT_CN.md) 的实施记录。本说明只描述已经实现的行为；未实测和未实现的部分集中在第 8 节。

## 1. 这套方案做什么、不做什么

网关只做两件事：**注入鉴权** 和 **原样转发**。

- 客户端始终只连一个本地 provider（`http://127.0.0.1:4141/v1`），只发标准 Responses 请求。
- 网关按请求体里的 `model` 选择上游：Codex 精确匹配 → DeepSeek 精确匹配 → Copilot 兜底。
- Codex 分支把 `Authorization` 换成 ChatGPT access token、补 `Chatgpt-Account-Id`，请求体与响应体逐字节透传，不做协议转换、不改写 SSE。
- 因此“切换模型”就是在 App 模型菜单里换一个模型，不需要改 provider、不需要改端点、不需要重启网关。

不做的事：不实现 WebSocket relay，不实现 `/responses/compact`，不做跨上游的历史迁移。切换模型不会也不应该把上一个上游的 `previous_response_id`、加密 reasoning 或压缩项搬到另一个上游；需要这些状态时请新建任务或发送自包含的历史。

## 2. 前置条件

| 项目 | 要求 |
|---|---|
| 运行时 | Bun（本项目脚本与测试使用 Bun） |
| 账号 | 一个可用的 ChatGPT/Codex 账号，浏览器登录一次 |
| 网关密钥 | 环境变量 `COPILOT_API_GATEWAY_API_KEY`，由你自己生成 |
| 配置 | `config.json` 中 `providers.codex`（见第 3 节） |

网关密钥只在环境变量里读取，配置文件没有对应字段，也不会写进任何凭据文件。它只用来保护本地 Codex 路由：Copilot 与 DeepSeek 端点保持原来的可达性，不受影响。启用 Codex 却缺少该密钥时，服务在加载配置阶段直接失败，而不是启动后再静默放行。

## 3. 服务端配置

`config.json` 的最小示例（字段与 `src/lib/runtime-config.ts` 的 schema 一一对应，可直接使用）：

```json
{
  "version": 1,
  "defaults": {
    "providers": {
      "codex": {
        "enabled": true,
        "baseUrl": "https://chatgpt.com/backend-api/codex",
        "models": ["gpt-5.5"],
        "authProfile": "default",
        "transport": "http"
      },
      "copilot": { "enabled": true },
      "deepseek": { "enabled": false }
    }
  }
}
```

`providers.codex` 字段：

| 字段 | 默认值 | 说明 |
|---|---|---|
| `enabled` | `false` | 缺省关闭，旧配置无需迁移即可继续运行 |
| `baseUrl` | `https://chatgpt.com/backend-api/codex` | 只允许 `https://chatgpt.com` 这个 origin，否则拒绝启动 |
| `models` | `[]` | 精确匹配的上游模型 ID；启用时至少一个 |
| `authProfile` | `default` | 凭据档案名，按安全文件名规则校验 |
| `transport` | `http` | 目前只接受 `http`，其他值校验失败 |

环境变量覆盖：`COPILOT_API_CODEX_ENABLED`、`COPILOT_API_CODEX_BASE_URL`、`COPILOT_API_CODEX_AUTH_PROFILE`，网关密钥使用 `COPILOT_API_GATEWAY_API_KEY`。布尔覆盖只接受 `true` 或 `false`。

`models` 里写什么，`/models` 就发布什么，`/responses` 就按它精确匹配。模型名不会被改写，也不会在 Codex 未命中时回落到 Copilot。同一个模型同时出现在 Codex 与 DeepSeek、或与 Copilot 模型/别名重名时，启动阶段直接失败，避免请求带着错误的凭据打到没有授权的地方。

## 4. 登录、查看与退出

```bash
# 浏览器登录，默认档案 default
bun run ./src/main.ts codex-auth login

# 指定档案
bun run ./src/main.ts codex-auth login --profile work

# 查看状态（只输出是否登录、到期时间与脱敏标识，不输出 token）
bun run ./src/main.ts codex-auth status

# 删除本地凭据
bun run ./src/main.ts codex-auth logout
```

登录流程的确定行为：

- 使用 PKCE（S256）与随机 `state`，回调监听 `127.0.0.1:1455` 上的 `/auth/callback`，超时 5 分钟；端口被占用时给出明确错误，不会偷偷换端口。
- 浏览器打不开时会打印授权 URL，可手动打开。
- 凭据写在用户数据目录 `~/.local/share/copilot-api/codex/<profile>.json`（Windows 为 `%USERPROFILE%\.local\share\copilot-api\codex\<profile>.json`），同目录临时文件原子替换；POSIX 下文件权限为 0600。
- `status` 只显示登录状态、到期时间和脱敏后的邮箱/账号标识。
- `logout` 只删除本地凭据，**不撤销服务端授权**。

凭据生命周期：

| 情况 | 行为 |
|---|---|
| 距到期不足 60 秒 | 发送请求前自动刷新，并发请求共享同一次刷新 |
| 刷新返回轮换后的 refresh token | 与 access token、account ID 一起写入同一版本 |
| refresh token 被拒绝（`invalid_grant`） | 该凭据标记为需重新登录，后续请求返回 `503 codex_login_required`，不再反复消耗已撤销的 grant |
| 刷新遇到网络错误或 429/5xx | 保留凭据并分类为暂时不可用，返回 `503 codex_auth_unavailable` |
| CLI 与运行中的代理同时操作同一档案 | 通过跨进程档案锁与版本重读串行化，重新登录不会被在途刷新覆盖，退出后不会复活 |

## 5. 启动与停止

```bash
# 只启用 Codex 时无需 GitHub/Copilot 登录
COPILOT_API_GATEWAY_API_KEY="<你的本地网关密钥>" \
  bun run ./src/main.ts start --config config.json

# 换端口
... bun run ./src/main.ts start --config config.json --port 4141

# 显式对外监听（默认只绑定 127.0.0.1）
... bun run ./src/main.ts start --config config.json --host 0.0.0.0
```

- 默认绑定 `127.0.0.1`（相对旧版本的行为变化）。网关持有 ChatGPT 凭据，默认只服务本机；确需对外暴露时用 `--host`，并自行承担风险。
- 缺少 Codex 登录不阻塞启动：服务照常监听并打印提示，Codex 模型请求返回 `503 codex_login_required`，其他已启用 provider 仍可用。无人值守重启因此不会被交互式登录卡住。
- 启动时会刷新 Codex 模型目录（第 6 节），并按需引导各 provider；只启用 Codex 的配置不会访问 GitHub 或 Copilot 接口。
- 停止：向前台进程发送 `Ctrl+C`；没有额外的守护进程或后台任务需要清理。

## 6. 模型目录：网关 `/models` 与 App catalog 是两条路径

| 路径 | 作用 | 内容来源 |
|---|---|---|
| 网关 `GET /models`、`GET /v1/models` | 告诉客户端“这个网关现在能路由哪些模型” | 运行时配置：启用的 Codex 模型 + 启用的 DeepSeek 模型 + Copilot 目录 |
| App 的 `model_catalog_json` | 决定 Codex 模型菜单里能看到什么 | 启动时生成的 `codex-models.json`（上游 catalog + `codex-models-custom.json` 合并） |

两点容易混淆：

1. **只有启用状态才会发布路由**。Codex provider 关闭时，它的模型既不出现在 `/models`，也不会被 `/responses` 路由；命中但未启用的模型直接报错，不会回落到 Copilot。
2. **目录存在不等于可路由**。`codex-models.json` 只是模型元数据（描述、上下文窗口、推理档位、模态等），它不配置端点、密钥或鉴权。反过来，一个已配置但目录里没有的模型仍然可以被路由，只是 App 菜单里选不到它。

`/models` 中 Codex 条目的结构：身份与路由字段（`id`、`object`、`type`、`created`、`created_at`、`owned_by: "codex"`）由配置决定，`display_name` 与能力元数据（`context_window`、`max_context_window`、`input_modalities`、`supported_reasoning_levels`、`default_reasoning_level`、`supports_parallel_tool_calls`、`description`）在目录里有对应条目时才附带。目录缺失或损坏不影响该接口：条目退化成只有身份的形态，而不是让请求失败。

启动时会检查覆盖情况：配置了但目录里没有的模型会打印警告，提示把条目补进 `codex-models-custom.json`。补完后需要重启 Codex 才会重新读取目录。

## 7. 接入 Codex

### 7.1 在 `~/.codex/config.toml` 声明 provider

```toml
[model_providers.copilot-api]
name = "copilot-api"
base_url = "http://127.0.0.1:4141/v1"
wire_api = "responses"
env_key = "COPILOT_API_GATEWAY_API_KEY"
```

`base_url` 指向网关的 `/v1`，`wire_api = "responses"` 表示使用 Responses 协议；`env_key` 让 Codex 从同名环境变量读取网关密钥，取值必须与网关进程看到的 `COPILOT_API_GATEWAY_API_KEY` 一致。

字段来源：`model_providers`、`wire_api`、`env_key` 的写法引自 [Better-Codex-App-Custom-Provider-Support 的 README](I:/Cache/workshop/Better-Codex-App-Custom-Provider-Support/README.md)（自定义 Codex provider 一节）。`env_key` 与 `[model_providers.<id>.auth]` 互斥，不要同时配置；不想把密钥放进环境变量时，可改用该仓库示例中的 `auth` 命令形式。

### 7.2 目录与生效步骤

1. 启动一次网关，让它生成 `codex-models.json`（默认在当前工作目录）。
2. 在 `~/.codex/config.toml` 顶层指向该文件（路径按你的检出位置调整）：

   ```toml
   model_catalog_json = "/absolute/path/to/copilot-api/codex-models.json"
   ```

3. 重启 Codex；用 `codex debug models` 确认生效的目录里包含你要用的模型。
4. 目录缺条目时，把它补进工作目录的 `codex-models-custom.json`（结构同为 `{ "models": [...] }`，同 `slug` 覆盖上游条目），重启网关重新生成，再重启 Codex。

### 7.3 桌面 App 的 provider 菜单

原版 Codex 桌面 App 没有切换 provider 的入口，任务默认走 ChatGPT 登录。要让 App 按任务选择这个网关，需要 [Better-Codex-App-Custom-Provider-Support](I:/Cache/workshop/Better-Codex-App-Custom-Provider-Support/README.md) 这类补丁提供 provider 菜单，并在 `~/.codex/desktop-model-providers.json` 中登记：

```json
{
  "version": 1,
  "default_provider": "openai",
  "providers": [
    { "id": "openai", "label": "ChatGPT / OpenAI", "description": "Uses your signed-in ChatGPT account" },
    { "id": "copilot-api", "label": "copilot-api", "description": "Uses [model_providers.copilot-api] from config.toml" }
  ],
  "model_providers": {
    "gpt-5.5": "copilot-api"
  }
}
```

- `providers` 决定菜单里出现哪些 provider；`model_providers` 把具体模型 slug 映射到 provider；`default_provider` 处理没有显式映射的模型。
- 每个自定义 provider ID 都必须能在 `config.toml` 里找到同名 `[model_providers.<id>]`。
- 这个文件里不放任何密钥；App 会在打开 provider 菜单和新任务开始时重新读取它。
- 只要 `default_provider` 保持 `openai`，未映射的模型仍然走 ChatGPT 登录，因此可以把网关模型和官方模型并存。

在同一个任务里从 `gpt-5.5` 切到 Copilot 模型再切回，使用的仍是这一个 provider 和这一个端点；路由由网关按模型决定。

## 8. 未实测与未实现

| 项目 | 现状 |
|---|---|
| 真实账号登录、真实模型调用 | **未执行**。P4 到此为止只验证本地实现与测试，真实登录与端到端验收属于“准备真实账号与 App 验收范围”审查门之后的工作 |
| 桌面 App provider 菜单与 `model_providers` 映射 | 依据参考仓库文档编写，未在本机实测 |
| Codex CLI 按任务选择该 provider 的具体参数 | 未在本机实测；请以 `codex --help` 与官方文档为准 |
| `/responses/compact` | **未实现**。真实客户端两轮请求（含工具回传）未触发 compact，因此按需判定为跳过；一旦客户端真的发起该请求会失败，届时需要按同一鉴权与转发方式补上 |
| WebSocket 传输 | **未实现，且本看板已明确不做**。当前只有 HTTP Responses/SSE 一条路径 |
| 跨上游历史迁移 | 不支持。切换上游时应发送自包含历史或新建任务 |
| 上游 401 后自动重试 | 不做。推理请求只发一次，上游状态码原样返回 |

## 9. 故障诊断

| 现象 | 含义 | 处理 |
|---|---|---|
| 启动失败：`Missing Codex gateway API key` | 启用了 Codex 但没有 `COPILOT_API_GATEWAY_API_KEY` | 设置该环境变量后重启 |
| 启动失败：`Codex base URL must stay on https://chatgpt.com` | `baseUrl` 指向了非官方 origin | 改回 `https://chatgpt.com/backend-api/codex` |
| 启动失败：`Codex provider requires at least one configured model` | `enabled: true` 但 `models` 为空 | 至少配置一个模型 ID |
| 启动失败：`Model is configured for both the Codex and ...` | 同一个模型被两个上游声明 | 从其中一个 provider 的模型列表里移除 |
| `401 gateway_unauthorized` | 请求缺少或带错了网关密钥 | 让客户端发送 `Authorization: Bearer <网关密钥>` 或 `x-api-key`，取值与网关一致 |
| `503 codex_login_required` | 本地没有该档案的凭据，或 refresh token 已被拒绝 | 重新执行 `codex-auth login --profile <档案>` |
| `503 codex_auth_unavailable` | 刷新因网络或上游 429/5xx 失败 | 稍后重试；凭据仍然保留 |
| 模型在网关可用但 App 菜单里没有 | App 目录缺条目 | 补 `codex-models-custom.json`，重启网关与 Codex |
| 切换模型后上下文报错 | 目标上游不接受上一个上游的历史项 | 新建任务，或发送自包含的文本/工具历史 |
| 请求提示 compact 或 WebSocket 相关失败 | 该能力未实现 | 见第 8 节，当前需要避免依赖它 |

诊断命令：

```bash
bun run ./src/main.ts codex-auth status            # 登录状态
curl -s http://127.0.0.1:4141/models | head        # 网关当前发布的模型
codex debug models                                 # Codex 看到的有效目录
```

日志只记录路由、状态码、耗时、字节数和必要的关联 ID，不记录正文、token、OAuth code、verifier 或 Cookie；`--verbose` 也不会改变这一点。

## 10. 安全边界

- ChatGPT 凭据只存放在本地凭据文件里，只会发送到 `https://chatgpt.com`；配置层拒绝把凭据指向其他 origin。
- 客户端请求头里的 `authorization`、`cookie`、`x-api-key`、`chatgpt-account-id` 会被替换或剥离，绝不会转发给上游；`connection` 列出的头与 `proxy-*` 一并剥离。
- 网关默认只监听 `127.0.0.1`。对外暴露等于把 ChatGPT 凭据的代理入口开放给网络，必须同时保证网关密钥强度与网络边界。
- `codex-auth logout` 只清理本地凭据，不撤销服务端授权；需要撤销请在账号侧操作。
