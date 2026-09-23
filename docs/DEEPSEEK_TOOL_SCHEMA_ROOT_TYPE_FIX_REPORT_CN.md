# DeepSeek 工具 schema 根类型兼容修正报告

对应计划：[[DEEPSEEK_TOOL_SCHEMA_ROOT_TYPE_FIX_PLAN_CN.md]]。本报告随任务推进更新；未完成的上游实测项保持显式未完成。

## 问题

Session `01a0c8c3-b988-7f71-94c7-67d1ba01e8bf` 在 `deepseek-v4.1-flash` 上失败：

```
Invalid schema for function 'codex_app::automation_update':
schema must be a JSON Schema of 'type: "object"', got 'type: null'.
```

真实原因不是客户端发送了 `type: null`，而是该函数参数 schema 用 `oneOf + $defs` 表达对象联合，根节点没有声明 `type`。上游按“函数参数必须是对象 schema”的要求读取根类型，缺失即被判定为无效。

## 改动

新增 `src/routes/responses/normalize-function-schema-roots.ts`：

- 仅在 `type: "function"` 且 `parameters` 是 JSON 对象、未声明根 `type` 时，浅复制补入 `type: "object"`。
- 工具声明只从协议定义的位置读取：顶层 `tools`，以及 `input` 中 `additional_tools` / `tool_search_output` 携带的 `tools`；`namespace` 子工具递归同样处理。
- 不修改 `oneOf`、`anyOf`、`allOf`、`$defs`、`$ref`、`required`、`additionalProperties`、`strict`、`defer_loading`、工具名、namespace 和输入顺序。
- 显式非对象根、缺失或非对象的 `parameters` 不动，保留上游原本的错误。
- 纯函数、无状态、无工具白名单、无配置开关；无变化时复用原对象。

`src/routes/responses/handler.ts` 在 `resolveResponseModel()` 已解析请求体、且路由到 `deepseek` 后调用该函数，沿用既有 `changed` 序列化流程。其他 provider 的行为未改。

## 状态

- 实现：完成。
- 单元与路由回归测试：完成并通过。
- 真实上游与 Codex CLI 工具回放验证：完成（见下）。
- 未提交；提交由看板的最终任务执行。

## 真实上游与 Codex CLI 验收

时间 2026-09-23。被测实例为 `bun dist/main.js start --port 4141`（非 watch），构建自当前工作树，即合并 `origin/main` 之后的 `9492534` 加上本次未提交的修复。

### 对照实验：同一 schema 直连上游 vs 经代理

直连 `https://opencode.ai/zen/go/v1/responses`，发送 fixture 原样定义 `codex_app::automation_update`（`parameters` 根键只有 `oneOf`、`$defs`）：

```
400 invalid_request_error
Invalid schema for function 'codex_app::automation_update':
schema must be a JSON Schema of 'type: "object"', got 'type: null'.
```

经 copilot-api `POST /v1/responses` 发送完全相同的定义：

```
200 completed
output[].type=function_call name=automation_update args={"mode": "view", "id": "probe-target"}
```

两次请求只有代理边界这一步不同，因此接受与否来自根 `type: "object"` 的补写。上游对 `oneOf` / `$defs` 本身接受，`$defs` 的 25 个定义与 4 个联合分支没有被压平、丢弃或重写。同一轮里还用改名探针 `probe_ns::schema_probe`（`parameters` 与 fixture 逐字节相同）复现了同样的 200；探针从未被任何客户端执行。

### 完整工具回合

- 第一轮：200、`completed`，模型产出符合 view 分支的 `function_call`。
- 第二轮：把第一轮的 `reasoning`、`function_call` 连同 `function_call_output` 一起回放，200、`completed`，模型在 message 中引用了 `{"ok":true,"note":"probe only"}`。

过程中确认的两个协议约束（不是根类型问题，但都是真实要求）：

- 客户端必须带会话标识。本机 Codex 发送 `session-id`；缺失时上游返回 400 `MissingSessionID`，文案要求 `x-opencode-session`。
- DeepSeek thinking 模式下回放工具调用必须把上一轮的 `reasoning_text` 一起带回，否则 400 `The reasoning_text in the thinking mode must be passed back to the API.`。

### Codex CLI

`codex exec -C I:\Cache\workshop\copilot-api -m deepseek-v4.1-flash -s read-only --skip-git-repo-check`：

- shell 调用：`echo probe-shell-ok` 在 185ms 内成功，最终答复为 `probe-shell-ok`。
- 动态工具发现：提示按 `kanban` 做 tool search 后，CLI 经 tool_search 取到 8 个 MCP 工具名（`mcp__kanban_planning::*`、`mcp__kanban_execution::*`）并在后续请求中作答。
- 本机 Codex 应用会话本身就跑在 `deepseek-v4.1-flash` 上，`C:\Users\Jeff\.local\share\copilot-api\requests.log` 可见其带 `additional_tools` 与 namespace 工具声明的请求，修复后不再出现 schema 校验错误。

### 证据边界

- 没有抓到出站正文快照：运行实例的 console 重定向文件未记录本次新增的 `Declared object root ...` 信息行，出站形状由 `tests/responses-route.test.ts`（断言实际发给 DeepSeek 的 body）与上面的对照实验共同支撑。
- 未执行任何真实 automation 读写；探针工具的调用只存在于模型输出，没有被任何客户端执行。

## 测试

新增 `tests/normalize-function-schema-roots.test.ts`（8 项）与真实 fixture `tests/fixtures/deepseek-schema/automation-update.tools.json`；`tests/responses-route.test.ts` 增加 DeepSeek 路由用例，检查实际出站 body。

覆盖：真实 `automation_update` 联合 schema 只在根补 `type: "object"`，删除新增字段后与原始 schema 深度相等；`oneOf` 4 个分支、`$defs` 25 个定义、`strict`、`defer_loading` 全部保留；原 payload 与 fixture 对象未被修改；已显式声明任意根类型、`type: null`、缺失/`null`/布尔/字符串/数组 `parameters` 均不改；namespace 子工具与 `additional_tools` / `tool_search_output` 中的声明同样处理；重复声明逐个处理；重复执行幂等且第二次复用同一对象；`function_call.arguments` 内的同名 JSON 文本不受影响。

```
bun test tests/normalize-function-schema-roots.test.ts tests/deepseek-responses.test.ts \
  tests/responses-route.test.ts tests/strip-rejected-tool-calls.test.ts \
  tests/responses-unsupported-call-history-reproduce.test.ts
# 54 pass, 0 fail
```

`bunx eslint` 对新增的转接器与新增测试文件无告警；`bun run build` 通过。

## 已知与本次无关的问题

- `src/routes/responses/handler.ts` 与 `tests/responses-route.test.ts` 在改动前就分别有 16 与 37 条 lint 错误（导入排序、函数长度、复杂度、既有格式化）。已用 HEAD 副本复核数量一致，本次改动为 0 新增；未顺手重排无关代码。
- `tests/responses-route-sanitize-e2e.test.ts` 在改动前即失败：它要求 DeepSeek 路径归一化未加前缀的 item ID，但 HEAD 中该路径明确跳过 `sanitizeInputItemIds`（`route.provider !== "deepseek"`），且无变更时转发体仍是 `ArrayBuffer`，测试因此取不到字符串 body。属于既有缺陷，未在本次范围内修改。
- 直接执行 `bun test` 会把相邻 `home-server/llm-gateway` 的用例一并拉起，其中 18 条因缺少 `react/jsx-dev-runtime` 失败。限定在本仓库 `./tests` 的结果是 537 pass、1 skip、1 fail（即上面的既有失败）。
