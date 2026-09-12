# Responses ↔ Interactions 转换器审核与改进建议

日期：2026-09-12。审核提交：55ec450；实施基线：59319de。
目录：I:/Cache/workshop/worktree/copilot-api-antigravity-interactions。
对照：ANTIGRAVITY_RESPONSES_INTERACTIONS_IMPLEMENTATION_TEST_DESIGN_CN.md，以及 Google Interactions v1 官方参考。

## 结论

独立转换器的结构与无状态边界符合设计，文本、function/custom 文本包装和 SSE 基础流程已有实现。它仍是有限协议子集，不能因离线测试通过就认定能够接入真实 Codex。建议先修复累计 usage 和错误详情这两处已确认缺陷，再通过独立测试桥接器采集实际 Codex 请求，按证据补齐必要兼容性。

本次审核没有修改实现、原设计或看板。重新运行三个新增测试文件：44 pass、0 fail、105 assertions。另以 Bun stdin 执行三个最小复现，未写入测试文件。上一轮报告的 typecheck/build/全量测试结果未在本轮重跑。

## 与设计对照

| 设计要求 | 实现情况 | 判断 |
|---|---|---|
| 独立纯函数、网络由调用方负责 | convert.ts 无网络与凭据依赖，stream.ts 每响应一个实例 | 符合 |
| 不修改既有模块 | git diff --name-status 59319de HEAD 全部为新增交付文件 | 符合 |
| 文本、指令、工具转换 | 基础映射已实现；历史中间的指令明确拒绝 | 符合有限范围 |
| 实际 Codex custom 格式、有限 strict 支持 | 仅支持 custom text；strict:true 和 grammar 全部拒绝 | 尚未证明达到实际客户端要求 |
| SSE 分片、错误、取消 | 有离线覆盖，工具参数缓冲隔离 | 基本符合 |
| 累计 usage 取最后快照 | 仅保留 interaction 对象上的 usage | 不完整 |
| 已知失败信息映射 | JSON 读取单数 error，v1 resource 定义复数 errors | 不符合 v1 |
| 无状态 thought 重放 | agdata1 包装离线可逆 | 真实 CLI 与 Google 接受性待验证 |
| session/cache 标识 | metadata 原样返回，不注入 body | 符合；不代表上游缓存命中 |
| previous_response_id 增量续接 | 父 ID 直接映射，但孤立工具结果要求额外 name | 功能存在缺口 |

## 按优先级改进

### P1：累计 usage 丢失（已复现）

位置：src/services/interactions/stream.ts:161、245。

v1 定义 step.delta.metadata.total_usage 和 step.stop.usage（累计统计），另有 step.stop.step_usage（单 step 统计）。当前代码都未读取；如果 interaction.completed 不含 usage，最终 response.usage 为 null。

复现：created → text start → text delta（metadata.total_usage 含 input=7、output=2、thought=0、cached=4、total=9）→ stop → completed（无 usage）；结果 usage=null。

最小修正：每请求保存最近一次明确提供的累计统计，终态有 usage 时覆盖；不要把累计快照相加，也不要把 step_usage 当累计值。新增 delta-only、stop-only、终态覆盖三类 fixture，验证零、缺失与缓存计数。

### P1：v1 JSON 失败详情丢失（已复现）

位置：src/services/interactions/convert.ts:472。

输入 status=failed、errors=[{code:"quota",message:"quota exhausted"}]，输出变为通用 upstream_error / Interaction failed。官方 Interaction.errors 与 SSE ErrorEvent.error 是不同结构。

最小修正：分别解析 resource errors 与 SSE error。Responses 单个 error 可取首个诊断并保留有效 message，其他诊断保留在脱敏测试记录；错误码按下游接受的有限规则映射。增加真实形状、空数组、缺省诊断测试，避免用自造单数 error fixture 掩盖问题。

### P1：Codex 请求契约需要实际样本（条件性接入阻塞）

位置：src/services/interactions/convert.ts:22、124，toolDefinition、historyItem。

当前 strict schema 拒绝 parallel_tool_calls、text.verbosity、reasoning.effort=xhigh，拒绝 strict:true 工具与 custom grammar；message 也没有 phase 字段。具体 CLI 是否发送这些字段尚未采集，不能一概认定都会发生。

最小改进：先用真实 CLI 请求形成脱敏 fixture，逐字段分成可映射、明确无语义影响、必须拒绝三类。不要全局 passthrough 或直接删除 unknown 字段。尤其不能把 strict:true 或 grammar 静默降级后宣称等价。只针对实际启用的 Codex 工具实现必要约束；复杂 grammar 支持不应提前扩展为通用解释器。

若目标只是先验证文本，可通过 CLI 可用配置关闭无关工具，但必须另外完成工具验收；提示词“不要调用工具”不会使请求中的工具声明消失。

### P2：父引用工具续接被不必要的 name 要求阻断（已复现）

位置：src/services/interactions/convert.ts:232。

previous_response_id + function_call_output(call_id, output) 没有本轮调用历史时抛错。v1 FunctionResultStep.name 是可选字段，call_id 才是必填关联字段。

建议：有本轮历史时核对并填写 name；明确使用 previous_interaction_id 时允许省略 name，把关联校验交给上游。全量历史模式仍可保留本地一致性检查。不引入 session→tool 映射表或数据库。补父引用孤立结果与完整历史两组测试。首轮 CLI 联调优先采用完整历史模式。

### P2：不同响应重复使用 step_0 等 item ID（兼容性风险）

位置：src/services/interactions/convert.ts:334，stream.ts coordinates、finishPartial。

同一流内 ID 稳定，但不同轮次会重用。尚未复现 Codex 因此失败；多轮 item 合并或历史索引可能碰撞。建议只在证据要求时改为由 interaction.id 和 step index 确定的稳定 ID，JSON/SSE/失败分支使用同一个小函数。无需持久化映射。

### P2：非成功终态与 JSON/SSE 一致性覆盖不足

位置：convertInteractionsResponseToResponses、stream.ts finishStep/complete。

JSON message 总标记 completed；SSE 在未完成 item 遇到 incomplete 终态时可标记 incomplete，两个路径可能不同。incomplete_details.reason 当前固定 unknown 或 cancelled，不能视为已符合完整 Responses schema。

建议补同一不完整响应的 JSON/SSE 对照，明确资源状态与 item 状态的区别；根据真实上游诊断映射合法原因，没有证据时保持未知而不伪造 max_output_tokens。分别用真实 CLI 验证 failed/incomplete 的接受性。

### P2：usage 缺失计数的策略需显式验收

usage 只有 total_output_tokens 而无 total_thought_tokens 时，代码省略 output_tokens；现有测试把 {} 作为期望。这能避免错误合计，但下游可能要求完整 usage 字段。

先用真实样本确定缺省 thought 是否表示零，再决定映射；未确定前不要编造计数。对缺省统计允许 null/省略的目标客户端行为单独验证。

## 保留并精简的部分

保留两个模块、每请求一个 SSE 累积器、客户端携带 thought 数据、原样 tool call_id 和 metadata 边界。无需加入 SQLite、缓存服务、通用 provider 框架、会话仓库、自动重试体系或 Antigravity 登录。

verifySnapshot 的整对象深比较可能把上游额外可选字段当成内容冲突。后续只在真实 fixture 显示该问题时，改为比较支持范围内的语义内容；不要提前维护多个 endpoint 分支。

现有测试覆盖的是自建输入和有限官方样本。最有价值的新增测试是实际 CLI 请求、实际上游 SSE、错误/统计与多轮重放；不是继续堆叠与实现同构的 mock。

## 建议实施顺序与完成标准

1. 累计 usage、errors 数组最小修复及回归。
2. 独立 loopback HTTP 桥接脚本采集实际 Codex 请求，处理观察到的必要字段。
3. Gemini 3.8 Flash 的文本、工具、多轮、桥接重启与 thought 重放验收。
4. 必要时修正 item ID 和非成功终态；缓存统计独立报告。

核心成功标准：真实 Codex 完成工具往返与重启后的上下文续接，签名可逆且上游接受，JSON/SSE 输出一致，失败不会标记成功。缓存命中另行观测，不能作为协议连续性的替代证据。

## 资料与边界

- [Interactions v1](https://ai.google.dev/api/interactions-api-v1)
- [官方 v1 Markdown](https://ai.google.dev/static/api/interactions-v1.md.txt)
- [Codex 配置参考](https://learn.chatgpt.com/docs/config-file/config-reference)

2026-09-12 在线核对：v1 Markdown REST 示例明确使用 /v1/interactions，但方法标题仍写 /v1beta/interactions；页面 banner 宣布 gemini-3.8-flash，ModelOption 枚举尚未包含它。应以指定 v1 endpoint 的实际请求结果确认权限和模型支持，不自动降级版本或换模型。没有调用真实 Gemini API，也没有参考 CLIProxyAPI。
