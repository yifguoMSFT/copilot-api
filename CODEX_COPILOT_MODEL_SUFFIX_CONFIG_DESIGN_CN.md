# Codex 转发开关与模型来源后缀设计

日期：2026-09-12。状态：待实现；本文只定义配置与实现、测试方案。

## 1. 目标与行为

在本地 `config.json` 控制 Codex 转发。客户端仍连接同一个 copilot-api endpoint，通过选择模型区分 Copilot 与 Codex 上游。

以官方基础模型 `gpt-5.6-luna` 为例：

| Codex 开关 | Copilot 开关 | 模型目录中的请求 ID | 转发目标及上游 model |
|---|---|---|---|
| 关闭 | 开启 | `gpt-5.6-luna` | Copilot，`gpt-5.6-luna` |
| 开启 | 开启 | `gpt-5.6-luna(copilot)`、`gpt-5.6-luna(codex)` | 分别转 Copilot、Codex，均发送 `gpt-5.6-luna` |
| 开启 | 关闭 | `gpt-5.6-luna(codex)` | Codex，`gpt-5.6-luna` |
| 关闭 | 关闭 | 无上述模型 | 不提供这两个来源；若 DeepSeek 也关闭，沿用启动配置错误 |

表格假定模型在对应来源的发布集合中。官方目录提供模型定义，并不保证 Copilot 或当前 ChatGPT 账号实际拥有全部模型权限。

本次继续复用已有 HTTP Responses/SSE 与鉴权实现；不增加 WS relay、协议转换或自动跨上游重试。实施范围为 Responses 模型选择，其他 API 不据此扩展 Codex 支持。

## 2. 现有实现与差距

依据当前项目源码：

- [runtime-config.ts](src/lib/runtime-config.ts) 已支持 `providers.codex.enabled`，默认关闭；支持本地配置、环境配置及环境变量覆盖。启用时目前要求非空 `codex.models` 和网关密钥。
- [codex-models.ts](src/lib/codex-models.ts) 从 OpenAI Codex 仓库的 `codex-rs/models-manager/models.json` 下载官方定义，与自定义条目合并生成本地 `codex-models.json`。官方源文件与本地生成文件应明确区分。
- [model-routing.ts](src/lib/model-routing.ts) 目前优先按 `codex.models` 的裸模型名路由，并拒绝 Codex 与 Copilot 同名模型。这无法同时发布两个来源的同一模型。
- [模型接口](src/routes/models/route.ts) 分别组装 Copilot、Codex 条目；目前没有统一的来源后缀。
- [Responses handler](src/routes/responses/handler.ts) 已允许根据路由结果替换顶层 `model`，并调用两个现有转发服务。可复用这个入口。
- [start.ts](src/start.ts) 当前在获取 Copilot 目录前生成本地目录。新设计需要先准备可用模型集合，再生成最终目录。

## 3. 本地配置

复用已有字段，不新增第二个 Codex 开关或独立的“显示后缀”开关：

```json
{
  "version": 1,
  "defaults": {
    "providers": {
      "copilot": { "enabled": true },
      "codex": {
        "enabled": true,
        "authProfile": "default",
        "transport": "http"
      }
    }
  }
}
```

上述为本设计实施后的最小双来源配置。将 `codex.enabled` 改为 `false` 即恢复无后缀的 Copilot 目录。凭据仍由已有 `codex-auth` 管理，网关密钥仍通过 `COPILOT_API_GATEWAY_API_KEY` 提供。

配置语义：

| 字段 | 设计规则 |
|---|---|
| `providers.codex.enabled` | 默认 `false`；同时决定 Codex 路由启用和两种来源的后缀模式 |
| `providers.copilot.enabled` | 保留既有含义；禁用时不发布、也不接受 Copilot 路由 |
| `providers.codex.models` | 保留为可选的基础模型 ID 白名单；省略时采用官方基础目录中的模型；显式配置时只发布白名单内模型 |
| `providers.codex.authProfile` | 沿用已有默认值与登录档案逻辑 |
| 环境覆盖 | 保持：内置默认值 < 文件 defaults < 所选 environment < 环境变量；`COPILOT_API_CODEX_ENABLED` 仍可覆盖文件 |

`models` 中只能写基础 ID，例如 `["gpt-5.6-luna"]`，不能写后缀 ID。显式空数组、重复 ID、带保留后缀的 ID 为配置错误。省略白名单的含义需在类型与默认配置中明确表达，不能混用空数组与“所有模型”。

允许省略白名单，是为了让首次配置只需启用开关，无需复制维护官方模型清单。已有显式白名单继续生效。本文示例省略 `models` 的行为是待实现变化，当前版本尚不支持直接使用该示例启动。

本期采用启动时加载配置，不实现热更新。切换开关后重启网关；客户端需重新加载目录。无需由本功能写入 `~/.codex/config.toml`；前提是客户端已有网关 endpoint 与本地模型目录接入。

## 4. 模型 ID 与显示名

同时修改 `slug` 和 `display_name`。只改显示名无法区分发送到网关的请求。

| 字段 | 官方基础条目 | Codex 开启时的 Copilot 副本 | Codex 副本 |
|---|---|---|---|
| `slug` / `/models` 的 `id` | `gpt-5.6-luna` | `gpt-5.6-luna(copilot)` | `gpt-5.6-luna(codex)` |
| `display_name` | 官方原始显示名 `D` | `D(copilot)` | `D(codex)` |
| 内部 `upstreamModel` | `gpt-5.6-luna` | `gpt-5.6-luna` | `gpt-5.6-luna` |

统一使用小写 ASCII 后缀 `(copilot)` 和 `(codex)`，紧贴基础名称、不加空格。大小写或括号不匹配的变体不作为有效路由别名。显示名缺失时使用基础 `slug`。

两份条目复制同一基础定义的工具模式、上下文窗口、推理档位、说明等元数据，不为两种来源重新手写模型定义。已有传输配置仍应保证走 HTTP；复制官方元数据不能作为新启用 WebSocket 的依据。

模型定义中指向其他模型 ID 的结构化字段，应按该副本的来源映射到已发布 ID；例如升级目标只能指向同来源的有效目标。不存在对应目标时按目录 schema 省略或置空可选引用，不留下悬空 ID。实现时核对实际字段，不对描述、提示词或其他字符串执行全局替换。

## 5. 目录生成与模型集合

使用原始源生成最终文件，不能把已有 `codex-models.json` 当作下一次后缀加工的输入，否则会重复追加后缀。

生成流程：

1. 加载运行时配置。
2. 获取官方基础目录，网络失败时读取独立的原始缓存 `codex-models-upstream.json`。
3. 合并基础模型的自定义覆盖。保留现有自定义模型与 DeepSeek 扩展语义；DeepSeek 条目不复制成 Codex/Copilot 两份。
4. 初始化已启用的上游，获取 Copilot 模型集合。Copilot 关闭时不执行 GitHub 登录或 Copilot token 交换。
5. 构建发布映射与目录条目，按开关生成后缀。
6. 校验公开 ID 唯一、模型引用有效；原子写入 `codex-models.json`，再提供服务。

集合规则：

- **Codex**：启用后，省略白名单则使用官方基础模型；指定白名单则使用其中有完整基础定义的模型。自定义非官方模型只有显式加入 Codex 白名单时才归属 Codex。没有定义的配置模型报清晰配置错误，不临时合成残缺条目。
- **Copilot**：官方基础模型与 Copilot 当前模型集合取交集，使用现有别名映射解析实际 ID；仅对本次涉及的官方模型生成来源副本。官方存在但 Copilot 不提供的模型不制造虚假可用项。
- **其他模型**：Copilot 独有的非官方模型、DeepSeek 和既有扩展保留原有 ID 与来源，不因 Codex 开关盲目复制。自定义文件不得直接声明保留后缀 ID，以免覆盖生成的路由。
- **同名模型**：允许 Codex 和 Copilot 的基础 ID 相同；不同的公开 ID 消除冲突。仍拒绝同一公开 ID 被多次占用。

关闭 Codex 时，每个由 Copilot 提供的官方基础模型仅有一份无后缀条目；开启时每个已启用且提供该模型的来源各一份。只在一侧存在的模型仅发布该侧一份。

`codex-models.json` 与 `/models`、`/v1/models` 使用同一份已解析映射，使共同模型的 `slug`、`id` 和显示名一致。HTTP 模型列表可以继续包含 Copilot 的其他模型，两种目录不要求整体集合相同。

原始目录及缓存均不可用时，若本次功能所需的基础定义无法生成，应启动失败并给出修复信息。不能继续使用带旧开关后缀的最终目录并宣称切换成功。切换 `false → true → false` 必须可逆且不会累积后缀。

## 6. 请求路由规则

以启动时生成的公开 ID 映射为依据；后缀不允许直接指定任意 URL 或未经配置的上游。

```ts
interface PublishedModelRoute {
  publicModel: string
  provider: "copilot" | "codex" | "deepseek"
  upstreamModel: string
}
```

| 请求 model | Codex 开关 | 行为 |
|---|---|---|
| `gpt-5.6-luna(codex)` | 开启 | 检查已发布且允许的 Codex 路由，移除后缀，使用 Codex 鉴权与 API |
| `gpt-5.6-luna(copilot)` | 开启 | 检查 Copilot 启用且模型可用，移除后缀，使用 Copilot 鉴权与 API |
| `gpt-5.6-luna` | 关闭 | Copilot 启用时按原有 Copilot 路径处理 |
| `gpt-5.6-luna` | 开启 | 为旧 Copilot 会话保留裸 ID → Copilot 的兼容路由，但不额外发布裸 ID；Copilot 关闭则报错 |
| 任意 `(codex)` ID | 关闭 | 返回 `400 model_provider_disabled`，不调用上游 |
| 任意 `(copilot)` ID | 关闭 | 返回 `400 model_suffix_disabled`，提示改选无后缀模型 |
| 合法后缀但基础模型不存在或不在允许集合 | 任意 | 返回 `400 model_not_available`，不回退其他来源 |
| 重复后缀、空基础名或错误后缀形式 | 任意 | 返回 `400 invalid_model`，不落入默认 Copilot 分支 |

兼容性决策：裸官方 ID 始终代表原有 Copilot 路径，不能在打开 Codex 后因为 `codex.models` 命中而悄悄改走 ChatGPT。此前显式配置裸 ID 走 Codex 的用户需要改选 `(codex)` 模型；发布说明必须指出这一变化。

`codex-auto-review` 等既有 Copilot 别名保持显式绑定 Copilot，不因目标模型也在 Codex 目录中而改道。其他已存在的非官方 ID 继续使用原路由，保留各 provider 的禁用检查。缺失或非法 `model` 的 Responses 请求返回 400，不绕过来源判定默认发送 Copilot。

转发处理顺序：解析并验证 `model` → 查找路由并检查启用状态 → 使用已有鉴权 → 按需改写顶层 `model` → 调用已有服务。

- `(codex)` 调用 `createCodexResponses`，沿用网关密钥校验、ChatGPT 凭据注入及账号头。
- `(copilot)` 调用 `createResponses`，沿用 Copilot token 与现有请求处理。
- 后缀只属于客户端模型选择，上游收到基础 ID；Copilot 别名继续解析为其真实模型 ID。
- 不改工具参数、历史文本、reasoning 项或其他字段中的模型名称。保留现有 Copilot reasoning 处理与 SSE 处理策略。
- 改写 `model` 时 JSON 可能被重新序列化，承诺其他字段语义保留，不承诺整个请求体字节一致。
- 响应中的 `model` 保留上游原值，不为补后缀解析重写 SSE。客户端是否接受该差异应在端到端测试中验证。
- 登录缺失、上游 401/403、限额或模型拒绝均沿用现有错误处理，不改走另一个来源。

日志同时记录公开模型名、provider、基础模型名，便于判断实际路由；不打印 token。

## 7. 实施拆分

| 位置 | 主要改动 |
|---|---|
| `src/lib/runtime-config.ts` | 复用启用字段；支持白名单省略；校验基础 ID；移除跨 Codex/Copilot 裸名相同即报错的限制 |
| `src/lib/model-routing.ts` | 统一后缀生成、公开 ID 映射及校验；保留裸 ID → Copilot 兼容；明确错误类型 |
| `src/lib/codex-models.ts` | 分离基础源与最终目录；按映射克隆条目，生成 slug/display_name；幂等与缓存处理 |
| `src/start.ts`、`src/lib/state.ts` | 调整初始化顺序，持有一致的模型映射；报告有效开关与发布数量 |
| `src/routes/models/route.ts` | 使用同一映射发布 ID 和显示名；禁用来源即使残留缓存也不发布 |
| `src/routes/responses/handler.ts` | 将路由结果用于请求 model 改写、服务选择与日志；补缺失 model 的校验 |
| `config.example.json`、使用说明 | 演示开关、可选白名单、目录重载与旧裸 Codex ID 的迁移 |

不新增通用代理框架，鉴权刷新与底层 HTTP/SSE 服务保持复用。

## 8. 测试与验收

优先使用固定目录 fixture 和 mock 上游测试，不依赖官方目录实时变化。

| 用例 | 预期 |
|---|---|
| Codex 关闭，同名模型在旧 Codex 白名单内 | 目录只发布一份裸 Copilot ID；裸请求不被旧白名单拦截 |
| Codex 开启，两侧都有 luna | 两个后缀 ID/显示名；无第三份裸 ID；两条请求分别命中目标 API |
| Codex 开启，Copilot 关闭 | 只发布 `(codex)`；不初始化 Copilot；裸官方 ID 请求失败 |
| 白名单省略/指定/空数组 | 分别采用官方集合、指定子集、配置报错 |
| Copilot 不提供某个官方模型 | 不发布该模型的 Copilot 副本；不把目录元数据等同于账号权限 |
| 请求发送检查 | 两个上游收到基础 model；鉴权来自各自凭据；Codex 失败不回退 |
| 请求内容检查 | 工具参数和嵌套字段中的同名字符串不被改写；Codex 的其他字段语义保留 |
| 错误与兼容 | 禁用后缀、未知模型、重复后缀、大小写错误、缺失 model 均按规则处理；旧裸 Copilot 和 auto-review 别名保持原来源 |
| 目录重复生成及开关往返 | 无双重后缀；原始缓存不变；最终目录可正确去除后缀 |
| 离线/坏缓存 | 使用有效原始缓存；无有效基础源时不能发布与配置不符的旧目录 |
| 自定义覆盖、结构化模型引用 | 覆盖先于复制；同来源引用可解析；重复公开 ID 报错 |
| DeepSeek 与其他模型 | 不被复制或改名，原有路由行为不回归 |
| `/models` 与本地目录 | 共同条目的 ID、显示名一致；禁用来源不会从残留 state.models 泄漏 |

代码完成后执行定向模型目录/路由/Responses 测试，再执行 `bun test`、`bun run typecheck`、`bun run lint`、`bun run build`。

真实验收仍只使用 `gpt-5.6-luna`：两侧均有权限时分别请求 `(copilot)` 和 `(codex)`，验证上游日志与工具往返；检查客户端可读取后缀 slug、显示来源、接受响应中的基础 model。仅凭两个上游各自请求成功，不宣称跨上游历史或 reasoning 状态通用。

关闭 Codex 后重新生成目录，验证恢复一份裸 luna；开启后在同一客户端 provider 下切换两个模型条目，验证按每次请求选择来源。若某侧没有 luna 权限，记录该侧实测未完成，不能换其他真实模型绕过既定测试范围。

验收完成标准：开关、目录、模型 ID 和路由四者一致；两个上游从不收到本地后缀；关闭 Codex 后不出现 Codex 副本或 Codex 转发。
