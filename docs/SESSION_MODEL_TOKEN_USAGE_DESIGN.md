# Session 分模型 Token 用量统计设计

状态：待实现，2026-09-12 根据实测和并发审查更新。本文只定义功能与验收规则，不修改现有代理行为。已取得 `/v1/responses` 的 Codex 0.153.4 CLI 首轮/resume、`deepseek-flash` 与 `gpt-5.6-luna` 正常 JSON/SSE 样本，证据见 [实验报告](SESSION_MODEL_TOKEN_USAGE_EXPERIMENT_REPORT.md)。桌面重启、切换模型、工具续轮与异常终态尚未验证；并发规则见第 6.3 节，尚未实现或压测。

## 1. 目标与范围

按 session ID 汇总每个模型实际返回的 token 用量，状态保存在本地，重启后恢复，最多保留 100 个 session，自动剔除最旧记录。

“一条记录”指一个 session，不是一条请求或一个模型。一个 session 可以切换多个模型，每个模型分别累计；同一模型跨 session 独立统计。淘汰整个 session 时，同时移除它的所有模型统计。

主入口是 `/responses` 与 `/v1/responses`，它同时覆盖 Copilot 与 DeepSeek。Codex 只用 Responses，本次实现与取样都以它为准。

本次不接入、不测试 Chat Completions 与 Messages。Embeddings、token 预估、模型列表、账号额度查询也不纳入统计。

不新增工具白名单，不修改请求的 tools、reasoning、history 或模型能力声明；usage 缺失、格式错误、存盘失败均不阻止原请求转发。不为获得 usage 强行添加 `stream_options`。

**代理优先、统计异步：** handler 不等待统计初始化、解析、聚合、查询或落盘。独立统计 Worker 承担这些工作；转发路径仅做有界的数据复制和非阻塞投递。统计积压时舍弃统计副本，不能反向施加背压或暂停上游读取。统计因此为最终一致、尽力采集，不承诺零开销或过载时零丢失；丢失必须有诊断计数。

## 2. 现有代码与接入位置

| 位置 | 现有行为 | 本功能接入方式 |
| --- | --- | --- |
| `src/routes/responses/handler.ts` | 解析模型路由，转发原始 JSON/SSE | 复用已解析路由字段，非阻塞投递请求上下文和响应字节副本 |
| `src/routes/usage/route.ts` | 返回 GitHub Copilot 账号额度 | 保持原接口，新建 session 查询接口 |
| `src/lib/paths.ts` | 定义用户级 APP_DIR | 新增统计文件路径，不复用 GitHub token 初始化 |
| `src/start.ts` | 初始化代理与 provider | 异步启动统计 Worker；代理监听不等待统计状态恢复 |

不在共用的上游调用函数与 HTTP handler 中同时计数；每个入口仅创建一个请求统计器。

## 3. Session 识别

### 3.1 实测确认（2026-09-12，Codex 0.153.4）

本次 Codex CLI 首轮和 resume 在 `/v1/responses` 请求上实际携带的字段如下。虽然 originator 为 Codex Desktop，此实验并不是桌面 UI 的重启或切换模型测试：

| 来源 | 实测形态 | 同一 session 多轮 |
| --- | --- | --- |
| 请求头 `session-id` | UUID 字符串 | 保持不变 |
| 请求头 `thread-id` | 与 `session-id` 相同 | 保持不变 |
| 请求头 `x-client-request-id` | 与 `session-id` 相同 | 保持不变 |
| 请求头 `x-codex-window-id` | `(<session-id>:0)` | 保持不变 |
| 请求头 `x-codex-turn-metadata` | JSON 字符串，含 `session_id`、`thread_id`、`turn_id`、`request_kind` | `session_id` 不变，`turn_id` 每轮变化 |
| 请求体 `client_metadata` | 含 `session_id`、`thread_id`、`turn_id` 等条目 | 同上 |

本次样本没有 `session_id` / `x-session-id` 头，也没有顶层 `metadata`，有 `client_metadata`。`x-codex-window-id` 带窗口序号，不作为聚合 key。上述观测不代表所有 Codex 版本或客户端均采用相同字段。

### 3.2 识别顺序

按以下顺序取第一个有效值：

1. 请求头 `session-id`。
2. 请求体 `client_metadata.session_id`（仅接受字符串）。
3. 请求头 `thread-id`（明确的任务标识兜底）。

请求头名称大小写不敏感；session ID 去除首尾空白，大小写保留，不强制 UUID。限制为 1–256 个字符，不含控制字符，超长或非法值视为无效。多个来源冲突时按上述优先级选取，不拼接、不修改请求。该标识只用于本地归属，不自动添加到发往上游的 header 或 body。

不解析嵌套的 turn metadata，不使用 `x-client-request-id` 兜底：本次它恰好等于 session ID，不足以证明其始终具有 session 语义，也不能据此去重并发请求。

缺失标识时：请求照常执行，但不创建 session 记录。进程内增加 `unattributedRequests` 诊断计数，在查询接口中暴露，以便发现漏统计。不要将所有无标识请求合并到 `unknown`，也不要用 response ID、request ID、API Key 或客户端 IP 代替 session ID。

session ID 视为调用方提供的标签，不代表登录身份。子任务如果使用不同 ID，分别统计；只有显式使用同一 ID 才合并。

## 4. 模型归属与统计口径

模型分组键为 `(provider, upstreamModel)`，例如 `(deepseek, deepseek-flash)`，采用数组或 Map 的结构化键，避免字符串分隔符碰撞。以代理解析后实际发往上游的模型名为准，不用上游可能变化的展示名称。

别名请求按实际模型合并：例如 `codex-auto-review` 和直接调用其目标模型，记入同一模型分组。记录 `lastRequestedModel` 便于查看最近一次使用的别名，不保存完整请求列表。

| 汇总字段 | Responses 来源 |
| --- | --- |
| `inputTokens` | `usage.input_tokens` |
| `outputTokens` | `usage.output_tokens` |
| `totalTokens` | `usage.total_tokens`，缺省时用 input + output；有值时保留上游值 |
| `cacheReadTokens` | `usage.input_tokens_details.cached_tokens` |
| `cacheWriteTokens` | `usage.input_tokens_details.cache_write_tokens`，仅上游提供时 |
| `reasoningTokens` | `usage.output_tokens_details.reasoning_tokens` |

缓存读取/写入是输入明细，reasoning 是输出明细，不额外加到 `totalTokens`。不使用本地 tokenizer 预估，不累计流式文本长度，不将 `copilot_usage.total_nano_aiu` 当 token。

### 4.1 实测样本

2026-09-12，`/v1/responses`，非流式，单轮 `Reply with exactly OK.`：

| 模型 | 原始 `usage` |
| --- | --- |
| `deepseek-flash` | `{"input_tokens":35,"input_tokens_details":{"cached_tokens":0},"output_tokens":20,"output_tokens_details":{"reasoning_tokens":18},"total_tokens":55}` |
| `gpt-5.6-luna` | `{"input_tokens":11,"input_tokens_details":{"cache_write_tokens":0,"cached_tokens":0},"output_tokens":5,"output_tokens_details":{"reasoning_tokens":0},"total_tokens":16}` |

结论：

- 两个模型本次 JSON 样本的 usage 都位于顶层 `usage`。DeepSeek 样本缺少 `cache_write_tokens`，Luna 样本有该字段；缺失不等于零，也不意味着未来不会返回。
- 全部样本满足 `total_tokens = input_tokens + output_tokens`。
- reasoning 属于 output：`gpt-5.6-luna` 用思考档位的一次样本为 `input 52 / output 49 / reasoning 42 / total 101`，若 reasoning 独立于 output，总数应为 143。
- cached / cache write 属于 input：同一固定前缀重复请求时，`deepseek-flash` 第二次为 `input 4877, cached 4736`，`gpt-5.6-luna` 第一次 `cache_write 4850`、第二次 `cached 4850`，两次 input 总量都是 4853。
- 本次 DeepSeek 样本未出现 `prompt_cache_hit_tokens` 等顶层计数器；`prompt_cache_key` 与 `prompt_cache_retention` 不属于 usage。cache miss 不能当 cache write。
- Copilot 顶层另有 `copilot_usage`（账单口径，含 `token_details[].token_count` 与 `total_nano_aiu`）。它的 token_count 与 `usage` 基础字段一致，可用作交叉校验，但不作为统计来源。

基础 usage 有效条件：input、output 都是非负安全整数；total 若存在也须有效，缺省时推导。可选明细缺失或非法时忽略该字段。基础字段非法或相加超出安全整数范围时，本次不计 token，记为 `usageMissingRequests` 并告警，不影响代理。

每个模型分组维护：

- `requestCount`：后台已结算的上游调用次数；未准入统计的请求不在其中，通过 droppedRequests 单独暴露缺口。
- `usageReportedRequests` / `usageMissingRequests`：有有效基础 usage / 没有有效基础 usage 的次数，二者之和等于 requestCount。
- `failedRequests`：HTTP 非 2xx、上游错误终态或网络错误的次数。
- `cancelledRequests`：客户端取消的次数，与 failedRequests 互斥，取消优先。
- token 累计值及可选明细覆盖次数，例如 `cacheReadReportedRequests`；累计值为 0 且覆盖次数为 0 表示未报告，不能解释为确实没有缓存消耗。

失败或取消前收到完整、可信 usage 时仍累计它，因为调用可能已消耗 token。没有 usage 的失败、截断响应标记未知，不能伪装成 0 token 的成功调用。限流、手动审批拒绝、配置校验失败发生在上游调用前，不计入模型调用次数。

## 5. JSON 与流式统计

### 5.1 非流式

主线程随转发非阻塞投递有界字节副本，随后投递结束标记，立刻结束客户端响应。Worker 收到结束标记后解析该请求的 JSON 缓冲并提取 usage；主线程不执行统计所需的 JSON.parse 或等待解析结果。保持原响应字节、状态码与现有转发头处理规则。

### 5.2 Responses SSE

在 Copilot item ID normalizer 之前采集原始上游流；DeepSeek 继续原样透传。转发钩子把原 chunk 交给下游，仅在统计容量足够时复制字节并投递 Worker；钩子不做 SSE 解码、JSON.parse 或聚合，也不等待 Worker ACK。副本独占 ArrayBuffer，可转移给 Worker，绝不能转移或 detach 下游仍使用的原 buffer。复制和投递本身仍有少量 CPU 开销，以第 6.4 节对照测量为准。

实测确认（2026-09-12）：两个模型的正常流样本在 `response.created` / `response.in_progress` 中有 `usage: null`，非空 usage 仅出现在 `response.completed` 的 `response.usage`，没有第二个完成事件或 `data: [DONE]` 收尾帧。DeepSeek 在正文前额外发送 `response.reasoning_text.delta/done`；Copilot 的完成帧在顶层多一个 `copilot_usage` 兄弟字段。不能把起始 null 提前结算为 missing。`response.incomplete` / `response.failed` 未取得真实样本，下面对它们的读取规则仍是待验证的兼容设计。

以下解析全部在 Worker 内执行：

- 使用流式 TextDecoder，兼容 UTF-8 多字节跨 chunk、LF/CRLF、事件跨 chunk、多行 data、注释和 `[DONE]`。
- 读取 `response.completed`、`response.incomplete`、`response.failed` 中的 `response.usage`，兼容在 JSON 的 type 中标记事件类型。
- 同一请求中的累计 usage 快照只替换，不相加；多个完成事件也只能提交一次。不要把 delta 当作累计 usage。
- 单事件缓冲上限 4 MiB，非流式 JSON 观察缓冲上限 8 MiB；超过上限或解析失败时停止该请求的统计解析，但继续原样转发并标记 usage 缺失。不得积累完整 SSE 历史。
- 主线程在上游正常 EOF、错误、客户端取消时只投递一次结束标记；Worker 按每请求消息顺序处理完已接收字节后幂等 finalize。响应完成不等待后台结算。
- 磁盘写入在 Worker 的串行队列中执行。禁止无上限的 `Response.clone().text()` 或无限缓冲的 tee 分支；仅写 `void asyncFunction()` / Promise.then 不构成 CPU 隔离，解析仍在主线程会阻塞转发。

### 5.3 有界投递与过载

- 一个代理实例启动一个专用 Worker。主线程只保存轻量投递句柄，Worker 独占 parser、session store 和 writer。生产构建须包含 Worker 入口并验证 Bun 的实际加载路径。
- 初始内部上限：最多 256 个已准入但未 ACK 结算的请求、最多 16 MiB 在途字节副本、最多 4096 个在途数据消息；单个 chunk 大于 256 KiB 时不复制，停止该请求后续统计。上限属于实现常量，测试可注入更小值，不新增用户配置。这些数值是待性能验证的初值。
- `tryBegin` 仅在 Worker ready 且有请求槽位时非阻塞准入。为每个槽位预留开始和结束控制消息额度，防止数据队列满后无法结束统计；容量检查必须发生在 postMessage 前，不能把 Worker 消息队列当成无限缓冲。Worker ACK 后才归还相应槽位/消息/字节额度，主线程绝不 await 额度。
- 每个请求消息顺序固定为 begin → chunks → end。消息含 Worker 代次和请求局部唯一 ID（不是 session ID）；同一发送端保持 FIFO，端到端额度覆盖尚未处理的消息。Worker 释放数据副本后归还字节额度；parser 保留的内存另受总计 32 MiB 缓冲预算限制，并保留原单请求 SSE 4 MiB / JSON 8 MiB 上限。
- 任一数据额度或 parser 预算超限，该请求标记 captureDropped，停止后续采集，原流继续。允许结束标记通过预留额度；Worker 丢弃不完整解析状态，结束时按 usageMissing 结算，不把破碎样本计成完整用量。每请求只增加一次 droppedRequests；若 begin 根本未准入，则仅增加进程诊断 droppedRequests，不伪造模型 requestCount。
- Worker 初始化中/不可用时直接跳过统计。Worker 异常退出时，尚未结算的句柄标记为丢失，释放额度，丢弃旧代次消息；不重放不确定已提交的请求，以免双计。首版不自动重启 Worker，状态显示 unavailable，代理继续；代理下次启动恢复最后成功落盘状态。
- 上述副本仅存在于有界内存中，可能含响应文本；后台仅持久化聚合结果，不能写原响应日志。所有异常在统计边界内处理，告警限频且异步处理，不抛入推理 handler。

### 5.4 重试与重复事件

每次实际发往上游的 HTTP 请求是独立消耗，客户端重试不按 session/model 或请求内容去重。同一请求内用 finalize 标志防止重复事件与 EOF 双计。进程崩溃后不会重放未完成请求，因此不承诺跨崩溃的 exactly-once 计费账本。

## 6. 本地状态与保留规则

默认路径：`path.join(PATHS.APP_DIR, "session-token-usage.json")`。Windows 当前用户通常为 `C:/Users/Jeff/.local/share/copilot-api/session-token-usage.json`。不硬编码用户名或盘符；Linux/Docker 使用同一 APP_DIR 规则，通过持久化挂载该目录保存状态。

功能默认启用，容量固定为 100，不要求添加 config.json 字段或环境变量。创建统计目录的动作独立于 Copilot 启用状态，DeepSeek-only 同样可用。

文件只保存聚合值、session ID、模型标识、时间戳和诊断元数据，不存 Key、prompt、工具参数或响应文本。示意结构如下，tokens 下的可选明细及覆盖计数按第 4 节补齐：

```json
{
  "version": 1,
  "updatedAt": "2026-09-11T15:00:00.000Z",
  "sessions": [
    {
      "sessionId": "session-001",
      "createdAt": "2026-09-11T14:50:00.000Z",
      "lastUsedAt": "2026-09-11T15:00:00.000Z",
      "models": [
        {
          "provider": "deepseek",
          "model": "deepseek-flash",
          "lastRequestedModel": "deepseek-flash",
          "requestCount": 2,
          "usageReportedRequests": 2,
          "usageMissingRequests": 0,
          "failedRequests": 0,
          "cancelledRequests": 0,
          "tokens": {
            "inputTokens": 1800,
            "outputTokens": 300,
            "totalTokens": 2100
          }
        }
      ]
    }
  ]
}
```

### 6.1 100 条淘汰

1. 主线程在上游调用即将开始时采集开始时间和顺序并尝试投递 begin；Worker 消费 begin 时创建或获取 session，createdAt/lastUsedAt 使用消息中的请求开始时间，不用后台处理时间。
2. 加入第 101 个 session 后，按 `(createdAt 升序, sessionId 字典序)` 删除最旧者，直到为 100。是按首次记录时间淘汰，不是按最近访问时间淘汰；旧 session 活跃不会刷新它的 createdAt。
3. 查询不会更新任何时间戳。保留记录中的 token 持续累计；淘汰后历史不可查询或恢复。
4. Worker 内每个请求上下文持有记录实例引用。若请求结算前该记录被淘汰，finalize 不重新插入它；检查当前 Map 中仍为同一实例后才能提交，防止晚到响应复活旧记录或写入同 ID 的新记录。
5. 已淘汰 ID 之后收到新请求时，建立一个新的统计周期，createdAt 使用新时间，历史从零开始。此时不声称它是该 session 的终身总用量。
6. 加载历史文件也执行同一排序裁剪规则。记录创建、淘汰和结算都标记为待持久化变更。

### 6.2 写入与恢复

- Worker 启动后异步读取 JSON，使用 zod 校验版本、唯一 session ID、唯一模型键、计数和时间戳；不存在视为空历史。恢复结束后发送 ready，期间代理不等待，不缓存无限量启动请求。
- 所有聚合内存更新在同一个 Worker 中同步执行；文件写入通过 Worker 内单一串行队列，避免较旧快照最后覆盖新快照。主线程不持有或更新 session store。
- writer 空闲时，首次未保存变更启动 500 ms 合并定时器，后续变更不重置它；这是开始写入的调度目标，不保证磁盘在 500 ms 内写完。writer 忙时仅标记新版本，当前写入完成后立即保存最新状态，不为每次请求堆积快照。
- 先写同目录临时文件，关闭后原子 rename 替换正式文件；失败保留旧文件。正常停止按第 6.3 节有限期限尝试刷新，超时不拖住代理退出。意外断电/强制结束可能丢失未落盘窗口的数据，不能当正式账单。
- 文件损坏时保存为带时间戳的 `.corrupt` 文件并告警，从空历史继续；备份失败则保留原文件、进入仅内存模式，避免覆盖损坏证据。未知更高版本不覆盖，进入仅内存模式。
- 写盘权限错误时请求继续，暴露 `persistenceStatus: "degraded"`；定时重试采用固定退避，限制告警频率，恢复后写最新内存快照。
- 第一版一个状态文件只允许一个代理进程写入，不支持多进程共享聚合。部署多个实例时隔离用户/挂载目录；不要宣称原子 rename 可以解决多进程丢失更新。

### 6.3 并发请求与一致性

支持一个代理进程内多个 session、同一 session 的多个模型、同一模型的多个 JSON/SSE 请求同时执行。主线程并发转发，统计通过非阻塞消息进入同一个 Worker；Worker 顺序更新其独占 store，并异步写盘。无需给网络请求加锁，也不能让转发等待 Worker 的任务队列。

**请求开始与结算：**

1. 模型路由确定、审批与限流通过后，主线程调用 `tryBegin`，只生成局部请求 ID、复用路由解析所得 session/provider/model 值并投递开始消息，立刻发起上游请求。不得为统计二次解析完整请求 body。session/model 查找、创建与淘汰由 Worker 消费 begin 时完成。
2. Worker 上下文固定保存 session 记录实例、provider、upstreamModel、请求开始序号及 finalized 状态。SSE decoder、事件缓冲和 usage 快照由本请求独占；主线程句柄只保存投递额度、结束/丢失标记，不访问 Worker 的 Map。
3. Worker 消费 begin 时根据原始开始时间与序号更新 `lastUsedAt`、`lastRequestedModel`，结算不覆盖它们。先开始但后完成的请求不会回滚最近模型；同毫秒以主线程开始序号确定先后，序号不需持久化。系统时间回拨时 lastUsedAt 取已有值和开始时间的较大值。
4. 主线程 EOF/error/cancel 仅设置本句柄 ended 并投递一次 end；Worker 按 FIFO 消费完已投递字节后执行 finalize，检查请求状态及 session 实例，再读取当前模型累计值一次性提交计数与 tokens。Worker 内该提交不含 await，不能用请求开始时的旧总数覆盖新总数。查询稍后才能看到该结果，HTTP 响应不等待它。
5. end 包含已观测的生命周期结果与 captureDropped 标志。取消传播给上游立即执行，不依赖统计消息投递或 ACK。重复 end 无操作；已完成上下文删除后，未知请求 ID 的消息直接忽略，不重新建记录。不能只靠 TransformStream.flush 覆盖错误和 cancel 路径。
6. session 淘汰与重建遵循实例检查：旧请求 A 未完成时其记录被淘汰，同 ID 的请求 B 创建新记录，A 的结果不得写入 B。活跃 session 也允许被淘汰，以严格维持 100 条；其未结算消耗不进入保留记录。这是保留策略的取舍，不承诺已淘汰 session 的完整账本。

累加前检查新的 token 总数仍为非负安全整数；若基础总数溢出，本次基础 token 不提交，记 usageMissing 并告警，不能只更新一半字段。可选明细溢出时不更新该项及其覆盖次数。计数或派生查询总数超出安全整数范围也不得静默舍入，须显式报告统计溢出；无需为此阻断推理。

**写盘期间的新请求：**

- Worker 内维护 `revision` 与 `persistedRevision`。每次内存变更推进 revision，writer 在 Worker 中生成独立 JSON 字符串及其版本 R 后再开始异步 I/O；不将可变 Map 引用交给异步序列化。解析或序列化慢只导致统计积压，主线程继续转发并按额度舍弃副本。
- 同时最多一个 writer 和一个调度/重试定时器。写入 R 成功后仅将 persistedRevision 更新到 R；若内存已到 R+1，立即开始最新快照，不能因 R 成功而清除 R+1 的脏状态。
- 写入失败不推进 persistedRevision，按退避重试最新状态。待写队列不保留每个中间版本，内存最多持有一个在写快照和当前聚合状态。
- 临时文件名包含进程标识和随机后缀，避免临时文件相撞；它不提供多进程合并保证。第一版不实现跨进程锁，两个进程共享正式文件属于不支持的部署方式，可能丢失更新。

**查询与关闭：**

- 仅 usage 查询接口可异步请求 Worker 快照，1 秒超时返回 503 和统计状态，不影响推理路由。Worker 同步复制 DTO 并求和，一次响应来自一个后台内存时点，不等待磁盘。返回 `snapshotAt`、`pendingRequests`、`droppedRequests`、`statisticsStatus`；已完成 HTTP 请求仍可能 pending，首个 begin 尚未消费时详情暂时不存在。明确最终一致，不宣称请求结束立即可查。
- 不因统计增加代理排空或取消规则。代理按原有关闭流程处理请求，随后向 Worker 发 drain；最多额外等待 1 秒消费已入队消息并保存快照，超时记录未保存状态后终止 Worker 并退出。普通 HTTP 响应始终不等待 drain，正常退出也不承诺一定保存成功。强杀可能丢失后台未结算或未落盘的数据。
- 资源上限按第 5.3 节执行：在途副本、消息数量、请求上下文、parser 总缓冲分别有界。超限只舍弃统计，不能增加代理请求限流；完成或 Worker 退出时释放对应资源。

### 6.4 并发验收用例（待实现后执行）

测试使用可控 promise/屏障安排交错顺序，不只依赖随机 sleep；真实上游样本作为 parser fixture，并发用本地 stub 完成。

| 场景 | 通过条件 |
| --- | --- |
| 同 session 同模型 100 个请求反序完成，JSON/SSE 混合且未超预算 | 后台排空后请求数为 100，tokens 等于各请求 usage 之和，无覆盖丢失 |
| 同 session 两模型交错、不同 session 同模型交错 | 按固定 provider/model/session 归属分别累计；最近模型按开始顺序 |
| 相同 session/client-request-id 的两次 HTTP 调用 | 两次独立结算；单请求的重复完成事件和 EOF 只结算一次 |
| EOF、cancel、读流错误交错 | 每个请求只提交一次，无未处理拒绝，取消可到达上游 |
| 超过 100 个 session，同 ID 淘汰后重建，旧请求晚完成 | 保留数始终不超过 100；旧实例无法更新新实例 |
| 阻塞版本 R 的写入，同时产生 R+1 与 R+2 | R 成功后仍会保存最新版本，writer 最大并发为 1，无快照积压 |
| 写入失败期间持续更新，再恢复磁盘 | 重试保存最新总数，旧快照不覆盖新状态 |
| 查询与多请求结算交错 | 每次 DTO 的计数与 tokens 来自同一时点，计数恒等式成立 |
| 正常关闭时 writer 正忙或卡住 | 统计额外等待不超过 1 秒，重复信号不重复 drain，不为统计主动取消推理 |
| 100 条流同时传输、取消半数并全部结束 | 缓冲与上下文释放，磁盘 I/O 不阻塞逐 chunk 转发 |
| 暂停 Worker 消费、卡住解析或状态加载 | 客户端仍收到完整响应和 EOF，代理不等待 ready/ACK，统计状态显示积压或 initializing |
| 填满数据队列及 parser 预算 | 不超内存/消息预算；转发字节不变，丢失计数增加，end 控制消息仍能提交 |
| Worker 异常退出、postMessage 失败 | 现有流及新请求继续；无异常泄漏到 handler，无旧代次重放或额度泄漏 |
| 统计开/关各跑固定并发、相同 stub 分块 | 比较首字节、chunk 间隔、EOF 延迟与主线程事件循环延迟的 p50/p95/p99；无等待统计的因果依赖，复制/投递开销单独报告，不声称绝对零延迟 |

## 7. 查询接口

新增独立路由，保留原 `/usage` 的账号额度语义：

| 方法与路径 | 返回 |
| --- | --- |
| `GET /usage/sessions` | 最多 100 个 session 摘要，按 createdAt 降序 |
| `GET /usage/session?session_id=...` | 指定 session 的所有模型计数与 token 明细；参数须 URL 编码 |

列表响应提供 `limit: 100`、`count`、`sessions`、`persistenceStatus`、`lastPersistedAt`、`processStartedAt`、`unattributedRequests`，以及第 6.3 节的异步状态。`statisticsStatus` 为 initializing / ready / degraded / unavailable；数据被舍弃时显示 degraded 并累计 droppedRequests，与仅描述落盘的 persistenceStatus 区分。诊断计数是当前进程计数，不混入持久化 session token 汇总。摘要含 sessionId、createdAt、lastUsedAt、modelCount、请求计数与基础 token 合计；总数在 Worker 中从模型分组求和。

详情包含第 6 节的单条 session 结构。缺少/非法参数返回 400，不存在或已淘汰返回 404；仅内存模式仍返回可用统计并标记 degraded。

第一版不增加删除、清空或写入接口，不改变现有 API 响应，不自动修改 Codex 配置。查询接口沿用代理现有访问边界；返回的是调用方提交的 session 标签，不代表身份授权。

## 8. 拟新增模块

| 文件 | 职责 |
| --- | --- |
| `src/lib/session-usage-client.ts` | 主线程非阻塞准入、额度管理、投递、统计状态与查询 RPC |
| `src/workers/session-usage.ts` | Worker 入口，消费生命周期/字节消息，调度解析与聚合 |
| `src/lib/session-usage.ts` | Worker 独占的内存聚合、淘汰、状态文件与写入队列 |
| `src/lib/token-usage.ts` | 上游 usage 标准化、字段验证 |
| `src/routes/responses/usage-observer.ts` | 主线程透传钩子，复制并投递有界响应数据与结束标记 |
| `src/lib/responses-usage-parser.ts` | Worker 内的 JSON/SSE 有界解析与 usage 提取 |
| `src/routes/usage/session-route.ts` | 列表、详情查询 |
| `tests/session-usage.test.ts` | 聚合、淘汰、持久化、并发与损坏恢复 |
| `tests/responses-usage.test.ts` | 原始流不变、终态、取消、分块与 usage 提取 |

现有 handler 只插入非阻塞生命周期/字节投递钩子；增加同进程专用 Worker，不新增独立服务、数据库或通用事件总线。状态文件路径和容量通过内部构造参数注入便于测试，生产默认不新增配置要求。

## 9. 实施顺序与验收

1. 确认真实客户端 session 字段；实现 session 识别和 usage 标准化。
2. 实现 Worker、有限额度投递、内存聚合、100 条淘汰、原子快照保存和异步启动恢复。
3. 仅接入 Responses 的 JSON/SSE，验证 handler 不 await 统计，保持一次已准入上游调用只结算一次。
4. 增加查询路由、错误诊断与 README 使用说明。
5. 完成以下测试，运行 TypeScript、ESLint、Bun 测试和 build，验证构建产物。

验收用例：

- 同一 session 调用两个模型分别累计；同一模型跨两个 session 分开记录；同一实际模型的别名合并。
- 缺失 session 不影响响应且增加 unattributed；标识来源冲突遵循优先级。
- cached/reasoning 明细不重复加入总量；基础或明细缺失时准确标记覆盖情况。
- SSE 在任意字节处分块、重复 completed、混合换行、取消与网络失败时不双计；有完整 usage 的错误也可记录。
- 统计开启前后 Responses 响应字节一致，首个 chunk 不等待完整响应或磁盘保存；大事件触发上限后正常透传。
- 101 个 session 恰好保留最新创建的 100 个；重新访问旧记录不改变淘汰次序；晚到的完成事件不复活已淘汰记录。
- 未超预算的并行请求在后台排空后无丢失增量；超预算时按规则记录缺口并继续转发。连续写入无旧快照覆盖；重启恢复已落盘总量与淘汰顺序。
- JSON 损坏、权限错误、未知版本、Worker 卡住或队列满均不阻断推理；正常退出在有限期限内尝试刷新待写状态。
- 使用带测试 session ID 的真实客户端做一次请求，在列表和详情看到对应模型；重启代理后仍可查询。真实请求需使用现有授权凭证，验收输出不含 Key 或会话内容。

完成标准：后台排空后用真实 session ID 可以查询各模型已观测 token 累计，重启恢复最后成功保存的状态，状态文件始终不超过 100 个 session；转发不等待统计，统计过载与故障只影响统计完整性且可见，不破坏现有代理转发。

## 10. 实现前需要实验确认的事项

2026-09-12 已完成第一轮取样，不能笼统称 E1–E4 全部通过：正常 Responses schema 已确认，桌面生命周期和工具续轮仍有空缺。E5/E6 已移出范围，E7–E9 和第 6.4 节并发验收仍待执行。取样细节见 [实验报告](SESSION_MODEL_TOKEN_USAGE_EXPERIMENT_REPORT.md)，以本节的证据边界为准。

### 10.0 第一轮取样结论

| 项目 | 状态 | 依据 |
| --- | --- | --- |
| E1 session 字段 | 部分确认 | CLI 首轮/resume 的 session-id 稳定；桌面重启、切模型未测；request-id 不作为 session 契约 |
| E2 JSON usage schema | 已确认 | `deepseek-flash` 与 `gpt-5.6-luna` 非流式各一轮，路径与字段见 4.1 |
| E3 SSE usage 位置 | 正常单轮已确认 | 两个模型流式各一轮，非空 usage 仅在 completed.response.usage；created/in_progress 的 usage 为 null，无 `[DONE]`。工具续轮未测 |
| E4 cache / reasoning 语义 | 已确认 | 各 provider 两次相同前缀请求，加一次 Copilot 思考档位样本 |
| E5 Chat 流式 usage | 范围外 | Codex 只用 Responses；代理不把 DeepSeek 路由到 Chat |
| E6 Messages 转换 | 范围外 | 同上，未取样 |
| E7 失败/截断/取消 | 待验证 | 需要截断、取消与 stub 模拟 |
| E8 观察流对转发的影响 | 待验证 | 需要实现后做有/无观察器的对照 |
| E9 本地写入可靠性 | 待验证 | 需要 Windows 原子替换与强杀实验 |

| ID | 需要确认 | 实验方法 | 结果与通过条件 |
| --- | --- | --- | --- |
| E1 | Codex 实际 session ID 字段及稳定性 | 在代理入口只观察候选 session 字段；同一任务连续两轮、切换模型、重启桌面后继续，再新建任务各取样一次 | 同一任务 ID 稳定，新任务 ID 不同；记录实际字段路径。若没有稳定 ID，明确当前桌面请求无法按任务归属，不能用 request ID 替代 |
| E2 | 各 provider 的 JSON usage schema | 分别请求 Copilot / DeepSeek 的 Responses 非流式接口，保存脱敏 usage 对象 | 确认 usage 所在路径、基础字段名称、类型、null/缺失情况，以及实际返回 model |
| E3 | SSE usage 的位置和累计语义 | 对 E2 中可用入口开启流式，只记录事件名、JSON type、usage 对象及顺序；覆盖普通回答和一次工具调用后续请求 | 确认 usage 在哪个事件/路径出现、是否多次出现、是累计快照还是增量、是否有 `[DONE]`。不得预先认定 DeepSeek 与 Copilot 都使用 `response.completed.response.usage` |
| E4 | cache / reasoning 的字段与包含关系 | 使用支持思考的模型请求；对同一固定前缀重复请求观察缓存。记录基础值和全部 usage 明细 | 确认 cached、cache write、reasoning 的实际路径及是否包含在 input/output 中。特别检查 DeepSeek 是否返回 `prompt_cache_hit_tokens` / `prompt_cache_miss_tokens` 等顶层字段；cache miss 不能直接当 cache write。未观测到的字段标为未确认，不硬编码猜测映射 |
| E5 | Chat 流式默认是否提供 usage（**范围外**） | 使用当前代理实际发送的请求参数取样；在独立实验请求中对比上游支持的 `stream_options.include_usage` | Codex 不走 Chat，本次不做；若以后要给其他客户端统计，再按原方法取样 |
| E6 | Messages 转换前后的 usage 差异（**范围外**） | 对 `/v1/messages` 的 JSON / SSE 调用同时观察原始 Chat usage 与转换结果，仅保留 usage 样本 | 同上，本次不做；接入时证明统计取自上游真实值，且一次上游调用只结算一次 |
| E7 | 失败、截断和取消能否取得 usage | 用较小输出上限触发截断；受控取消流；用本地上游 stub 模拟错误终态、连接中断、重复终态，再补充真实可取得的错误样本 | 区分真实上游已确认行为与 stub 覆盖；确认 finalized 只发生一次，有完整 usage 则保留，无则 missing，不把取消算作零 token 成功 |
| E8 | 观察流是否影响转发与取消传播 | 用本地确定性上游分别运行有/无观察器，比较响应字节、状态码、头及首 chunk 到达；慢速消费、取消、跨 UTF-8 分块和超限事件分别测试 | 响应字节一致，不等待 EOF 才输出，不积累完整历史；下游取消能终止上游读取，取消路径能结算 |
| E9 | 本地写入在目标环境是否可靠 | Windows 当前运行目录及一个 Linux 临时目录分别执行连续并发更新、覆盖 rename、重启、正常退出、强杀和写入失败实验 | 正常退出后数据恢复一致；强杀后正式文件仍可解析或按设计恢复；记录实际可能丢失窗口。单元测试通过不能代替 Windows 文件替换实测 |

### 10.1 最小取样矩阵

| 上游与协议 | 非流式 | 流式 | 附加场景 |
| --- | --- | --- | --- |
| Copilot Responses | 普通回答 | 普通回答、工具调用 | 支持的思考模型、输出截断 |
| DeepSeek Responses | 普通回答 | 普通回答、工具调用 | low/high/max 中实际支持的档位、重复前缀缓存 |

不支持的模式记录 HTTP 状态与错误类型，标为“不支持”，不为补齐矩阵增加新的代理路由。各模型可能有差异：至少覆盖当前实际使用的 Copilot、DeepSeek 模型，不声称一次取样验证了所有模型。重复前缀未命中缓存只能说明本次未观测到，不能证明没有缓存字段。

### 10.2 实验记录与落地规则

每项记录：日期、客户端/代理版本、provider、请求模型、响应模型、入口、是否流式、最小请求参数、脱敏的 usage 原文、事件路径/顺序、结论（已确认 / 未观测到 / 不支持 / 待确认）。只使用专门的短测试内容，不保存 Key、完整请求头或真实会话正文；session ID 用一致的替代标签表示以验证稳定性。

将真实脱敏样本整理为 parser 的 fixture，并据此修订第 4、5 节。合成 fixture 用于边界测试，须与真实样本区分。需要逐项核实：

- `total_tokens` 是否存在且等于 input + output；不相等时保留观测值并确认计量口径，不能悄悄改成相等。
- reasoning 是否已包含在 output、缓存是否已包含在 input；只有明确语义后才定义明细映射与总数计算。
- 流式 usage 的 null、中间零值和最终值如何区分；只依据已经证实的事件语义选择累计快照或增量算法。
- 缺失基础字段不能补零；可选字段未报告不能解释为零使用量。

E1 未通过时，聚合与持久化模块仍可用显式测试 session ID 开发，但不能宣称已支持 Codex 桌面任务自动归属。E2/E3 某个 provider 尚未确认时，该 provider 的 parser 不算完成；E4 的可选明细未确认不阻塞已验证的基础 token 统计。
