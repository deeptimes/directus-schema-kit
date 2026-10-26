# 开发文档

工具定位、安装和基本用法见 [README](../README.md)。这里维护产品方向、Directus 开发协作和实现约束。

## 开发必读

- [Roadmap 与产品边界](./roadmap.md)：当前交付范围、后续方向和验收基线，作为本项目的产品需求依据。
- [配合 Directus 开发](./directus-development.md)：源码与 Data Studio 的分工、日常变更、系统资源和数据初始化。
- [开发规则](./development-rules.md)：Schema / DBML 命名、AI 编写约束、安全边界和危险操作。
- [DSK 实现与验收](./development.md)：模块职责、结果契约、测试和发布检查。

## 技术参考

- [Schema DSL](./schema-dsl.md)：collection、field、relation 和系统资源的公开 API。
- [CLI 参考](./cli-reference.md)：参数、Plan 分类、退出码和 JSON 输出。
- [Manifest V1](./manifest.md)：生成格式、源码摘要和关系展开约束。
- [兼容性](./compatibility.md)：认证环境、字段类型和关系支持范围。

每项规则只在对应文档维护，示例以公开 API 为准。Manifest V1 是格式版本，包版本以 `package.json` 或 `dsk --version` 为准。
