# DeepSeek 工具 schema 根类型兼容修正计划

## 结论

Session `01a0c8c3-b988-7f71-94c7-67d1ba01e8bf` 的错误发生在工具定义校验阶段，不是 automation_update 执行失败，也不是工具名或 call_id 问题。现有证据显示：客户端提供的参数 schema 根节点没有 `type`，采用 `oneOf + $defs` 表达对象联合；DeepSeek 路径的上游要求显式根 `type: "object"`。

优先修正为：在 DeepSeek 请求兼容边界，对函数参数 schema 缺失的根类型补 `type: "object"`，完整保留原有联合结构与引用。不要删除工具、合并分支属性、清空 parameters、改工具名或放宽所有嵌套校验。本次仅制定方案，未修改代码或运行上游验证。

## 会话与实现证据

来源：`C:/Users/Jeff/.codex/sessions/2026/09/22/rollout-2026-09-22T19-57-45-01a0c8c3-b988-7f71-94c7-67d1ba01e8bf.jsonl`。

- 2026-09-22 15:36:28 UTC，`tool_search_output` 返回 `codex_app` namespace 内的 `automation_update`。搜索调用 ID 为 `call_00_mKPBgtysvRMbptkPtVev7739`，`execution: client`。
- 该函数 `strict: false`、`defer_loading: true`。parameters 根键为 `oneOf`、`$defs`，不存在 `type` 字段。
- 根 oneOf 引用 `__schema0`、`__schema3`、`__schema21`、`__schema24`。它们对应 view、create、update、delete；中间联合继续展开后均为 `type: "object"` 的分支。
- schema 内部合法存在 `{"type":"null"}`，用于 notificationPolicy、projectId 等可空字段。这些不是错误根源，不能递归删除或替换。
- 15:36:30.773 UTC 的 `task_complete.error` 记录模型 `deepseek-v4.1-flash`，错误为 `Invalid schema for function 'codex_app::automation_update': schema must be a JSON Schema of 'type: "object"', got 'type: null'.`。
- `src/routes/responses/handler.ts` 的 `resolveResponseModel()` 处理路由及历史兼容，没有函数参数根类型补齐；DeepSeek 分支调用 `src/services/deepseek/create-responses.ts`，后者直接将 body 交给 fetch。

因此，错误里的 null 不能解读为客户端明确发送 `type: null`；会话中的实际定义是缺失 type。根类型声明对这份纯对象联合属于冗余约束，补齐不会改变其有效对象集合。

证据边界：rollout 是客户端会话记录，不是本次 HTTP 出站正文。尚未确认失败请求将动态工具放在顶层 tools、历史 tool_search_output.tools，还是两处都有；也不能仅凭错误确定 OpenCode/DeepSeek 链路中具体哪个服务进行了校验。补齐后上游是否继续接受 oneOf/$defs，必须实测，当前不能承诺已解决。

## 最小实现方案

1. 新增小型纯函数，例如 `src/routes/responses/normalize-function-schema-root.ts`，处理解析后的 Responses payload；无网络、无状态、无工具名称白名单。
2. 仅遍历协议定义中的工具位置：顶层 `tools`、`input` 中 `tool_search_output.tools` 和 `additional_tools.tools`，以及这些工具列表内 namespace 的子 `tools`。不要递归遍历任意 JSON，避免修改 arguments、output 文本或业务数据中的同名字段。
3. 仅针对 `type: "function"` 且 parameters 为 JSON 对象、未声明根 type 的定义，以浅复制补入 `type: "object"`。这是函数参数要求为对象的边界约束，不是从属性名猜类型。
4. 显式 `type: "object"` 保持原样；显式其他类型（包括 null、字符串、数组）、缺失 parameters、parameters 为 null/boolean 等不在此次自动修复范围，保留上游错误。不能把坏 schema 偷换成无约束对象。
5. 不改 `oneOf`、`anyOf`、`allOf`、`$defs`、`$ref`、required、additionalProperties、strict、defer_loading、工具名称和 namespace。无需解引用或实现通用 JSON Schema 编译器。
6. 在 `resolveResponseModel()` 已解析 JSON、已确定 `route.provider === "deepseek"` 后调用，接入现有 changed/序列化流程；避免再次解析 body。保持其他 provider 行为不变，直到有其失败证据。
7. 函数应幂等、不修改传入对象。无变化时复用原对象；不增加配置开关、持久化或重试框架。保留现有 session headers 与历史回放行为。

## 实现与测试步骤

### A. 固定真实回归样本

从上述 tool_search_output 提取完整 automation_update 定义到测试 fixture，保留全部参数 schema，而不是手写只有一个分支的近似版本。保留 namespace 外壳，记录来源与时间；不需要复制整份会话。

### B. 单元测试

- 真实 fixture：根 type 补齐，移除新增 type 后与原 schema 深度相等，原对象未修改。
- 顶层 function、namespace 子函数、仅出现在 tool_search_output / additional_tools 的定义均覆盖；同一定义出现多处时每处保持一致。
- 已有对象根不改；显式非对象根、null parameters、缺失 parameters 不改。
- 嵌套可空字段、引用、联合、分支 required 与 additionalProperties 原样保留。
- 非 function 工具及 arguments/output 内伪装成工具的业务对象不改。
- 重复执行结果一致；工具名称、call_id、input 顺序、推理设置与模型字段不变。

### C. 路由回归

mock fetch 检查实际发给 DeepSeek 的 body：真实 schema 有根 object 且联合结构完整。覆盖动态发现后下一轮请求，以及顶层与历史同时存在的情况。其他 provider 不受影响。

运行新增 schema 测试以及 `tests/deepseek-responses.test.ts`、`tests/responses-route.test.ts`、`tests/strip-rejected-tool-calls.test.ts` 和 `tests/responses-unsupported-call-history-reproduce.test.ts`，再检查变更文件 lint 和 `bun run build`。

### D. 真实上游与 Codex 验收

使用现有本地配置、现有 DeepSeek 模型和 session header。先重建并重启非 watch 的 copilot-api 实例，确认使用新代码。

1. 使用完整真实函数 schema 发出普通请求，验证不再出现根类型错误；保留实际出站工具定义、HTTP 状态与响应证据。
2. 用无副作用的测试工具承载相同联合参数结构，采用 `tool_choice: auto`，验证模型生成符合其中一个分支的参数，并能接续 function_call_output。不要为测试创建或修改真实 automation。
3. Codex CLI 经 copilot-api 验证动态工具发现与后续请求；同时执行一个无副作用 shell 调用及结果回放，确认工具能力未回归。
4. 不以 mock 通过、构建通过或单次 HTTP 200 代替完整工具回合成功。若根错误消失但出现 oneOf/$defs 不支持，记录新错误，保持验收未完成，依据实际限制另拟最小方案；不要提前压平 schema 或丢掉分支约束。

## 完成标准

真实联合 schema 可被该上游接受；工具调用参数与结果回放成功；动态声明和已有 namespace 身份完整保留；相关回归与构建通过。没有真实上游成功证据时，只能标记实现完成、在线验收待完成，不能将整个修复标记成功。
