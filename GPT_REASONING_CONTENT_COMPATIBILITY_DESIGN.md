# GPT 混用历史 reasoning content 兼容方案

状态：设计，尚未实现。按用户要求，实现后默认开启，可手动关闭。

## 1. 问题与证据边界

用户报告：混用 DeepSeek 后切回 GPT，请求在生成前被拒绝，错误指向 `input[40].content`，要求为空但实际有 1 项。重试复现；切回 DeepSeek 又出现缺少 `call_id` 的另一项错误。

当前推测是历史 reasoning 条目的非空 `content` 与目标 GPT 接口不兼容。尚未取得失败请求的结构化样本，不能只凭字段路径认定 `input[40]` 一定是 reasoning。实施验证前应确认该项的 `type` 和 content 类型；只记录结构，不输出历史正文。

`40` 是本次请求中的数组位置，不是固定标识。历史压缩、追加消息后位置会变化，不能硬编码删除第 41 项。

## 2. 行为约定

增加一个默认开启、可由用户手动关闭的配置项（省略该字段或没有配置文件时同样开启）：

```json
{
  "version": 1,
  "defaults": {
    "providers": {
      "copilot": {
        "enabled": true,
        "stripReasoningContentForGpt": true
      }
    }
  }
}
```

以上是最小配置示例；实际使用时只把该字段合并到已有 copilot 对象，保留 DeepSeek 等其他配置。当前代码的严格 schema 尚不接受该字段，需实现后才能添加。

沿用现有 defaults / environments 配置合并规则；不增加环境变量、请求头、CLI 参数或逐次确认。修改后重启代理生效。开关对该代理进程所有匹配的请求有效，不按 Codex 任务区分。

仅同时满足以下条件时处理：

1. 开关为 true（默认值）；显式设为 false 时不处理。
2. 路由解析后的 provider 是 `copilot`。
3. 别名解析后的上游模型名以 `gpt-` 开头。
4. 请求的 `input` 是数组。
5. 某个 input 元素是对象，`type === "reasoning"`，且 `content` 是长度大于 0 的数组。

将所有符合条件的条目的 `content` 替换为 `[]`。选择清空数组而非删除整个 item，使数组顺序和 item 标识保持原样；也不把 content 改为 null。是否被目标接口接受，必须用真实失败请求验证。

本规则按结构匹配，不声称可以识别某条 reasoning 来自 DeepSeek。启用期间，GPT 自己产生但符合条件的历史 reasoning 也会清空 content。这是默认开启的明确作用范围；需要完整透传时显式设为 false。

## 3. 修改示例

下面只展示实际失败条目在确认 type 后的局部变化：

```json
{
  "type": "reasoning",
  "id": "reasoning-item-id",
  "summary": [],
  "content": [{ "type": "reasoning_text", "text": "示例历史内容" }]
}
```

转发时改为：

```json
{
  "type": "reasoning",
  "id": "reasoning-item-id",
  "summary": [],
  "content": []
}
```

只丢弃出站请求中该字段的数组内容。保留 `id`、`summary`、`encrypted_content` 以及所有其他字段；不修改磁盘上的 Codex 历史、不改模型输出、不删除整个 reasoning item。

普通 message 的 content、工具定义、namespace、工具调用及结果、`call_id`、`previous_response_id` 和 `conversation` 均维持现有透传行为。字符串形式的 input、空 content、缺失 content 或非数组 content 不处理。

## 4. 接入当前代码

### 配置

在 `src/lib/runtime-config.ts` 的 Copilot schema 与 RuntimeConfig 类型中加入 `stripReasoningContentForGpt`，内置默认值为 true。DeepSeek schema 不变。同步 handler 的 legacy fallback 为 true、测试 fixture 和配置示例。配置合并必须保留显式 false，不能用逻辑或回退为 true。

### 请求处理

在 `src/routes/responses/handler.ts` 的 `resolveResponseModel` 中，完成 `resolveModelRoute` 后、当前“上游模型名未改变则直接返回原 body”的分支之前执行清理。

建议把内容变换放在 `src/routes/responses/gpt-reasoning-content.ts` 的纯函数中：接收 input，返回 input、变更索引和丢弃的 content 元素数量；不发网络请求，不读写配置或会话文件，不原地修改传入对象。

处理顺序：

```text
解析 JSON → 解析 provider 和上游模型 → 检查手动开关及 GPT 路由
         → 清空匹配的 reasoning.content → 与模型别名改写合并序列化
         → 使用既有 Copilot transport 发送
```

当既没有内容变化也没有模型别名变化时，保留原 ArrayBuffer，确保请求字节不变。有变化时只 JSON.stringify 一次；除所列字段外，其他字段保持 JSON 语义一致。现有取消、限流、审批、响应转发与 SSE 处理不改动。

### 可观测性

只在发生清理时记录一条结构日志，例如：

```text
GPT reasoning content stripped: model=gpt-5.6-luna indices=[40] items=1 contentParts=1
```

不记录 content 正文、API Key 或整份请求。日志表示代理做了变换，不表示历史续接已修复。发生失败时仍原样返回上游错误；不自动切换模型、不自动删除更多内容、不自动重试。

## 5. 验证与验收

单元与路由测试应覆盖：

| 场景 | 预期 |
| --- | --- |
| 显式关闭，GPT 请求包含非空 reasoning content | 原请求字节不变 |
| 字段省略、无配置文件或 handler legacy fallback，GPT 请求有匹配项 | 默认执行清理 |
| 开启，Copilot GPT，reasoning 位于索引 40 | 仅该项 content 变为 [] |
| 开启，多个索引含非空 reasoning content | 清空所有匹配项，顺序、id 和其他字段不变 |
| 开启，普通 message / tool item 含 content | 保持原样 |
| 开启，input 为字符串或 content 缺失、空、非数组 | 保持原样 |
| 开启，DeepSeek 或 Copilot 非 GPT 模型 | 原请求字节不变 |
| `codex-auto-review` 别名解析为 GPT | 同时完成既有别名改写和清理 |
| 相同 payload 重复执行清理 | 第二次不发生变化，函数不修改原对象 |
| 上游返回 400 或流式响应 | 保持既有状态码、响应体和流式转发行为 |

实现后执行相关 Bun 测试、TypeScript、ESLint 和 build，并确认实际启动的 dist 包含变更，避免再次运行旧构建。

真实验收：确认失败项为 reasoning → 确认默认开关生效 → 重启代理 → 在原失败任务中续接一次 → 确认清理日志命中，且不再出现原 `input[n].content` 错误。只有上游实际开始生成才能说明本轮续接通过；mock 测试不能替代这一验证。若原任务或请求样本不可用，记录在线验收未完成，不得宣称已恢复原任务。

## 6. 限制与回滚

此方案只处理 reasoning.content 非空这一类问题。缺失 `call_id` 是独立的工具历史完整性问题；不猜测或补造 ID，也不承诺单靠本开关修复所有混用历史。

如果目标项不是 reasoning，则此规则不会修改它，需要根据实际类型另行分析。保留的 encrypted_content、summary 等字段若仍被上游拒绝，也应独立诊断，不扩大本次丢弃范围。

清空 content 会让目标 GPT 看不到这些历史推理内容，但用户消息和工具记录仍保留。关闭配置项并重启代理即可恢复原样转发，无需还原 Codex 历史文件。
