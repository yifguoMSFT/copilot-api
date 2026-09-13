# Responses tool_search 历史兼容修复计划

## 目标与结论

修复 session `01a09a08-7c8a-7ef3-b408-7d6efd656053` 切换到 `gemini-3.8-flash-tiered` 后的 `Unsupported input: tool_search_call`。本次仅制定计划，不修改实现。

最大兼容应同时保留搜索历史的信息、搜索发现的工具定义，以及后续真实工具调用的关联。不能仅忽略两个 item，也不能把客户端工具搜索直接替换成 Google 搜索。采用无状态的请求内转换，不增加数据库、会话缓存、应用白名单或历史文件清洗。

## 已核对的现状

- `src/services/generate-content/convert.ts` 的 `applyItem()` 不识别 `tool_search_call`、`tool_search_output`，默认抛出错误。
- 该文件已有 `mergeAdditionalTools()`，会合并历史 `additional_tools.tools`，顶层声明优先，并按 namespace 子工具去重。`applyItem()` 已跳过这种声明项。
- `src/services/interactions/convert.ts` 的 `historyItem()` 同样拒绝上述搜索项；工具只取 `request.tools`，尚未合并 `additional_tools`。
- 两端已有 namespace 展平和工具身份映射，应沿用它们，保持返回调用的名称、namespace 和 custom 类型可恢复。
- 前序诊断从父会话找到了成对的 `tool_search_call` / `tool_search_output`，包含 `call_id`、`execution: client`、查询参数及 namespace 工具定义。这解释了历史重放为何触发错误。

尚未从失败请求正文确认：发现的全部工具是否已经重复出现在当前顶层 `tools`。修复不能依赖这个假设；测试必须覆盖已声明和仅存在于历史结果两种情况。当前工作区已有其他未提交修改，实施时仅调整本问题相关代码和测试。

## 转换方案

### 1. 先收集有效工具声明

在构建上游工具列表之前，扫描当前请求的顶层 `tools`、历史 `additional_tools.tools` 和 `tool_search_output.tools`。声明合并复用现有 namespace 与身份映射规则，不在代理入口另做一套转换。

同一工具按原始 namespace 和 name 确定身份，不能只比较裸名称。顶层声明优先；历史来源沿用当前合并规则，按输入顺序补充尚未声明的工具。多个历史定义冲突时的选择必须有测试，并在实现报告说明，不能声称恢复了客户端未提供的当前定义。普通函数与 custom 工具的 schema 和类型走各自现有转换。

Interactions 也需要这个合并步骤，并修正其仅在 `request.tools !== undefined` 时输出 `body.tools` 的条件：只有历史发现定义的请求也应产生上游工具声明。仅提取小型共享协议辅助函数（若确实能直接复用）；不建立插件注册表或工具管理框架。

### 2. 搜索历史保留为普通上下文

两个上游没有已确认可直接对应这些 Responses item 的协议项。默认把每个搜索 item 转为带明确类型标记的普通历史文本，其内容使用完整 JSON 序列化，保留 `id`、`call_id`、`status`、`execution`、`arguments`、`tools` 以及未知扩展字段。不要摘要、截断、脱敏或修改原始输入对象。

- `tool_search_call` 映射为模型侧普通文本历史。
- `tool_search_output` 映射为用户侧普通文本历史，其工具定义另外参与上述声明合并。
- 保持原有顺序；GenerateContent 按既有角色合并规则落入 `contents.parts`，Interactions 落入 `model_output` / `user_input` 文本块。
- 不把这两个 item 伪造成普通 `function_call` / `function_result`，不加入真实工具调用的 pending 集合，不制造或改写 `call_id`。

这会增加上下文长度，但保留完整信息符合本项目要求。JSON 中保留的原始字段只是模型可读历史，不等于上游原生工具搜索状态；本方案不宣称跨协议无损恢复搜索执行状态。客户端仍维护原始 Responses 历史，转换器不保存跨请求对象。

对与普通并行工具调用交错的搜索历史，要验证不会拆坏真实调用与结果的合法排列；如上游需要结果紧随调用，应沿用现有等待结果后释放文本的机制，不能额外创建会话状态。

### 3. 当前请求的 tool_search 声明

只修历史项仍可能紧接着在 `flattenTools()` 处因当前 `tools` 中的原生 `tool_search` 声明报错。先使用真实请求或本地协议定义确认其形状。

对于没有上游对应能力的原生发现声明，不把它伪造成无名称函数；从上游可执行函数声明中排除，并保留其他已发现工具。若 `tool_choice` 强制指定该发现工具，应返回明确的能力不支持错误，不静默改为 AUTO。

这一兼容方式允许使用请求内已有或已发现的工具，不能发现请求中根本不存在的工具。让 Gemini 新发起客户端工具搜索，需要验证 Codex 接收的调用/结果事件约定并增加双向映射；这是独立能力，不纳入本次历史报错修复，也不能在验收中暗示已支持。

### 4. 校验与状态边界

仅保留读取协议所需的结构校验：例如待转换的工具定义必须具备合法名称和 schema。无效结构给出具体字段和错误原因；不要将所有未知 item 一律跳过。

搜索 item 的扩展字段随完整 JSON 保留，不增加模型名、应用名、执行模式或工具名白名单。既有真实 `function_call` / output 的 `call_id`、namespace、签名载体、推理状态、continuation 引用和缓存字段沿用当前逻辑。本修复不能保证 Gemini 与其他供应商不兼容的私有状态突然变得互通。

## 实施顺序

1. 从现有会话证据提取不含账号凭据的最小协议 fixture：搜索调用、包含 namespace 的结果、随后真实函数调用及结果；补一份包含顶层工具声明的变体。不要改写用户 rollout。
2. 先添加复现测试，确认两个转换器当前在搜索历史处失败。
3. 扩展声明收集和搜索历史转换，并处理当前原生发现声明及强制选择的边界。
4. 为 Interactions 补齐 `additional_tools` 声明合并。保持两端行为一致，不调整其他路由、鉴权、登录或 provider 配置。
5. 运行相关测试、类型检查、lint 和构建；使用本地 fixture 重放两个转换入口。若要测试真实代理，走已有 Antigravity 路径并记录实际结果，不把本地转换通过写成上游调用成功。

## 测试与验收

| 场景 | 验收结果 |
| --- | --- |
| 真实搜索 call/output 历史 | 两端不再报 Unsupported input；查询、关联 ID、结果、扩展字段完整保留 |
| 工具仅在搜索结果中 | 上游产生可执行声明；身份映射可恢复 name、namespace 和 custom 类型 |
| 顶层、additional_tools、搜索结果重复 | 顶层定义优先；无重复函数；历史补全 namespace 子工具 |
| 不同 namespace 下同名工具 | 身份不冲突；函数参数与结果匹配原调用 |
| 搜索历史后接真实工具调用 | call_id 保持不变；真实函数调用和结果完整，搜索不产生悬空函数结果 |
| 搜索项与并行调用交错 | 合法工具分组得到保留；历史文本未丢失 |
| 空 tools、仅搜索调用、仅搜索输出 | 合法部分可转换；不要求人为补齐搜索配对，不增加应用层限制 |
| 当前声明包含原生 tool_search | 不作为无名函数发送；普通工具仍可使用；强制选择给出准确的不支持原因 |
| 畸形工具定义 | 指向具体结构错误，不能悄悄吞掉定义 |
| 状态回归 | 原调用 ID、签名载体、continuation 与缓存映射不因搜索转换改变 |
| 输入不变性 | 深冻结输入仍可转换；重复转换结果稳定；无跨请求状态 |
| 未知其他 item | 保持原有明确错误，不扩大为全类型静默忽略 |

首先运行 `bun test tests/generate-content-request.test.ts tests/interactions-convert.test.ts` 和新增的搜索兼容测试，再运行相关流式工具、身份和状态回归测试。按仓库要求执行 `bun run build`、类型检查和 lint；区分已有问题与本次引入的问题。

完成标准是：最小复现从失败变为通过，历史发现工具实际进入上游声明，真实调用关联及完整搜索信息保留，并有两个转换器的回归证据。仅消除一个异常、仅完成计划或仅跑通 mock 都不等于真实 session 上游验证成功。
