# GPT reasoning content compatibility report

状态：实现、测试与构建产物验证完成。真实原任务在线续接未验证。

设计依据：[[GPT_REASONING_CONTENT_COMPATIBILITY_DESIGN.md]]。

## 1. 问题

任务先经 DeepSeek 再切回 GPT 时，请求在生成前被拒绝，先后出现两个错误：

1. `input[40].content` 必须为空，但实际包含 1 项。
2. 清空 `content` 之后出现 `The encrypted content ... could not be verified. Reason: Encrypted content could not be decrypted or parsed.`

两者是同一原因的两半：历史 reasoning 条目带有其他 provider 产生的载荷，GPT 既要求 `content` 为空，也无法解密验证别人的 `encrypted_content`。`40` 只是当次请求中的位置，不是稳定标识。切回 DeepSeek 时报的缺少 `call_id` 属于独立问题，本次不处理。

## 2. 改动

| 文件 | 变化 |
| --- | --- |
| `src/lib/runtime-config.ts` | copilot provider 新增 `stripReasoningContentForGpt`，内置默认 `true` |
| `src/routes/responses/gpt-reasoning-content.ts` | 纯函数 `stripReasoningContent`：把匹配条目的 `content` 置为 `[]`，并删除其 `encrypted_content`；返回命中索引、丢弃的 content 元素数和删除的密文数 |
| `src/routes/responses/handler.ts` | 别名解析后，对 provider 为 copilot、上游模型以 `gpt-` 开头且开关为 true 的请求执行清理；仅命中时输出一条结构日志 |
| `tests/gpt-reasoning-content.test.ts` | 纯函数边界用例 |
| `tests/gpt-reasoning-route.test.ts` | 出站字节级路由用例 |
| `tests/runtime-config.test.ts` | 默认开启与显式关闭的配置用例 |
| `config.example.json` | 示例显式写出该开关 |
| `README.md` | 说明默认行为、关闭方法、影响范围和离线验证命令 |
| `scripts/verify-dist-gpt-reasoning.ts` | 离线校验构建产物实际发送字节的可复现脚本 |

处理范围仅限 `input[i].type === "reasoning"` 且 `content` 为非空数组的条目。对这类条目：`content` 变为 `[]`，`encrypted_content` 被删除，`id`、`summary` 与所有其他字段保留，条目顺序不变。

`content` 本就为空的 reasoning 条目不处理，其 `encrypted_content` 原样保留。这样 GPT 自身产生的加密推理仍能回传并保持连续性，只有已判定需要清理的条目才会丢掉密文。无任何命中时按原始请求字节转发；DeepSeek 与非 `gpt-` 的 Copilot 模型不进入该分支。

关闭方式：在 `config.json` 的 copilot provider 中设置 `"stripReasoningContentForGpt": false`，重启代理。Codex 本地历史不被修改，关闭后即可恢复原样转发。

## 3. 验证证据

当前实现的工作区结果：

- `tsc --noEmit`：退出码 0
- `eslint .`：退出码 0
- `bun test`：92 pass / 0 fail / 265 expect，13 个文件
- 其中 `tests/gpt-reasoning-content.test.ts` 13 pass、`tests/gpt-reasoning-route.test.ts` 5 pass

路由用例断言的是 `fetch` 实际收到的出站 body，而不是纯函数返回值：默认开启时 `input[40]` 的 `content` 变为 `[]` 且 `encrypted_content` 被移除，`id`、`summary`、相邻 message 与顶层 `stream`、`store` 保留；显式关闭时出站字节与入站完全一致，密文原样保留；DeepSeek 请求发往 `https://api.deepseek.com/responses` 且字节一致；非 GPT 的 Copilot 模型字节一致；`codex-auto-review` 同时完成别名改写与清理。纯函数用例另覆盖：本就为空的 content 连同其密文保持不动、有条目没有密文时计数为 0、不修改调用方数组、重复执行幂等。

`bun run build` 后用 `scripts/verify-dist-gpt-reasoning.ts` 直接驱动构建产物（脚本 mock 全部网络依赖、把 `USERPROFILE` 与工作目录指向临时目录，并调用 `dist/main.js` 内部的 Responses 处理器）：

```
{"mode":"gpt","status":200,"actual":{"url":"https://api.githubcopilot.com/responses","cleared":true,"encryptedRemoved":true,"bytesUnchanged":false},"pass":true}
{"mode":"gpt-off","status":200,"actual":{"url":"https://api.githubcopilot.com/responses","cleared":false,"encryptedRemoved":false,"bytesUnchanged":true},"pass":true}
{"mode":"deepseek","status":200,"actual":{"url":"https://deepseek.invalid/responses","cleared":false,"encryptedRemoved":false,"bytesUnchanged":true},"pass":true}
```

三种模式退出码均为 0，证明的是编译后代码的行为。复现命令：`bun run build` 后依次执行 `bun run scripts/verify-dist-gpt-reasoning.ts gpt`、`gpt-off`、`deepseek`。

## 4. 未验证与限制

- 未做真实在线续接：没有可用的失败请求样本，也没有获授权向外部服务重放该历史请求。因此“原任务的这两个错误已消失”尚未被上游证实，本报告不宣称恢复成功。
- mock 证明的是代理发出的字节符合设计，不证明上游一定接受清理后的 payload。
- 缺失 `call_id` 是独立的工具历史完整性问题，未补造 ID。
- 如果失败条目实际不是 reasoning，本规则不会命中，需要按真实结构另行分析。
- `content` 为空的 reasoning 条目不在处理范围内。若这类条目仍因密文被上游拒绝，需要新的证据与设计。
- `stripReasoningContentForGpt` 是进程级配置，对该代理所有匹配请求生效，不按任务或会话区分。

## 5. 回滚

设置 `"stripReasoningContentForGpt": false` 并重启代理即可恢复逐字节透传，无需还原 Codex 历史文件。若需完全回退代码，恢复对应提交即可；本地历史与会话不被本改动写入。
