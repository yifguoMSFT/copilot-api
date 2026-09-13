# Antigravity GenerateContent ↔ Responses 转换器与代理接入实测报告

日期：2026-09-13。对应看板：[[antigravity-generate-content-responses.kanban.json]]。
上游方案：[[docs/ANTIGRAVITY_GENERATE_CONTENT_RESPONSES_PLAN_CN.md]]。

## 1. 概述与结论

本项目在不改动既有 `copilot-api` 路由系统及鉴权代理代码的前提下，按照 **Simplicity-First** 原则实现了独立的双向协议转换器与薄接入层：

1. **协议转换器**：
   - `src/services/generate-content/convert.ts`：Responses 请求转换为 Gemini `streamGenerateContent` 载荷（角色、文本、工具声明、`toolConfig`、生成参数），并提供基于 `encrypted_content` 的状态载体实现；
   - `src/services/generate-content/stream.ts`：Gemini GenerateContent SSE 流（含 Cloud Code 包装）转换为 Responses 标准 SSE 生命周期事件，还原增量文本、函数调用、思考签名与使用量。
2. **薄接入层**：
   - `scripts/antigravity-responses.ts`：在 loopback 提供标准 `/v1/responses` 端点，负责组装/剥离 Cloud Code envelope（`model`, `project`, `requestId`, `requestType`, `userAgent`），并将请求转发至现有 Antigravity 鉴权代理（`scripts/antigravity-proxy.ts`）。
3. **真实端点验收**：
   - 使用本地真实 Antigravity 凭据及经确认的官方端点 `https://daily-cloudcode-pa.googleapis.com/v1internal:streamGenerateContent?alt=sse`，完成流式对话、携带签名的上下文续轮，以及工具调用（Function Calling）的三轮实测验证，全部成功。

## 2. 状态所有权与状态载体设计

根据上游协议事实，Gemini 原生服务端不维持会话对象（无服务端历史缓存）。状态的连续性完全由客户端通过轮次历史维护。

| 状态类型 | 所有者与传输方式 | 验证结果 |
| --- | --- | --- |
| 会话历史与多轮内容 | 由客户端在每一轮回传完整 `contents` | 实测验证通过 |
| 上游思考签名 (`thoughtSignature`) | 由转换器编码入 Responses `reasoning` 块的 `encrypted_content`（`gcparts1.<base64url>`），下一轮客户端回传时无损恢复至 `model` 角色对应的 part 中 | 实测验证通过，成功回忆随机会话标记 |
| 工具调用与其结果 | 工具调用映射为 `functionCall`，结果映射为 `functionResponse`，通过客户端历史按序回传 | 实测验证通过 |
| 会话标识 (`sessionId`) | 由客户端传递（或在请求头 `x-session-id` 中指定），接入层注入 envelope 的 `request.sessionId` | 实测跨轮次保持一致 |

## 3. 测试与验证结果

### 3.1 单元与集成测试

所有测试均在本地 Bun 环境下运行并通过：

- **`tests/generate-content-request.test.ts`** (16 tests, 49 assertions)：
  - 验证多轮对话转换、不改变输入对象、不输出 envelope 级别属性；
  - 验证函数定义、命名空间扁平化与还原、自定义工具映射；
  - 验证 `toolConfig.functionCallingConfig` 映射；
  - 验证对不受支持参数（如 `parallel_tool_calls: false`, `previous_response_id`）的明确拒绝。
- **`tests/generate-content-stream.test.ts`** (8 tests, 46 assertions)：
  - 验证基于真实抓包文件 `stream-text.sse` 的逐帧与任意字节切分还原；
  - 验证流式文本增量、函数调用参数拼接、自定义工具调用事件；
  - 验证 `finishReason` 与 `response.completed` / `response.incomplete` 映射；
  - 验证使用量（`usageMetadata`）算术与转换。
- **`tests/antigravity-responses-adapter.test.ts`** (3 tests, 22 assertions)：
  - 验证 Cloud Code envelope 组装；
  - 验证 Responses POST 请求打通 mock 代理并返回 Responses SSE 流；
  - 验证无效输入与转换错误的 400 响应。
- **`tests/antigravity-proxy-generate-content-preservation.test.ts`** (1 test, 9 assertions)：
  - 验证现有 Antigravity 代理对 GenerateContent 请求体及 SSE 响应的字节级透明转发。

全量自动化测试汇总：**31 pass, 0 fail, 148 expect() calls**。

### 3.2 真实官方端点实测 (Live Integration Test)

- **执行脚本**：`scripts/antigravity-responses-live-test.ts`
- **上游目标**：`https://daily-cloudcode-pa.googleapis.com`
- **模型**：`gemini-3.8-flash-medium`
- **测试批次证据目录**：`%TEMP%\antigravity-responses-live\2026-09-13T03-55-41-667Z_64286694`
- **步骤与证据**：

| 步骤 ID | 目标 | 结果 | 观察证据 |
| --- | --- | --- | --- |
| `turn.text` | 验证首轮文本生成与签名提取 | **PASS** | 响应状态 200，模型回复 "OK"；成功捕获并编码 `thoughtSignature` 至 `reasoning` 项中 (`step1-text.sse.txt`) |
| `turn.continuation` | 验证包含状态载体的历史续轮回忆能力 | **PASS** | 客户端回传第一轮模型输出（含 `gcparts1...`），模型准确回忆随机会话标记 `8a86a4c8` (`step2-continuation.sse.txt`) |
| `turn.function_call` | 验证模型能够正确触发工具调用并返回参数 | **PASS** | 触发 `get_weather` 函数调用，准确提取参数 `{"location":"Tokyo"}` (`step3-tool.sse.txt`) |

## 4. 遗留事项与已知边界

1. **缓存指标**：官方端点响应中当前未观察到 `cachedContentTokenCount` 字段，因此报告中不提供缓存命中统计，未凭空伪造。
2. **多媒体与图片**：当前方案专注于代码与文本交互，未引入多媒体生成逻辑。
3. **架构解耦**：所有转换逻辑置于 `src/services/generate-content/`，不修改现有 `copilot-api` 路由代码。
