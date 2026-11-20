# 用户与 AI 文档入口

这些文档面向使用 DSK 的业务项目开发者和 Codex / AI，说明公开 API、命令、Manifest、兼容性和日常协作边界。维护者文档不在这里。

## 建议阅读顺序

1. [架构](./architecture.md)：DSK 的定位、分层、状态流、资源分类和跨环境边界。
2. [Schema DSL](./schema-dsl.md)：collection、field、relation 和系统资源的公开 API。
3. [CLI 参考](./cli-reference.md)：参数、Plan 分类、退出码和 JSON 输出。
4. [Manifest 格式 V1](./manifest.md)：生成格式、源码摘要和关系展开约束。
5. [兼容性](./compatibility.md)：认证环境、字段类型和关系支持范围。
6. [配合 Directus 开发](./directus-development.md)：本地变更、系统资源、数据初始化和发布边界。
7. [开发规则](./development-rules.md)：命名、AI 编写约束和安全边界。
8. [更新记录](./changelog.md)：版本变更与待发布内容。

## 业务项目内的入口

在业务项目中执行 `dsk init` 后，项目内会生成：

- `dsk/docs/README.md`：项目内文档索引；
- `dsk/docs/ai-guide.md`：短版 AI 规则和命令入口，指向本目录的完整文档。

项目内文档是静态模板，不会由代码动态生成；安装包升级后，完整参考以 `node_modules/@deeptimes/directus-schema-kit/docs/` 为准。
