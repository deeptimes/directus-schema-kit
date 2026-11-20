# 开发文档

工具定位、安装和基本用法见 [README](../README.md)。本文档区分使用 DSK 的用户 / AI 入口和维护者文档。

## 用户 / AI 入口

- [用户与 AI 文档入口](./user/README.md)：建议阅读顺序和业务项目内入口。
- [架构](./architecture.md)：DSK 的定位、分层、状态流、资源分类和跨环境边界。
- [Schema DSL](./schema-dsl.md)：collection、field、relation 和系统资源的公开 API。
- [CLI 参考](./cli-reference.md)：参数、Plan 分类、退出码和 JSON 输出。
- [Manifest V1](./manifest.md)：生成格式、源码摘要和关系展开约束。
- [兼容性](./compatibility.md)：认证环境、字段类型和关系支持范围。
- [配合 Directus 开发](./directus-development.md)：源码与 Data Studio 的分工、日常变更、系统资源和数据初始化。
- [开发规则](./development-rules.md)：Schema / DBML 命名、AI 编写约束、安全边界和危险操作。

## 维护者文档

- [维护者文档入口](./maintainer/README.md)：发布、实现和测试文档的索引。
- [Roadmap 与产品边界](./roadmap.md)：当前交付范围、v3.1 目标和验收基线。
- [DSK 实现与验收](./development.md)：模块职责、结果契约、测试和发布检查。
- [v3 测试计划](./v3-test-plan.md)：Directus 系统模型资源的本地矩阵和跨环境测试矩阵。
- [更新记录](./changelog.md)：版本变更与待发布内容。
- [历史需求](./requests/README.md)：已实现需求的原始记录与验收参考。

每项规则只在对应文档维护，示例以公开 API 为准。Manifest V1 是格式版本，包版本以 `package.json` 或 `dsk --version` 为准。
