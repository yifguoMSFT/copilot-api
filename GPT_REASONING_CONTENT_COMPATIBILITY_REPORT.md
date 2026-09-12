# GPT reasoning content compatibility report

状态：本地实现、测试与构建产物验证完成。真实原任务在线续接未验证。

设计依据：[[GPT_REASONING_CONTENT_COMPATIBILITY_DESIGN.md]]。

## 1. 问题

任务先经 DeepSeek 再切回 GPT 时，请求在生成前被拒绝：`input[40].content` 必须为空，但实际包含 1 项。历史中的 reasoning 条目带有非空 `content`，GPT 接口不接受该形状；`40` 只是当次请求中的位置，不是稳定标识。切回 DeepSeek 时另报历史工具调用缺少 `call_id`，属于独立问题，本次不处理。

## 2. 改动

| 文件 | 变化 |
| --- | --- |
| `src/lib/runtime-config.ts` | copilot provider 新增 `stripReasoningContentForGpt`，内置默认 `true` |
| `src/routes/responses/gpt-reasoning-content.ts` | 新增纯函数 `stripReasoningContent`，按结构匹配并返回新数组、命中索引、丢弃元素数 |
| `src/routes/responses/handler.ts` | 别名解析后，对 provider 为 copilot、上游模型以 `gpt-` 开头且开关为 true 的请求清理 reasoning `content`；仅命中时输出一条结构日志 |
| `tests/gpt-reasoning-content.test.ts` | 纯函数边界用例 |
| `tests/gpt-reasoning-route.test.ts` | 出站字节级路由用例 |
| `tests/runtime-config.test.ts` | 默认开启与显式关闭的配置用例 |
| `config.example.json` | 示例显式写出该开关 |
| `README.md` | 说明默认行为、关闭方法、影响范围和离线验证命令 |
| `scripts/verify-dist-gpt-reasoning.ts` | 离线校验构建产物实际发送字节的可复现脚本 |

处理范围仅限 `input[i].type === "reasoning"` 且 `content` 为非空数组的条目，且只把 `content` 置为 `[]`。条目顺序、`id`、`summary`、`encrypted_content`、工具定义与工具调用、`call_id`、`previous_response_id`、`conversation` 以及所有其他字段均不改动。无命中时返回原始请求字节。DeepSeek 与非 `gpt-` 的 Copilot 模型不进入该分支。

关闭方式：在 `config.json` 的 copilot provider 中设置 `"stripReasoningContentForGpt": false`，重启代理。Codex 本地历史不被修改，关闭后即可恢复原样转发。

本提交只包含 GPT reasoning 兼容这一项功能。工作区中尚未提交的 DeepSeek 改动（`apiKey` 字段、catalog 解耦、namespace 工具透传等）按其原有状态保留，未纳入本次提交；因此本提交的 `src/lib/runtime-config.ts` 与 `src/routes/responses/handler.ts` 仍保留提交基线中的 DeepSeek 校验调用与 `apiKeyEnv` 字段。

## 3. 验证证据

验证对象是 `HEAD + 本功能` 的精确快照（即本次提交的树）：把索引导出到隔离目录后运行检查，结果如下。

- `tsc --noEmit`：退出码 0
- `eslint .`：退出码 0
- `bun test`：88 pass / 0 fail / 230 expect，13 个文件
- 其中 `tests/gpt-reasoning-content.test.ts` 11 pass、`tests/gpt-reasoning-route.test.ts` 5 pass

路由用例断言的是 `fetch` 实际收到的出站 body，而不是纯函数返回值：默认开启时 `input[40].content` 变为 `[]` 且 `id`/`summary`/相邻 message/顶层 `stream`、`store` 保留；显式关闭时出站字节与入站完全一致；DeepSeek 请求发往 `https://api.deepseek.com/responses` 且 reasoning content 原样；非 GPT 的 Copilot 模型字节一致；`codex-auto-review` 同时完成别名改写与清理。

同一快照执行 `bun run build` 后，用离线脚本验证构建产物（`dist/main.js`）。脚本 mock 全部网络依赖、把 `USERPROFILE` 与工作目录指向临时目录，并直接调用构建产物内部的 Responses 处理器，因此断言的是编译后代码实际发出的字节：

```
{"mode":"gpt","status":200,"actual":{"url":"https://api.githubcopilot.com/responses","cleared":true,"bytesUnchanged":false},"pass":true}
{"mode":"gpt-off","status":200,"actual":{"url":"https://api.githubcopilot.com/responses","cleared":false,"bytesUnchanged":true},"pass":true}
{"mode":"deepseek","status":200,"actual":{"url":"https://deepseek.invalid/responses","cleared":false,"bytesUnchanged":true},"pass":true}
```

三种模式退出码均为 0。复现命令：`bun run build` 后依次执行 `bun run scripts/verify-dist-gpt-reasoning.ts gpt`、`gpt-off`、`deepseek`。

当前工作区（额外含未提交的 DeepSeek 改动）在同一套测试下为 90 pass / 0 fail。两个数字的差额来自那些未提交改动新增的用例，不属于本功能。

## 4. 未验证与限制

- 未做真实在线续接：没有可用的失败请求样本，也没有获授权向外部服务发送该历史请求。因此“原任务的 `input[40].content` 错误已消失”尚未被上游证实，本报告不宣称恢复成功。
- mock 证明的是代理发出的字节符合设计，不证明上游一定接受清理后的 payload。
- 该开关只处理 reasoning 的非空 `content`。缺失 `call_id` 属于独立问题，未补造 ID。
- 如果失败条目实际不是 `reasoning`，本规则不会命中，需要按真实结构另行分析。
- `stripReasoningContentForGpt` 是进程级配置，对该代理所有匹配请求生效，不按任务或会话区分；启用期间 GPT 自己产生的历史 reasoning 若仍带非空 `content`，同样会被清空。

## 5. 回滚

设置 `"stripReasoningContentForGpt": false` 并重启代理即可恢复逐字节透传，无需还原 Codex 历史文件。若需完全回退代码，恢复本功能对应的提交即可；本地历史与会话不被本改动写入。
