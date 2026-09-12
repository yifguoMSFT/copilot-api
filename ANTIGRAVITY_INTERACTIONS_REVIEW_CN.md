# Responses ↔ Interactions 转换器审核修正范围

本文件是当前修正要求，替换此前包含桥接和真实 CLI 联调的建议。详细契约见 [双向转换器设计](ANTIGRAVITY_RESPONSES_INTERACTIONS_IMPLEMENTATION_TEST_DESIGN_CN.md)。

## 必要修正

1. 累计 usage：读取 step.delta.metadata.total_usage 和 step.stop.usage，保留最近累计值，终态显式统计覆盖。不累加，不使用单步 step_usage。测试覆盖缺失、零、缓存和覆盖顺序。
2. 错误：JSON resource.errors 与 SSE error 分别解析；有效诊断映射到 Responses error，空诊断明确回退。
3. 父引用工具结果：保留 call_id/output；previous_response_id 模式下允许省略可选 name。完整历史仍校验调用关联，不建立跨请求状态。
4. JSON/SSE 一致性：相同内容的 completed、failed、incomplete/cancelled、部分输出及 usage 保持一致，不伪造结束原因。
5. 离线往返：文本、function/custom 文本工具、客户端携带的 thought/signature、ID 和 metadata 在全新实例中正确转换；测试输入不变和交错流隔离。

## 约束与完成标准

只修正两个方向的转换模块及对应离线测试。未知字段或无法等价映射的约束明确拒绝；没有已确认协议缺陷时不扩展支持范围，不添加通用兼容框架。

不制作或验证 bridge，不抓取 Codex 请求，不配置 provider，不读取 key，不调用 CLI 或真实 endpoint。无需任何联调前置审批。真实客户端接受性与实际缓存命中不属于本任务验收。

当前实现中如存在此前本轮新增的桥接脚本及其配置示例，在执行范围清理任务时仅核对并移除这些越界产物，不删除其他用户文件。测试报告只记录转换器的实际离线检查结果和有限支持范围。

完成条件：上述回归通过、typecheck 和定向 lint 通过、转换模块没有网络或持久化依赖、变更范围只包含转换器/对应测试/必要文档。随后按看板提交该范围内改动。
