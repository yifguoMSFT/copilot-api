# Codex 转发开关与模型来源后缀：实施报告

日期：2026-09-12。依据 [CODEX_COPILOT_MODEL_SUFFIX_CONFIG_DESIGN_CN.md](CODEX_COPILOT_MODEL_SUFFIX_CONFIG_DESIGN_CN.md) 实施，本报告记录已落地的改动、验证证据与仍需真实账号确认的项目。

## 1. 目标行为

客户端始终连接同一个本地 provider 与同一个 endpoint，通过模型菜单选择上游：

| `providers.codex.enabled` | 官方模型 `gpt-5.6-luna` 的发布 ID | 上游收到的 `model` |
|---|---|---|
| `false` | `gpt-5.6-luna` | Copilot 收到 `gpt-5.6-luna` |
| `true` | `gpt-5.6-luna(copilot)`、`gpt-5.6-luna(codex)` | 两者分别收到 `gpt-5.6-luna` |

裸官方 ID 保持原有含义（Copilot 路径），只是不再由网关发布；后缀只用于选择来源，不会发给任何上游。

## 2. 配置变更

- 复用 `providers.codex.enabled` 作为唯一的转发开关，不新增第二个开关；它同时决定是否发布来源后缀。
- `providers.codex.models` 变为可选白名单：省略表示使用官方目录里的全部模型，显式白名单只发布其中已定义的模型，显式空数组仍是配置错误（schema `min(1)`）。
- 环境覆盖保持原样：内置默认值 < 文件 `defaults` < 所选 `environment` < 环境变量（`COPILOT_API_CODEX_ENABLED`、`COPILOT_API_CODEX_BASE_URL`、`COPILOT_API_CODEX_AUTH_PROFILE`，网关密钥 `COPILOT_API_GATEWAY_API_KEY`）。
- 配置在启动时读取一次并重算目录与映射，不支持热更新；切换开关后重启网关，并让客户端重新加载目录。
- `config.example.json` 改为省略 `models` 的最小骨架，Codex 默认关闭，不包含任何秘密与本机路径。

迁移要点见 [CODEX_PASSTHROUGH_LOGIN_USAGE_CN.md](CODEX_PASSTHROUGH_LOGIN_USAGE_CN.md) 的 3.1 节：改动前把裸 ID 配成 Codex 的用户，需要改选 `(codex)` 后缀模型；旧会话里的裸 ID 继续走 Copilot，不会静默换上游。把开关设回 `false` 即可恢复单份裸 ID 目录。

## 3. 实现改动

| 文件 | 改动 |
|---|---|
| `src/lib/model-sources.ts`（新增） | 后缀格式化与解析、`buildPublishedModels`、白名单覆盖检查、保留后缀冲突检查 |
| `src/lib/runtime-config.ts` | 启用 Codex 不再要求非空白名单；白名单只接受基础 ID |
| `src/lib/model-routing.ts` | `resolveModelRoute` 改为按发布映射路由；移除“裸 ID 命中 `codex.models` 即走 Codex”；错误码区分为 `invalid_model` / `model_provider_disabled` / `model_suffix_disabled` / `model_not_available` |
| `src/lib/codex-models.ts` | 拆分基础目录加载、上游目录刷新与发布目录生成；按来源克隆条目、改写同来源结构化引用、原子写入 |
| `src/lib/state.ts` | 新增 `publishedModels`，供 `/models` 与 `/responses` 共用同一份映射 |
| `src/start.ts` | 启动顺序调整为先算映射再生成目录并发布；白名单缺定义、缺少基础目录时启动失败 |
| `src/routes/models/route.ts` | 后缀条目的 `id`/`display_name`/`owned_by` 来自发布映射；被替换的裸条目不再发布，别名保留 |
| `src/routes/responses/handler.ts` | 按映射选择上游并只改写顶层 `model`；缺失或非法 `model` 返回 400；日志新增 `Model routed: <public> → <provider> (<upstream>)` |
| `src/lib/error.ts` | `HttpStatusError` 支持自定义状态码与错误码，供上述 400 分支使用 |
| `config.example.json`、`CODEX_PASSTHROUGH_LOGIN_USAGE_CN.md` | 示例与使用说明按新语义更新 |

有意不做：WebSocket relay、`/responses/compact`、协议转换、跨上游历史迁移、上游 401 后自动重试。转发仍只做鉴权注入与原样透传，`transport` 只接受 `http`。

## 4. 验证证据（本次已执行）

```text
bun test                → 211 pass / 1 skip / 0 fail（23 个文件，610 expect）
bun run typecheck       → 通过
bun run lint            → 通过
bun run build           → 通过（dist/main.js 127.68 kB）
```

关键 mock 用例：

| 用例 | 断言 |
|---|---|
| `strips the source suffix and posts the rest of the payload` | 只有顶层 `model` 被改写；`input` 与嵌套字段里的同名字符串、其他字段语义保持不变 |
| `rejects a Codex suffix while the provider is disabled` | 400 `model_provider_disabled`，且不调用上游 |
| `routes a Copilot suffix to Copilot without the Codex gateway key` | 命中 Copilot endpoint，无需网关密钥 |
| `rejects a wrong gateway key without calling the upstream` | 401，且不调用上游 |
| `streams SSE bytes through without rewriting events` | 补后缀不改变 SSE 分帧 |
| `resolves the codex-auto-review model alias`、`leaves the Copilot path unauthenticated as before` | 裸 ID 与别名回归保持原来源 |
| `rejects a request without a model before reaching an upstream` | 缺失 `model` 返回 400 `invalid_model` |
| 模型来源与目录用例（`tests/model-sources.test.ts`、`tests/codex-models.test.ts`、`tests/models-route.test.ts`） | 双份发布与无第三份裸条目、Copilot 关闭时只发 `(codex)`、白名单三种形态、幂等生成、同来源引用重写、坏缓存处理、`/models` 与生成目录的 `slug`/`display_name` 一致 |

本节全部使用固定 fixture 与 mock 上游；真实账号与客户端的验收见第 6 节，同样未修改 `~/.codex/config.toml` 与真实 `config.json`。

## 5. 与设计的偏差

| 项目 | 设计 | 实现 | 影响 |
|---|---|---|---|
| 自定义文件里的保留后缀 ID | “不得直接声明” | `buildPublishedModels` 跳过带后缀的基础 ID，不报错 | 不会覆盖生成的路由，但也不会被拒绝；白名单与 DeepSeek 列表里的后缀 ID 会启动失败 |
| 白名单缺定义的提示 | 配置错误 | 启动失败并列出缺失 ID（此前是启动后警告） | 失败更早、更明确，行为变化已写入使用说明第 9 节 |

## 6. 真实双来源验收（已执行）

环境：临时配置与端口，不修改真实 `config.json` 与 `~/.codex/config.toml`。

| 项目 | 值 |
|---|---|
| 网关 | `bun run ./src/main.ts start --config .kanban-acceptance/config.json --port 4488`，cwd 为 `.kanban-acceptance/`（临时目录），网关密钥由环境变量提供 |
| 临时配置 | `providers.codex = { enabled: true, authProfile: "acceptance" }`、`providers.copilot = { enabled: true }`、`deepseek` 关闭 |
| 客户端 | `codex exec --ignore-user-config -C .kanban-acceptance`，全部参数用 `-c` 覆盖：`model_catalog_json` 指向临时目录生成的文件，新增 provider `kanban_acceptance`（`wire_api = "responses"`、`env_key = "COPILOT_API_GATEWAY_API_KEY"`） |
| 真实模型 | 只用 `gpt-5.6-luna`；共 8 次上游推理请求（含工具结果续轮），与看板上限一致 |

开启 Codex 时的发布集合（`GET /models`）：`gpt-5.6-luna(copilot)`（`owned_by: copilot`）与 `gpt-5.6-luna(codex)`（`owned_by: codex`），没有裸 `gpt-5.6-luna`。客户端能直接选中带后缀的 slug，无需额外参数。

| 请求 | 网关日志（脱敏） | 结果 |
|---|---|---|
| `-m gpt-5.6-luna(copilot)`，提示“Reply with exactly: copilot-ok” | `Model routed: gpt-5.6-luna(copilot) → copilot (gpt-5.6-luna)` / `Response received …: 200 in 1261ms` | 客户端输出 `copilot-ok` |
| `-m gpt-5.6-luna(codex)`，提示“Reply with exactly: codex-ok” | `Model routed: gpt-5.6-luna(codex) → codex (gpt-5.6-luna)` / `200 in 1491ms` | 客户端输出 `codex-ok` |
| `-m gpt-5.6-luna(copilot)`，要求执行 `echo suffix-tool-ok` | 同一会话两条 `→ copilot` 路由，均 200 | 模型发出工具调用，收到工具结果后完成回答 |
| `-m gpt-5.6-luna(codex)`，要求执行 `echo codex-tool-ok` | 三次 `→ codex` 路由，均 200 | 同上 |

工具轮的限定：本轮工具调用是真实的（客户端把工具调用与结果作为 Responses 项再发一次上游），但父进程策略拒绝了本地 `pwsh`/`cmd` 子进程，因此回传给上游的工具结果是拒绝错误，而不是 `echo` 的 stdout；最终回答仍由模型在收到该结果后给出。也就是说，“工具调用 + 续轮”这条链路已实测通过，“本地命令成功执行”未验证。

开关往返：把临时配置改回 `providers.codex.enabled = false` 并重启同一端口后，`GET /models` 返回 42 个模型、后缀条目 0 个，`gpt-5.6-luna` 只有一份（`owned_by: OpenAI`）；生成的 `codex-models.json` 恢复为 9 条基础条目、luna 的 slug 不带后缀。往返过程中原始上游缓存未被改写，没有出现双重后缀。

客户端侧的两个观察：

- 官方目录里 `gpt-5.6-luna` 带 `prefer_websockets: true`，但客户端在本配置下走的是 HTTP Responses，没有触发 WebSocket；本功能也仍然只支持 HTTP。
- `codex_otel` 会对 `gpt-5.6-luna(copilot)` 报 “tag value contains invalid characters” 的指标告警（括号不符合其指标标签约束）。这是客户端遥测的提示，不影响请求与回答，但属于使用后缀的可感知副作用。

未验证/不宣称：跨来源的历史或 reasoning 状态通用性（本次工具轮都在单一来源内完成）；某一侧无权限时的降级行为（本次两侧都有 luna 权限）；应用（桌面 App）菜单里的后缀显示留待人工确认，本次验收使用 CLI。

## 7. 回归测试与范围审查

本轮在改动完成后重新执行了全部检查：

```text
bun test            → 211 pass / 1 skip / 0 fail（23 个文件，610 expect）
bun run typecheck   → 通过
bun run lint        → 通过
bun run build       → 通过（dist/main.js 127.68 kB）
```

唯一的 skip 是 `tests/codex-credentials.test.ts` 的 `stores the credential with owner-only permissions`，用例写成 `test.skipIf(process.platform === "win32")`，断言的是 POSIX 的 0600 文件模式，在 Windows 上无法成立，与本次功能无关。

设计第 8 节的用例逐条对应：

| 设计用例 | 覆盖位置 |
|---|---|
| Codex 关闭、模型仍在旧白名单内 | `tests/model-sources.test.ts`（不发布任何额外条目）、`tests/model-routing.test.ts`（裸 ID 仍走 Copilot） |
| Codex 开启、两侧都有该模型 | `tests/model-sources.test.ts`（两个后缀 ID 与显示名、无第三份裸 ID）、`tests/codex-passthrough.test.ts`（两条请求分别命中目标 endpoint） |
| Codex 开启、Copilot 关闭 | `tests/model-sources.test.ts`（只发布 `(codex)`）、`tests/start.test.ts`（不初始化 Copilot）、`tests/model-routing.test.ts`（裸 ID 报错） |
| 白名单省略 / 指定 / 空数组 | `tests/runtime-config.test.ts`（省略合法、显式空数组被 schema 拒绝）、`tests/model-sources.test.ts`（空数组视为全部官方、指定时收窄） |
| Copilot 不提供某个官方模型 | `tests/model-sources.test.ts`（不发布该模型的 Copilot 副本） |
| 请求发送检查 | `tests/codex-passthrough.test.ts`（两个上游都收到基础 ID、鉴权来自各自凭据、网关密钥 401 且不发上游、Codex 失败不回退） |
| 请求内容检查 | `tests/codex-passthrough.test.ts`（只改顶层 `model`，`input` 与嵌套同名字符串、其他字段语义保留） |
| 错误与兼容 | `tests/model-routing.test.ts`（禁用后缀、未发布后缀、重复/大小写错误后缀、Copilot 关闭）、`tests/responses-route.test.ts`（缺失 `model` 返回 400） |
| 目录重复生成与开关往返 | `tests/codex-models.test.ts`（从原始基础源重复生成不叠加后缀、关闭时发布裸条目） |
| 离线 / 坏缓存 | `tests/codex-models.test.ts`（首次离线、刷新失败保留缓存、坏缓存不发布陈旧 ID） |
| 自定义覆盖与结构化引用 | `tests/codex-models.test.ts`（自定义覆盖优先、来源分离、`upgrade.model` 同来源重映射） |
| DeepSeek 与其他模型 | `tests/model-sources.test.ts`、`tests/model-routing.test.ts`、`tests/models-route.test.ts`（不加后缀、按启用状态路由与发布） |
| `/models` 与本地目录一致 | `tests/models-route.test.ts`（后缀条目、裸 ID 隐藏、`/v1` 前缀一致、禁用来源不泄漏） |

范围审查：

- `git diff --name-only -- src` 只有 8 个文件：`codex-models.ts`、`error.ts`、`model-routing.ts`、`runtime-config.ts`、`state.ts`、`routes/models/route.ts`、`routes/responses/handler.ts`、`start.ts`，全部属于配置、来源映射、目录生成、启动编排与模型选择。
- `package.json`、`bun.lock`、`tsup.config.ts` 无差异，没有引入新依赖或构建插件；`src/services/**` 未被改动，因此没有新增传输层、协议转换或重试逻辑。
- 在全量源码 diff 中检索 `websocket` / `new WebSocket` / `responses/compact` / `EventSource` / `upgrade`，只命中 `upgrade.model` 这个结构化模型引用的重映射，没有传输层改动。
- 鉴权边界复核：网关密钥只用于 `(codex)` 路由（错误密钥 401 且不调用上游），ChatGPT 凭据只在本地注入并剥离客户端自带的 `authorization` / `cookie` / `x-api-key` / `chatgpt-account-id`，`(copilot)` 路由保持不鉴权；Codex 失败按 `503 codex_login_required` / `503 codex_auth_unavailable` / 上游状态码原样返回，不落到 Copilot。
- 目录与路由一致性复核：`/models` 与 `codex-models.json` 使用同一份 `publishedModels`，两个来源的同一模型只通过各自的 `(copilot)` / `(codex)` ID 暴露，裸 ID 不再发布但仍按 Copilot 兼容解析。
- 未触碰真实 `config.json`（最后修改时间早于本次会话）与 `~/.local/share/copilot-api/codex/` 下的凭据文件；测试全部在临时目录与 mock 上游上运行。旧看板的真实验收不作为本功能的证据，本功能的真实双来源验收见第 6 节。

## 8. 回滚

把 `providers.codex.enabled` 设回 `false` 并重启网关即可：`/models` 与 `codex-models.json` 恢复为单份裸 ID，网关不再发布任何后缀，不再有请求走 Codex。启用 Codex 时缺少网关密钥或凭据都不影响启动，因此想临时停用转发要改开关；凭据被撤销时 `(codex)` 请求返回 `503 codex_login_required`，不会回落到 Copilot。

## 9. 交付范围与排除项

纳入本次提交：

- 新增：`src/lib/model-sources.ts`、`tests/model-sources.test.ts`、`CODEX_COPILOT_MODEL_SUFFIX_IMPLEMENTATION_REPORT_CN.md`。
- 修改：`src/lib/codex-models.ts`、`src/lib/error.ts`、`src/lib/model-routing.ts`、`src/lib/runtime-config.ts`、`src/lib/state.ts`、`src/routes/models/route.ts`、`src/routes/responses/handler.ts`、`src/start.ts`、`config.example.json`、`CODEX_PASSTHROUGH_LOGIN_USAGE_CN.md`、`CODEX_COPILOT_MODEL_SUFFIX_CONFIG_DESIGN_CN.md`（仅状态行），以及 `tests/codex-models.test.ts`、`tests/codex-passthrough.test.ts`、`tests/model-routing.test.ts`、`tests/models-route.test.ts`、`tests/responses-route.test.ts`、`tests/runtime-config.test.ts` 中属于本功能的 hunk。

明确排除（保持工作区现状，不纳入提交）：

- 真实配置与凭据：`config.json`、`%USERPROFILE%\.local\share\copilot-api\` 下的 token 与 Codex 凭据文件。
- 生成物与本地目录：`codex-models.json`、`codex-models-custom.json`、`.kanban-acceptance/`（临时验收目录与日志）、`reference/`。
- 其它并行工作与执行产物：`ANTIGRAVITY_RESPONSES_INTERACTIONS_IMPLEMENTATION_TEST_DESIGN_CN.md`、`antigravity-responses-interactions.kanban.json`、`src/services/interactions/**` 及其在 `src/routes/responses/handler.ts` 中的 hunk、`SESSION_MODEL_TOKEN_USAGE_*.md`、各 `*.kanban.*` 看板文件、`.kanbansession*`。
