# Antigravity / Interactions API 文档快照

抓取日期：2026-09-12（Asia/Tokyo）。本目录保存官方文档内容快照。

基于这些快照的 [Codex Responses ↔ Interactions 实现与测试设计](../ANTIGRAVITY_RESPONSES_INTERACTIONS_IMPLEMENTATION_TEST_DESIGN_CN.md) 支持文本、工具调用和 HTTP JSON / SSE。客户端保存历史与重放数据，中转只处理当前请求。范围不含图片、多媒体或 WebSocket。

| 文件 | 来源 | 抓取方式 |
|---|---|---|
| [google-ai-interactions-api.md](google-ai-interactions-api.md) | https://ai.google.dev/api/interactions-api | 官方 HTML 正文转换为 Markdown；20 个交互式 iframe 示例已抓取并附在文末 |
| [gemini-enterprise-interactions-api.md](gemini-enterprise-interactions-api.md) | https://docs.cloud.google.com/gemini-enterprise-agent-platform/reference/models/interactions-api | 官方 HTML 正文转换为 Markdown；11 个交互式 iframe 示例已抓取并附在文末 |
| [openai-responses-api.md](openai-responses-api.md) | https://developers.openai.com/api/reference/resources/responses | 官方 Markdown 版（URL 追加 `.md`），完整 Responses 资源参考 |
| [openai-migrate-to-responses.md](openai-migrate-to-responses.md) | https://developers.openai.com/api/docs/guides/migrate-to-responses | 官方 Markdown 版（URL 追加 `.md`），Chat Completions 迁移指南 |

Google 两份文档的源代码块在快照中保留为 Markdown 代码块，包含 REST、Python、JavaScript 和 Java 示例；少量页面级 `<div>` 包装仍可能出现在正文中，这是官方 HTML 结构的一部分。
