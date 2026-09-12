# Gemini Interactions v1 → Codex CLI 转换器联调报告

日期：2026-09-12。工作目录：I:/Cache/workshop/copilot-api。方案：[[GEMINI_INTERACTIONS_V1_CODEX_CLI_TEST_PLAN_CN.md]]。

范围：验证 Responses ↔ Interactions 纯协议转换器能否经由本地桥接脚本驱动真实 Codex CLI。本报告只证明 Google 模型 endpoint 的转换正确性，**不构成 Antigravity endpoint 或登录方式兼容性验收**。未实现 WebSocket，未涉及图片/多媒体，未改动 copilot-api 现有路由、启动、模型目录与鉴权。

## 环境

| 项 | 值 |
|---|---|
| 验证基线提交 | `90734c9`（本轮改动在联调完成后另行提交） |
| Codex CLI | 0.153.4，`C:\Users\Jeff\AppData\Local\OpenAI\Codex\bin\7ac07f4ce733f89a\codex.exe` |
| Bun | 1.4.2 |
| 上游 endpoint | `https://generativelanguage.googleapis.com/v1/interactions`（固定，不接受客户端指定） |
| 上游模型 | `gemini-3.8-flash`，`store=false` |
| 本地桥接 | [[scripts/interactions-codex-live.ts]]，`127.0.0.1`，live 端口 4831，独立本地 token |
| 测试 CODEX_HOME | `%TEMP%\codex-gemini-min`（复制用户配置，仅 provider 端口指向桥接；未改动用户 `~/.codex` 默认值） |
| 密钥 | 仅桥接进程从 `scripts/interactions-codex-live.local` 读取，注入 `x-goog-api-key`；未写入 Markdown、config.toml、命令行或日志 |

## 用例结果

| 用例 | 手段 | 结果 |
|---|---|---|
| 直接调用 v1（JSON / SSE） | 独立脚本 + 转换函数 | HTTP 200；JSON 可解析，SSE 到达终态 |
| CLI 文本冒烟 | `codex exec --strict-config -c model_provider="gemini_interactions_test" -c web_search="disabled"` | 退出码 0，文本来自 Google，无 WebSocket Upgrade，未落到其他 provider |
| 真实工具闭环 | 合成目录 `fixture.txt` 随机标记 | CLI 实际执行 `pwsh.exe -Command 'cat fixture.txt'` 退出 0，输出 `SYNTHETIC_FIXTURE_MARKER=QX4-DELTA-9Z2`，最终回答 `QX4-DELTA-9Z2` |
| 完整历史续轮 | `codex exec resume` 显式 session ID | 通过；无 `previous_response_id`，历史无重复追加 |
| 桥接重启后续轮 | 停桥接 → 重启 → 同 token 续轮 | 通过，上下文仍连续 |
| thought 重放 | 真实 thought/signature 经 `agdata1` / `encrypted_content` 往返 | 覆盖（见下） |
| 缓存映射 | 固定合成 4137-token 前缀 ×3 | 上游与下游缓存计数相等（均为 0，按零缓存报告） |
| 失败边界 | 本地响应替身 | 401/403/429/500/503、坏 JSON、坏帧、断流、超时均按预期失败，无虚假 completed |
| 取消与隔离 | 本地响应替身 | 客户端断连触发上游 abort，下游 cancel 释放 reader，后续请求正常；并发请求不串扰 |

session ID：`01a094ca-69e8-7dd3-81e6-81577ce39a9f`（非 `--ephemeral`，未用 `--last`）。

真实工具执行次数：**1**（首轮 `command_execution`，退出码 0）。后续各轮只要求复述标记，未再执行工具。

错误诊断来源：真实上游未出现 4xx/5xx；401/403/429/500/503 与坏帧、断流、超时使用本地响应替身覆盖，断言保留原 HTTP 状态与上游 `error.code`（如 429 → `quota_exceeded`），未消耗真实配额。坏 JSON、无法连接上游与首字节超时映射为 502（`upstream_invalid_json`、`upstream_unreachable`），错误体不伪造成功载荷。

## usage 来源与数值

CLI 侧数值取自 `codex exec --json` 的 `turn.completed.usage`，因此是**下游**转换结果；上游数值取自桥接 `upstream_json` 记录。两者不可相加，也不跨轮累加。

| 轮次 | HTTP | usage（CLI 侧） | 回答 |
|---|---|---:|---|
| 首轮文本 | 200 | input 19755 / output 45 / cached 0 | `QX4-DELTA-9Z2` |
| 续轮 1 | 200 | input 29710 / output 53 / cached 0 | `QX4-DELTA-9Z2` |
| 续轮 2（重启桥接后） | 200 | input 39687 / output 63 / cached 0 | `TOKEN=QX4-DELTA-9Z2` |
| 续轮 3 | 200 | input 49687 / output 74 / cached 0 | `AGAIN=QX4-DELTA-9Z2` |

缓存探针（固定合成前缀，同一模型/指令/历史顺序，共 3 次，未触发配额失败）：

| 轮次 | 上游 `total_cached_tokens` | 下游 `input_tokens_details.cached_tokens` | 上游 input/output/thought | 下游 output / reasoning | 上游 status |
|---|---:|---:|---|---|---|
| 1 | 0 | 0 | 4137 / 1 / 47 | 48 / 47 | completed |
| 2 | 0 | 0 | 4137 / 1 / 40 | 41 / 40 | completed |
| 3 | 0 | 0 | 4137 / 1 / 59 | 60 / 59 | incomplete |

结论：缓存计数**逐轮相等**，累计统计不相加（`output_tokens = total_output_tokens + total_thought_tokens`，reasoning 单独报告）；三次均未命中隐式缓存，按“零缓存”如实报告，不宣称 cache hit。第 3 轮上游 `incomplete` 原样透传。

## thought 重放

桥接记录显示真实上游 step 顺序为 `[thought, model_output]`，Codex 下一轮回传 4 个 `reasoning` 项。签名字节比较在内存中完成，仅记录长度与 sha256，未落明文。为让 Google 接受，转换器在模型轮内把 thought 排到其它 step 之前（上游报错 `Model turns with thought summaries must start with a thought block in thinking models`）。本轮产生了 thought，因此该项记为覆盖。

## 本轮转换器修正（均来自真实流量，未扩大范围）

1. 流式工具参数：`step.start` 的 `arguments` 是占位对象，真实参数以单个 `arguments_delta` 文本到达；旧实现把占位对象序列化后拼接，产生 `{}{"cmd":…}` 而报 `Tool arguments must be a JSON object`。
2. `reasoning` 历史项携带 `content: null` 时被旧校验拒绝。
3. 模型轮内 thought 顺序（同上）。
4. 记录器脱敏会把 `total_cached_tokens` 这类数值计数一并抹掉，导致记录无法作为 usage 证据；现只脱敏非数值凭据值。
5. 桥接的 session 头同时接受 `session-id`（CLI 实际使用）与 `session_id`；该值按设计只作为 metadata 观测，不写入上游 body。

## 通过标准核对

| 要求 | 状态 |
|---|---|
| 文本正常结束 | 通过 |
| 真实工具闭环（function，含 call_id/参数/结果一致） | 通过 |
| 完整历史续轮 | 通过 |
| 桥接重启后续轮 | 通过 |
| 真实 thought 重放 | 通过 |
| 缓存命中 | 未观测到，如实记为未验证（不是失败） |

回归：`bun test` 29 个文件 326 pass / 1 skip / 0 fail（其中 interactions 5 个文件 92 pass / 303 assertions），`bun run typecheck` 与 `bun run build` 通过，改动文件定向 ESLint 通过。

## 未覆盖与限制

- **custom 工具**：CLI 本轮只声明 function / namespace 工具，custom 工具的 live 路径未覆盖，普通 function 成功不能替代 custom 验收。
- **`previous_response_id` 增量模式**：只验证了 `store=false` 的完整历史模式。
- **缓存命中**：3 次均 0，未取得非零命中；非零映射由离线用例覆盖。
- **CLI 模型元数据**：CLI 报 `Model metadata for gemini-3.8-flash not found. Defaulting to fallback metadata`，属 CLI 侧提示，不影响本轮结论。
- **本地约定而非规范**：namespace 工具组展开为 `namespace__name`、`client_metadata` 不上送、`parallel_tool_calls=false` 显式拒绝。
- 本测试使用 Google 模型 endpoint，与 Antigravity 登录/endpoint 无关。

## 清理

- 桥接进程已停止（4831 无监听）；未触碰用户 4141 上的 copilot-api 进程。
- 用户 `~/.codex/config.toml` 中本次新增的 `[model_providers.gemini_interactions_test]` 表已移除，其余行、LF 结尾与无 BOM 属性保持不变；改写前备份为 `config.toml.before-gemini-test-cleanup-20260912T085644.bak`。
- 临时 token 仅存在于测试进程环境，未写入文件；Gemini key 文件 `scripts/interactions-codex-live.local` 由 `.gitignore` 的 `*.local` 覆盖，未入库。
- 原始 CLI JSONL、桥接记录与临时 CODEX_HOME 留在版本控制外（`%TEMP%`），仅精简脱敏 fixture 入库。
- 中间状态笔记 `GEMINI_CODEX_SMOKE_STATUS_CN.md` 的内容已并入本报告，原文件删除。
