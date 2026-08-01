# Directus Schema Kit 文档

DSK 使用 TypeScript DSL 声明 Directus Schema，通过 Manifest V1 校验和规划差异，再将安全变更应用到本地开发实例。

## 开始使用

- [快速开始](./quick-start.md)：安装、初始化和首次应用。
- [CLI 参考](./cli-reference.md)：命令、全局参数、退出码和推荐工作流。
- [Schema DSL](./schema-dsl.md)：collection、字段、关系和系统资源写法。

## 设计与约束

- [Manifest V1](./manifest.md)：生成格式和执行边界。
- [AI Schema 编写规则](./ai-schema-authoring.md)：让 Codex/AI 在业务项目中稳定编写 DSK schema 的提示词和约束。
- [兼容性](./compatibility.md)：认证环境、字段类型和关系支持范围。
- [安全边界](./security.md)：连接限制、危险操作和凭证保护。

## 版本说明

文档中的 Manifest V1 指 Manifest 格式版本，不代表 npm 包主版本。实际包版本以安装结果或 `dsk --version` 为准。

CLI 接受 Directus 11.x 与 12.x。当前正式认证环境为 Node.js 22+、Directus 11.17.4 和 SQLite；Directus 12.x 尚未正式认证。
