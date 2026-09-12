# Codex 透传与登录：使用说明

本文说明如何让 Codex 通过本地 copilot-api 网关使用 ChatGPT/Codex 账号，并在同一个 provider、同一个端点的前提下，用切换模型的方式把请求路由到 Codex、Copilot 或 DeepSeek。

启用 Codex 转发后，官方模型会以来源后缀发布成两份：`gpt-5.6-luna(copilot)` 走 Copilot，`gpt-5.6-luna(codex)` 走 ChatGPT/Codex。在模型菜单里换一个后缀，就是换一个上游。

范围与依据：[CODEX_PASSTHROUGH_LOGIN_IMPLEMENTATION_TEST_PLAN_CN.md](CODEX_PASSTHROUGH_LOGIN_IMPLEMENTATION_TEST_PLAN_CN.md) 的 P4，以及 [CODEX_PASSTHROUGH_LOGIN_IMPLEMENTATION_REPORT_CN.md](CODEX_PASSTHROUGH_LOGIN_IMPLEMENTATION_REPORT_CN.md) 的实施记录。本说明只描述已经实现的行为；未实测和未实现的部分集中在第 8 节。

## 1. 这套方案做什么、不做什么

网关只做两件事：**注入鉴权** 和 **原样转发**。

- 客户端始终只连一个本地 provider（`http://127.0.0.1:4141/v1`），只发标准 Responses 请求。
- 网关按请求体里的 `model` 选择上游：带 `(codex)` / `(copilot)` 后缀的已发布 ID 按来源路由，DeepSeek 模型精确匹配，其余合法模型仍走 Copilot。
- 裸官方 ID（不带后缀）始终代表 Copilot 路径。启用 Codex 不会改变已有会话里裸 ID 的含义，也不会把裸 ID 再发布一份到模型菜单。
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
        "authProfile": "default",
        "transport": "http"
      },
      "copilot": { "enabled": true },
      "deepseek": { "enabled": false }
    }
  }
}
```

这份配置省略了 `models`，含义是“官方目录里的模型全部归 Codex”；只需要一个开关就能同时得到 `(copilot)` 与 `(codex)` 两份模型。要收窄范围时再加白名单，例如 `"models": ["gpt-5.6-luna"]`：此时只有白名单内的模型发布 Codex 副本。`config.example.json` 给出的是同一个骨架，Codex 默认关闭。

`providers.codex` 字段：

| 字段 | 默认值 | 说明 |
|---|---|---|
| `enabled` | `false` | 缺省关闭，旧配置无需迁移即可继续运行 |
| `baseUrl` | `https://chatgpt.com/backend-api/codex` | 只允许 `https://chatgpt.com` 这个 origin，否则拒绝启动 |
| `models` | 省略 | 可选的基础模型 ID 白名单。省略表示使用官方目录里的全部模型；显式写空数组是配置错误 |
| `authProfile` | `default` | 凭据档案名，按安全文件名规则校验 |
| `transport` | `http` | 目前只接受 `http`，其他值校验失败 |

环境变量覆盖：`COPILOT_API_CODEX_ENABLED`、`COPILOT_API_CODEX_BASE_URL`、`COPILOT_API_CODEX_AUTH_PROFILE`，网关密钥使用 `COPILOT_API_GATEWAY_API_KEY`。布尔覆盖只接受 `true` 或 `false`。

白名单里只能写基础 ID（如 `gpt-5.6-luna`），不能写带后缀的 ID；重复 ID 或在 `models` 里写 `gpt-5.6-luna(codex)` 都会在启动阶段报错。白名单里出现官方目录和 `codex-models-custom.json` 都没有定义的模型时同样拒绝启动，不会临时合成一个残缺条目。

发布出的后缀是路由的唯一依据，`/models` 与生成的 `codex-models.json` 使用同一份映射。两个来源的同名模型靠后缀区分，因此 Codex 与 Copilot 可以同时提供 `gpt-5.6-luna`；真正会被拒绝的是同一个公开 ID 被占用两次。裸官方 ID 依旧按 Copilot 处理，不会因为它在 `codex.models` 里就改走 ChatGPT。

### 3.1 从旧的裸 Codex ID 迁移

改动前后最大的差别是：**裸 ID 的含义没有变，变的是 Codex 不再占用裸 ID**。

| 场景 | 改动前 | 改动后 |
|---|---|---|
| Codex 关闭 | 裸 ID 走 Copilot | 裸 ID 走 Copilot（不变） |
| Codex 开启，`models` 里写了裸 ID | 裸 ID 走 Codex | 裸 ID 仍走 Copilot；需要改选 `gpt-5.x(codex)` |
| 模型菜单 | 每个模型一份 | 双来源模型两份，共用的裸条目不再发布 |
| 旧任务/旧会话里的裸 ID | 走 Codex | 继续走 Copilot，因此不会悄悄换上游，但也不再是原来的账号 |

迁移步骤：

1. 更新配置：把 `providers.codex.models` 里的裸 ID 保留为基础 ID（例如 `["gpt-5.6-luna"]`），或整个删掉 `models` 表示使用全部官方模型。
2. 重启网关，让它重新生成 `codex-models.json` 与 `/models`；确认菜单里出现 `(codex)` / `(copilot)` 两个条目。
3. 重启 Codex 并重新选择模型：需要 ChatGPT 账号的会话选 `(codex)`。
4. 只把确需走 Codex 的 slug 写进 `desktop-model-providers.json` 的 `model_providers` 映射（见 7.3）。

除了裸 ID，`codex-auto-review` 这类 Copilot 别名也保持绑定 Copilot，不会因为目录里存在同名模型而改道。想回到改动前的行为，把 `providers.codex.enabled` 设回 `false` 并重启即可：目录恢复成一份裸 ID，网关不再发布任何后缀。

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
| 网关 `GET /models`、`GET /v1/models` | 告诉客户端“这个网关现在能路由哪些模型” | 启动时算出的发布映射：带来源后缀的 Codex/Copilot 条目 + 启用的 DeepSeek 模型 + 未复制的 Copilot 模型与别名 |
| App 的 `model_catalog_json` | 决定 Codex 模型菜单里能看到什么 | 同一份发布映射写出的 `codex-models.json`（官方 catalog + `codex-models-custom.json` 合并后按来源复制） |

两点容易混淆：

1. **只有启用状态才会发布路由**。Codex provider 关闭时，它的模型既不出现在 `/models`，也不会被 `/responses` 路由；命中但未启用的模型直接报错，不会回落到 Copilot。
2. **目录存在不等于可路由**。`codex-models.json` 只是模型元数据（描述、上下文窗口、推理档位、模态等），它不配置端点、密钥或鉴权。反过来，一个已配置但目录里没有的模型仍然可以被路由，只是 App 菜单里选不到它。

后缀条目的 `slug` 与 `display_name` 同时带后缀，元数据（工具模式、上下文窗口、推理档位、说明）直接复用基础定义；`owned_by` 记录来源。两份副本共享同一份定义，不需要为某个来源手写模型。模型定义里指向其他模型 ID 的结构化字段（例如升级目标）会映射到同来源的已发布 ID，找不到同来源目标时省略该引用，不会留下指向另一来源的悬空 ID。

只有确实提供该模型的来源才发布副本：官方目录里有、但当前 Copilot 账号拿不到的模型不会伪造出 `(copilot)` 条目；反过来，Copilot 独有的模型、DeepSeek 条目和扩展模型保持原来的裸 ID，不会被复制成两份。`codex-auto-review` 之类的别名继续发布并保持绑定 Copilot。

`/models` 中的条目结构：身份与路由字段（`id`、`object`、`type`、`created`、`created_at`、`owned_by`）由配置与来源决定，`display_name` 与能力元数据（`context_window`、`max_context_window`、`input_modalities`、`supported_reasoning_levels`、`default_reasoning_level`、`supports_parallel_tool_calls`、`description`）在目录里有对应条目时才附带。目录缺失或损坏不影响该接口：条目退化成只有身份的形态，而不是让请求失败。

启动时会检查覆盖情况：白名单里配置了但目录里没有定义的模型直接让启动失败，并把缺失的 ID 列出来，提示补进 `codex-models-custom.json` 或收窄白名单。目录与映射在启动时算一次，改完配置要重启网关重新生成，再重启 Codex 重新读取目录；本功能不做热更新。

`codex-models-custom.json` 里不要声明带 `(codex)` / `(copilot)` 后缀的 ID：后缀只由生成过程添加，自定义文件里的后缀 ID 既不会被当作路由，也不会出现在生成目录里。另外，白名单、DeepSeek 模型列表里写后缀 ID 会在启动阶段被直接拒绝。原始上游缓存写在独立的 `codex-models-upstream.json`，生成过程始终以缓存为输入，因此 `false → true → false` 往返不会累积后缀。

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
    "gpt-5.6-luna(codex)": "copilot-api",
    "gpt-5.6-luna(copilot)": "copilot-api"
  }
}
```

- `providers` 决定菜单里出现哪些 provider；`model_providers` 把具体模型 slug 映射到 provider；`default_provider` 处理没有显式映射的模型。
- 每个自定义 provider ID 都必须能在 `config.toml` 里找到同名 `[model_providers.<id>]`。
- 这个文件里不放任何密钥；App 会在打开 provider 菜单和新任务开始时重新读取它。
- 只要 `default_provider` 保持 `openai`，未映射的模型仍然走 ChatGPT 登录，因此可以把网关模型和官方模型并存。
- 映射的 key 必须是目录里真实存在的 slug；启用了 Codex 后缀后就是 `gpt-5.6-luna(codex)` 与 `gpt-5.6-luna(copilot)`，写成裸 ID 不会命中网关。

在同一个任务里从 `gpt-5.6-luna(codex)` 切到 `gpt-5.6-luna(copilot)` 再切回，使用的仍是这一个 provider 和这一个端点；路由由网关按模型决定。网关收到的 `model` 带后缀，发给上游前会被去掉，上游只看到 `gpt-5.6-luna`。

## 8. 未实测与未实现

| 项目 | 现状 |
|---|---|
| 真实账号登录、真实模型调用 | 登录与单来源调用已在 [CODEX_PASSTHROUGH_LOGIN_IMPLEMENTATION_REPORT_CN.md](CODEX_PASSTHROUGH_LOGIN_IMPLEMENTATION_REPORT_CN.md) 记录。**来源后缀的真实双来源验收（`(codex)` 与 `(copilot)` 各一次最小请求，并各做一次工具续轮）已执行，证据见 [CODEX_COPILOT_MODEL_SUFFIX_IMPLEMENTATION_REPORT_CN.md](CODEX_COPILOT_MODEL_SUFFIX_IMPLEMENTATION_REPORT_CN.md) 第 6 节** |
| 桌面 App provider 菜单与 `model_providers` 映射 | 依据参考仓库文档编写，未在本机实测 |
| Codex CLI 按任务选择该 provider 的具体参数 | 未在本机实测；请以 `codex --help` 与官方文档为准 |
| `/responses/compact` | **未实现**。真实客户端两轮请求（含工具回传）未触发 compact，因此按需判定为跳过；一旦客户端真的发起该请求会失败，届时需要按同一鉴权与转发方式补上 |
| WebSocket 传输 | **未实现，且本看板已明确不做**。当前只有 HTTP Responses/SSE 一条路径 |
| 传输协议限定 | `providers.codex.transport` 只接受 `http`；写成其他值（包括 `websocket`/`ws`）会在配置校验阶段被拒绝 |
| 模型权限 | 官方目录只提供模型定义，不保证 Copilot 或当前 ChatGPT 账号真的拥有该模型。某侧拿不到权限时不会为那一侧伪造条目，请求失败按上游状态码原样返回 |
| 跨上游历史迁移 | 不支持。切换上游时应发送自包含历史或新建任务 |
| 上游 401 后自动重试 | 不做。推理请求只发一次，上游状态码原样返回 |

## 9. 故障诊断

| 现象 | 含义 | 处理 |
|---|---|---|
| 启动失败：`Missing Codex gateway API key` | 启用了 Codex 但没有 `COPILOT_API_GATEWAY_API_KEY` | 设置该环境变量后重启 |
| 启动失败：`Codex base URL must stay on https://chatgpt.com` | `baseUrl` 指向了非官方 origin | 改回 `https://chatgpt.com/backend-api/codex` |
| 启动失败：`Codex model must not carry a source suffix` 或 schema 报 `models` 非法 | `providers.codex.models` 里有后缀 ID、重复 ID 或显式空数组 | 只写基础 ID（如 `gpt-5.6-luna`），或整个删掉 `models` |
| 启动失败：`Codex models have no catalog definition: ...` | 白名单里的模型在官方目录和 `codex-models-custom.json` 里都没有定义 | 补条目或收窄白名单 |
| 启动失败：`No official Codex model catalog is available` | 省略白名单但既没有网络也没有 `codex-models-upstream.json` 缓存 | 联网启动一次，或恢复原始缓存文件 |
| 启动失败：`Model is published by more than one provider` | 同一个公开 ID 被两个来源占用 | 检查 `codex-models-custom.json` 是否手写了后缀 ID |
| `400 model_provider_disabled` | 请求了 `(codex)` 模型但 Codex 转发没启用 | 打开 `providers.codex.enabled` 并重启，或改选无后缀模型 |
| `400 model_suffix_disabled` | 请求了 `(copilot)` 模型但 Codex 未启用，该后缀在当前配置下不发布 | 改选无后缀的裸模型 |
| `400 model_not_available` | 后缀合法，但该基础模型不在已发布集合里 | 检查 `models` 白名单、Copilot 是否提供该模型，或补 `codex-models-custom.json` |
| `400 invalid_model` | `model` 缺失、不是字符串、后缀重复（如 `x(codex)(codex)`）或大小写不符 | 用 `/models` 里真实存在的 slug |
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
