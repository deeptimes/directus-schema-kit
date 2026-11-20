# DSK 项目文档

本目录是业务项目内的 DSK 文档入口。`dsk init` 只复制缺失文件，不覆盖已有内容；升级 DSK 后需要审阅并合并新说明。

## 项目内入口

- [AI 指南](./ai-guide.md)：项目 / Codex / AI 的常用命令、Schema 规则、安全边界和 Directus 约束。

## 安装包内的完整参考

以下文档随 `@deeptimes/directus-schema-kit` 安装，始终以当前安装版本为准：

- [用户与 AI 文档索引](../../node_modules/@deeptimes/directus-schema-kit/docs/user/README.md)
- [Schema DSL](../../node_modules/@deeptimes/directus-schema-kit/docs/schema-dsl.md)
- [CLI 参考](../../node_modules/@deeptimes/directus-schema-kit/docs/cli-reference.md)
- [Manifest V1](../../node_modules/@deeptimes/directus-schema-kit/docs/manifest.md)
- [兼容性](../../node_modules/@deeptimes/directus-schema-kit/docs/compatibility.md)
- [配合 Directus 开发](../../node_modules/@deeptimes/directus-schema-kit/docs/directus-development.md)
- [开发规则](../../node_modules/@deeptimes/directus-schema-kit/docs/development-rules.md)

## AI 阅读顺序

1. 本目录的 `ai-guide.md`
2. 安装包内的 `docs/user/README.md`
3. 按任务阅读 `schema-dsl.md`、`cli-reference.md`、`compatibility.md`

DSK 维护者的 Roadmap、测试计划和实现文档不在业务项目的常规阅读范围内。
