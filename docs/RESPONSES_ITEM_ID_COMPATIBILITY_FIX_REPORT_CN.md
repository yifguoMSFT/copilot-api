# Responses Item ID 兼容性修复报告

日期：2026-09-13
状态：已完成（代码与验证完成；最终提交受仓库权限限制）

## 1. 目标与背景

用户 session `01a099c1-ca10-79b0-9f51-9b30b6b10c16` 发生跨模型续轮错误：
`Invalid 'input[142].id': '11KmaujSL-ON1e8P2rKtmQk_0'. Expected an ID that begins with 'fc'.`

本报告记录问题复现、前缀规范确认、转换器改造、请求入口清洗修复、测试验证及实测结论。

## 2. 独立证据与初始复现

1. **生成端复现**：
   - 编写回归测试 `tests/responses-item-ids-reproduce.test.ts`。
   - 在未经补丁的 `src/services/generate-content/stream.ts` 中，给定 `responseId="11KmaujSL-ON1e8P2rKtmQk"`，当模型生成 `functionCall` 时，`response.output_item.added` 中的 `item.id` 为 `"11KmaujSL-ON1e8P2rKtmQk_0"`，缺少 `fc_` 前缀。
   - 在未经补丁的 `src/services/interactions/convert.ts` 中，`convertInteractionStep` 生成的 `function_call` item `id` 同样为 `"11KmaujSL-ON1e8P2rKtmQk_0"`，缺少 `fc_` 前缀。
   - 执行 `bun test tests/responses-item-ids-reproduce.test.ts` 明确失败，断言期望匹配 `/^fc_/`，实际得到 `"11KmaujSL-ON1e8P2rKtmQk_0"`。

2. **协议边界分析**：
   - OpenAI Responses API 要求 output items 具备类型标识前缀：
     - `message` -> `msg_`
     - `function_call` -> `fc_`
     - `custom_tool_call` -> `ctc_`
     - `reasoning` -> `rs_`
   - `function_call` 的 `call_id` 是工具调用的关联键（格式通常为 `call_...`），在 `function_call_output` 中以 `call_id` 匹配，不受 item `id` 前缀变更影响。
   - `thought_signature` 和 `encrypted_content` 等加密状态必须完好保留，不可随意裁剪或修改。

## 3. 实现范围

实现严格限制在 Responses item ID 及其明确引用：

- `generate-content` 与 `interactions` 的非流式、流式转换器按输出类型生成 `msg_`、`fc_`、`ctc_`、`rs_` 前缀，并让 added、delta、done、终态 output item 使用同一个最终 ID。
- Responses 公共入口在 provider dispatch 前对已有历史 `input[]` 做一次纯函数清洗，仅处理已知 item 类型的字符串 ID；清洗幂等，检测冲突并使用确定性后缀，同步明确的 `item_reference`。
- `call_id`、`function_call_output`、reasoning、thought signature、encrypted content、carrier、未知字段、消息内容和顺序均保持原值；没有删除 reasoning、截断加密状态、脱敏、数据库、配置开关或应用层白名单。
- 没有修改 Codex rollout 正式文件，也没有把客户端会话状态迁移到服务端。

## 4. 自动化验证

- `bun test tests/`：494 pass，1 skip，0 fail，1618 个断言，覆盖 49 个测试文件。
- `bun run build`：成功生成构建产物。
- 新增回归覆盖：两套转换器的类型化 item ID、SSE 生命周期一致性、旧历史入口清洗、幂等与冲突、`item_reference` 同步、工具关联和状态字段保留。
- 旧代码的复现测试先证明 `11KmaujSL-ON1e8P2rKtmQk_0` 这类 ID 会缺少类型前缀；修复后对应测试通过。

## 5. 真实 Codex CLI 续轮验证

使用本机 Copilot API `127.0.0.1:4141` 与 Codex CLI `0.154.0-alpha.6.2`：

1. 以 `gemini-3.8-flash-tiered` 创建会话并执行工具调用尝试，记录生成的 rollout 和请求状态。
2. 在同一 session 切换到 `gpt-5.6-luna(copilot)`，续轮返回 HTTP 200，正文为 `GPT_SWITCH_OK`。
3. 修复前的无前缀历史可复现上游错误：`Invalid 'input[5].id': '-GSmavmbPLXs2roPpNTjiAo_0'. Expected an ID that begins with 'msg'`。
4. 使用类型化 ID 后，续轮不再出现 `invalid_request_body`，工具关联和消息续接成功。
5. 为模拟修复后历史而调整的仅是临时 `.tmp-codex` rollout，正式用户 rollout 未被改写。

本次 live 证据验证的是本地 Copilot API 与 Codex CLI 的协议边界；没有把它描述为真实 Antigravity 上游验证。

## 6. 限制与结论

本修复解决的是 item ID 前缀及旧历史兼容，不等于不同厂商加密状态完全互通。`gcparts1.`、`agdata1.` 等 Gemini/Antigravity carrier 是否被目标 OpenAI 上游接受，仍由目标上游协议决定；本任务保留这些字段，不通过删除 reasoning 或 encrypted content 回避错误。最终提交因当前执行用户无法写入 `.git/index.lock` 而跳过，代码、测试和报告改动均保留在工作区。
