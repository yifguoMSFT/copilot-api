# Responses ↔ Interactions 双向协议转换器：实现与测试设计

## 目标与边界

本任务只交付两个方向的数据转换及离线单元测试：

1. Responses 请求对象 → Interactions 请求对象。
2. Interactions 响应对象或 SSE 字节 → Responses 响应对象或 SSE 字节。

请求和 JSON 响应转换是纯函数：输入对象与显式参数，输出新对象，不修改输入。SSE 按流创建转换实例，只保存解析当前流所需的缓冲，不在请求之间共享状态。

不实现 HTTP 服务、网络请求、endpoint/provider 选择、鉴权、登录、密钥读取、配置修改、Codex CLI 调用、请求抓取或日志系统。不实现 WebSocket、图片或多媒体生成、数据库、会话仓库、缓存服务、重试和网络超时。不接入现有路由，不修改无关业务代码或依赖。CLIProxyAPI 不作为依据。

## 交付文件

- `src/services/interactions/convert.ts`：请求和 JSON 响应转换，必要的工具及 thought 数据包装。
- `src/services/interactions/stream.ts`：SSE 解析和事件转换。
- `tests/interactions-convert.test.ts`、`tests/interactions-stream.test.ts`、`tests/interactions-round-trip.test.ts`：离线测试。
- `tests/fixtures/interactions/`：仅在测试需要时添加协议样本，标明官方样本或合成数据。
- `ANTIGRAVITY_INTERACTIONS_REVIEW_FIXES_REPORT_CN.md`：实际检查结果及支持范围。

当前工作目录为主仓库 `I:/Cache/workshop/copilot-api`。允许修正上述已有转换器和对应测试；其他业务文件不在范围内。不新增桥接脚本。

## 方向一：请求转换

| Responses | Interactions |
|---|---|
| model | 显式传入的上游模型名，未覆盖则保留 |
| instructions、前置 system/developer 文本 | 按固定顺序组成 system_instruction |
| input 字符串、user message | user_input，保留文本 |
| assistant message | model_output |
| stream、store | 保留显式值；store 缺省按约定的 Responses 默认值处理 |
| max_output_tokens | generation_config.max_output_tokens |
| 已支持的 reasoning 参数 | 对应 thinking 参数 |
| function 声明 | name、description、parameters |
| tool_choice | 对应工具选择参数 |
| function_call | 保留 call_id，arguments 字符串解析为对象 |
| function_call_output | function_result，保留 call_id 和 output |
| previous_response_id | previous_interaction_id，原样传递 |

保留历史顺序、文本及工具结果，不补历史。完整历史中的调用与结果核对名称；显式父引用的孤立结果允许省略可选 name。非法 arguments JSON 明确报错。

custom 文本工具仅作 `{input:string}` function 包装，反向恢复原文本；不实现 grammar 解释器。无法等价表达的 strict、格式约束或语义参数明确报错，不静默降级。历史中间的指令无法保持语义时明确拒绝。支持范围依据已抓取官方资料及测试确定，不以抓取客户端请求作为前置条件。

## 方向二：响应转换

JSON 保留 interaction.id 为 response.id，model 使用显式回显名；按 step 顺序转换文本为 assistant message、工具调用为 function/custom item、thought 摘要为 reasoning summary。工具 call_id 与 item.id 分开处理。

completed 映射 completed；requires_action 输出待执行工具并结束当前响应；failed 映射 failed；incomplete/cancelled 映射 incomplete。保留部分输出，不伪造完成或没有依据的 incomplete reason。资源 errors 数组取首个有效诊断，空诊断使用明确通用错误；SSE error 独立解析。

SSE 输入 step.start/delta/stop 与 interaction 生命周期事件，输出 Responses 对应 added/delta/done 和唯一终态。保持事件顺序、item ID 稳定和多工具缓冲隔离；工具参数收齐校验后输出。处理 UTF-8 分片、CRLF、多行 data、心跳及异常 EOF。终态缺 output 时使用当前流已累积内容，不重复追加。取消接口只丢弃本实例缓冲；不操作网络 reader。

usage 使用最近一次累计快照：读取 step.delta.metadata.total_usage、step.stop.usage，终态明确 usage 优先。不累加累计值，不把 step_usage 当累计值。按官方计数口径映射 input/output/thought/cached/total；缺失不等于零，不编造统计。

## 历史、重放与缓存标识

客户端持有历史。转换器只处理本次输入，response.id / previous_response_id 和工具 call_id 保持关联，不维护 ID 映射表。

thought/signature 使用已有版本化可逆包装随 reasoning item 返回；客户端带回时校验并恢复，保持内容和顺序。它是数据编码，不是加密。全新实例必须能仅凭客户端输入完成恢复。

session-id、prompt_cache_key 等显式上下文原样随转换结果 metadata 返回，没有协议等价字段就不塞入 Google body。保持稳定输入和顺序，只映射上游缓存计数；不保证实际 cache hit，不负责账号或 endpoint 稳定性。

## 离线验收

| 测试 | 判断依据 |
|---|---|
| 请求映射 | 文本、指令、参数、模型、完整历史顺序与预期对象一致；输入未被修改 |
| 工具往返 | function/custom 文本、call_id、参数、结果可逆；父引用允许省略 name；冲突明确失败 |
| JSON 响应 | 文本、reasoning、工具、错误、终态、usage 正确 |
| SSE | 任意分片、初始内容、参数隔离、唯一终态、部分输出、坏帧及 EOF |
| JSON/SSE 一致性 | 相同语义输入得到相同最终 output、status、error、usage |
| 无状态重放 | 全新实例恢复客户端提供的 thought/signature；交错流无数据串入 |
| 标识和统计 | ID、metadata 保留；累计覆盖、零和缺失分别断言 |
| 范围 | 转换模块无网络、凭据、配置或跨请求存储依赖；没有服务接线 |

测试直接调用转换函数或向流实例喂入字节，不启动服务器、不执行工具、不调用真实服务。期望值根据协议人工核对，不由被测函数生成。

运行三个 interactions 测试文件、typecheck 和定向 ESLint；必要构建检查只用于验证模块编译。报告仅声明离线协议转换结论。真实 Codex、Google/Antigravity 接入及缓存命中不是本看板的完成条件，也不自动触发后续联调看板。

## 资料

只读参考 `antigravity-interactions-api-docs/` 中已抓取的 Google Interactions、Gemini Enterprise Interactions、OpenAI Responses 和迁移指南；v1 字段以已核对的官方 v1 资料为准。
