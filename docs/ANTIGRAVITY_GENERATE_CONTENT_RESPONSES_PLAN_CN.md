# Antigravity GenerateContent SSE ↔ Responses 转换与接入计划

日期：2026-09-13。状态：待实现。本次仅制定计划，没有新增实现或宣称实测通过。

## 1. 方向与交付

根据用户额外渠道确认，本机 Antigravity 使用：

```text
POST https://daily-cloudcode-pa.googleapis.com/v1internal:streamGenerateContent?alt=sse
```

后续以这条已确认路径完成接入，不再把寻找 Antigravity 原生 Interactions 入口作为前置条件。既有 Interactions ↔ Responses 转换器保留，新增一个平行的 GenerateContent ↔ Responses 转换器，不经 Interactions 中转。本计划替代原发现计划的后续执行方向；旧 Kanban 的未通过实测不能标记成功。本次不修改旧看板运行状态。

交付只有两部分：纯协议转换器及测试；连接该转换器与现有鉴权代理的薄接入层及实测。范围为文本、思考/签名、工具调用与结果、SSE、usage、客户端历史续轮。不增加图片或多媒体生成、WebSocket、数据库、服务端会话仓库、模型路由系统。

## 2. 分层与现有代码边界

```text
Codex / Responses 客户端
  → 新增 Responses HTTP 接入层
    → 纯函数：Responses 请求 → GenerateContent 请求
    → 接入层包装 Cloud Code envelope
  → 现有 Antigravity 鉴权代理
  → daily-cloudcode-pa.googleapis.com/v1internal:streamGenerateContent?alt=sse
  → 现有代理原样返回 SSE
  → 接入层提取每帧 response
    → 纯转换器：GenerateContent 帧 → Responses 事件
  → Responses SSE 客户端
```

- 转换器只处理 JSON 与协议事件，显式接收本次请求需要的映射上下文；不得读取配置、环境、文件、凭据，不能登录、联网、选择 provider、识别模型品牌或维护跨请求状态。
- 接入层负责 HTTP、固定上游路径、Cloud Code 外层字段、模型与 project 参数、取消与背压。它调用转换器并请求现有本地鉴权代理；不复制登录和刷新实现。
- `src/services/antigravity/proxy.ts` 继续字节透传，不导入转换器，不解析 envelope。`auth.ts` 继续负责凭据。已有 `scripts/antigravity-proxy.ts login/serve` 可直接复用。
- 新增独立入口，不改当前 `src/routes/responses/handler.ts`、现有 provider 路由、Interactions 转换器或其他应用逻辑。若实际接入发现必须改既有代码，先写明具体原因及最小改动，不能顺带重构。

## 3. 最小转换接口与字段映射

建议新增 `src/services/generate-content/convert.ts` 与 `stream.ts`。请求入口接收 Responses JSON，返回 GenerateContent JSON 和本次工具身份映射。流入口接收已解析帧及显式的单次流状态，返回 Responses 事件；提供结束方法。名称与类型沿项目风格确定，不建立通用转换框架。

| Responses | GenerateContent | 规则 |
| --- | --- | --- |
| `instructions`、system/developer 内容 | `systemInstruction` | 保留内容顺序，不追加 agent 提示词 |
| user/assistant 消息 | `contents[].role`、`parts[].text` | assistant 对应 model；保留轮次及 part 顺序 |
| `tools` 中函数定义 | `tools[].functionDeclarations[]` | 转换名称、描述与参数 schema；命名空间需要可逆映射，不按工具名设白名单 |
| `function_call` / `function_call_output` | `functionCall` / `functionResponse` | 保留调用身份、参数与返回值；工具名从客户端本次历史中解析，不查服务端缓存 |
| 文本增量 | `candidates[].content.parts[].text` | 输出 Responses message/content/text 生命周期及增量 |
| reasoning 内容和可回传状态 | `thought`、`thoughtSignature` 等 | 可见内容与不透明签名分别处理，签名关联到原 part，不改写、裁剪或伪造 |
| 生成参数、工具选择、输出格式 | `generationConfig`、`toolConfig` | 只映射有协议依据的字段；不同枚举不能直接当成语义相同 |
| usage | `usageMetadata` | 分别映射 prompt、candidate、thought、cached 和 total 计数，避免重复累计；缺失值不伪造成缓存命中 |
| 结束/失败状态 | `finishReason`、`promptFeedback`、error | STOP、长度限制、内容拦截及错误分别映射；不能一律 completed |

仅校验转换必需的对象/字段类型、JSON/SSE 格式及调用关联。未知字段不触发顶层白名单拒绝；有明确无法表达的语义时给出具体协议转换错误，不能静默丢失后宣称等价。不同协议同名字段不盲目透传。无等价表示的数据及其保留方式须在映射测试中明确。

本轮以 `stream=true` 为主。`stream=false` 可复用同一流累积结果生成最终 Responses JSON，不另做一套非流式上游链路。未实现的 Responses 资源操作不伪装成受支持。

## 4. 状态：客户端持有，转换器只负责可逆传递

GenerateContent 的历史模式不能通过给 `response.id` 换名字变成服务端父资源续轮。客户端下一轮提交历史、工具结果及必要签名；代理不保存这些对象，也不为 `previous_response_id` 建表。

| 状态 | 所有者与传递方式 |
| --- | --- |
| 完整历史及工具结果 | 客户端持有并回传；转换器恢复 `contents` 顺序及工具调用关系 |
| thought signature / 原生不透明字段 | 客户端回传载体完整携带原值及所属 part；不得仅放在日志里而从响应中丢弃 |
| Responses response/item/call ID | 保证单次流内稳定、最终对象一致；保留上游已有 ID。缺少 ID 时由调用方提供确定的本次响应标识，不冒充服务端历史引用 |
| Cloud Code `request.sessionId` | 接入层从客户端明确的稳定会话标识取得，固定映射规则；不得每轮随机生成或声称它等于 Interaction ID |
| `requestId` | 接入层每次请求生成，与 sessionId 分开 |
| 缓存指标 | 只认上游显式计数；同 sessionId、历史续轮成功、耗时降低都不是 cache hit 证明 |

先检查 Codex 实際发送的会话 header/字段，再在接入层确定其到 sessionId 的映射。无稳定标识时如实记录缺失，不能靠内存会话表补齐。不要未经证据把 `prompt_cache_key` 等同于 Cloud Code sessionId。

必要的签名载体只保留无法由 Responses 正常字段重建的协议数据及精确关联，不套入整份请求/响应。优先验证 reasoning `encrypted_content` 等客户端实际回传的位置；自定义编码需要版本标识与无损恢复测试，不能冒称 OpenAI 原生密文。若 Codex 不回传载体，则状态保真验收失败，先调整载体，不能加代理数据库掩盖问题。

只有 `previous_response_id`、缺少恢复历史所需输入的请求，明确报告本接口不能仅凭该引用续轮；已有完整历史时不得丢弃历史或偷偷查询其他 provider。本次流内累积文本、工具参数、索引和 usage 是流式编码需要的短暂状态，结束即释放。

## 5. SSE 与 Cloud Code 接入

以现有 `scripts/antigravity-proxy-live-test.ts` 中真实 envelope 构造和留存响应为样本，核对 `project`、`model`、`request`、`requestId`、`requestType`、`userAgent`；其中 `request` 装转换后的 GenerateContent 请求，`sessionId` 由接入层注入。project 复用已验证的配置或 `loadCodeAssist` 获取方式，不新增配置文件套层。

Cloud Code SSE 的 `response` 外壳由接入层拆除后交给通用 Gemini 转换器。SDK 本地模拟接受未包裹帧的结果不能替代 Cloud Code 的真实帧证据。代理本身仍原样转发外壳。

SSE 解码须处理 UTF-8 跨块、半行、多行 data、CRLF、空行和心跳。转换器维护递增 sequence_number 和稳定 output_index/item ID，完成事件与累积 output 一致。先收到 finishReason 后仍可收到 usage，不能提前关闭而漏计。正常结束只发一次终态；异常 EOF、上游错误、取消不能伪造成成功。终止规则以真实上游帧确认，不凭空添加或要求 `[DONE]`。

接入层在尚未开始 Responses SSE 时转译 HTTP 错误；开始后输出协议失败或中止流，保留实际错误信息。客户端断开须取消上游，写入遵循背压。端点和鉴权不得出现在转换器里。

## 6. CLIProxyAPI 参考范围

已检查本地参考源码：

- `reference/CLIProxyAPI/internal/translator/gemini/openai/responses/gemini_openai-responses_request.go`、`gemini_openai-responses_response.go`：字段映射、事件顺序、工具与 usage，可作参考与测试用例来源。
- `reference/CLIProxyAPI/internal/translator/antigravity/openai/responses/antigravity_openai-responses_response.go`：先提取 `response` 再交给 Gemini 转换器，支持本计划的分层方式。
- `reference/CLIProxyAPI/internal/translator/antigravity/gemini/antigravity_gemini_request.go`：Cloud Code envelope 包装参考。
- `signature_carrier.go`、`trailing_signature.go` 及相关测试：参考签名关联和晚到签名场景，不能照搬 provider 检测、签名过滤、长度策略或丢弃行为。

Antigravity 请求转换里还包含按模型改写 Claude reasoning、自动开启 thinking summary 等应用策略，本方案不引入。参考实现是线索，不是规范或上游实测替代品；不整包移植其框架或依赖。

## 7. 实现顺序与验收

1. **固定样本与映射。** 从已有 Cloud Code 真实记录提取最小文本、工具、签名及结束/usage 帧；缺失场景明确补测。记录字段映射和错误规则，不继续猜 Interactions 路径。
2. **完成纯转换器。** 新增两个模块及 `tests/generate-content-conversion.test.ts`、`tests/generate-content-stream.test.ts`。该阶段只做协议与单元测试，不启动登录、HTTP 服务或 Codex。
3. **新增薄接入。** 建议 `scripts/antigravity-responses.ts` 暴露 `/v1/responses`，连接现有鉴权代理；另加集成测试，核对实际发送的 envelope、路径和流响应。共享逻辑确有复用需求时才提取模块。
4. **通过真实代理验收。** 使用现有登录入口和凭据，先发送最短原生 SSE 请求，再发送转换后的 Responses 请求，完成文本、历史续轮、工具循环、签名回传；完整保存两端请求、响应和事件时序到独立本地目录。
5. **Codex CLI 验收与报告。** 临时 provider/profile 指向新增入口，使用上游实际可用模型。验证文本、续轮、工具调用及下一轮真实回传的签名载体、sessionId。记录实际命令与结果，不通过禁用工具或丢弃状态伪造兼容。输出独立实现/实测报告。

| 测试组 | 必须证明 |
| --- | --- |
| 请求转换 | instructions、多轮文本、并行函数、工具结果、命名空间及实际 Codex 工具形态语义正确；不修改输入对象 |
| 签名回环 | 文本/思考/函数 part 的签名、晚到及独立签名经过输出→客户端回传→输入恢复后原值与关联一致 |
| SSE | 任意字节切分结果一致；事件 ID/索引稳定；文本与函数参数不重复；终态一次；尾部 usage 保留 |
| 错误 | 畸形 JSON、错误字段类型、无法关联工具结果、长度终止、拦截、上游错误和异常断流有明确结果 |
| 接入 | 同一原生样本经鉴权代理仍保留路径、query、body 和 SSE；转换仅发生在新增层；取消传播 |
| 多请求 | 两会话交错无状态串扰；同客户端会话映射稳定；无数据库、历史缓存或全局签名表 |
| 实测 | 本机 Antigravity endpoint 的真实成功证据；Codex 回传状态被直接验证；缓存单独按上游指标报告 |

运行相关 Bun 测试、构建及针对新增文件的 lint；既有代理测试须回归。记录预先存在的无关失败。mock 通过仅证明转换和接线，不代表 endpoint 或 Codex 通过。只有真实代理链路与 Codex 核心用例均成功，才关闭整体接入任务。

本地诊断记录完整保留请求、响应、协议状态与错误，不脱敏、不截断；文档引用原始记录目录，不把实际凭据写入源码或提交到仓库。
