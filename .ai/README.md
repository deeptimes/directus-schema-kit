# 内部知识库

`.ai/` 保存开发 DSK 时需要交给 AI 或维护者的项目上下文，不作为公开用户文档。

## 阅读顺序

1. [PRD](./PRD.md)：当前产品目标、边界和验收标准。
2. [技术架构](./architecture.md)：模块边界、执行流程和安全策略。
3. [内部 API 契约](./api.md)：Plan、Apply、Seed、Resources 与 Clear 的稳定结果约定。
4. [Schema 编写规则](./schema-authoring.md)：Codex/AI 编写 DSK schema 前必须遵守的操作边界和反漂移规则。
5. [开发与验收](./development.md)：认证环境、自动测试和发布前检查。
6. [Directus / DBML 规范](./rules-directus-dbml.md)：涉及 DBML、collection、field 或 relation 时必须遵守。

## 文档边界

- 产品决策、实现约束、测试策略和待办放在 `.ai/`。
- 安装、使用、CLI 和公开格式说明放在 [`docs/`](../docs/README.md)。
- 已由代码、测试或 Git 历史表达的过程信息不在文档中重复维护。
- 当前 Manifest 格式版本为 V1；npm 包版本以 `package.json` 为准。
