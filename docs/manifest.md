# Manifest 规范

`.dsk/generated/manifest.json` 是 `build` 的确定性输出，也是 plan/apply 唯一执行输入。

顶层字段：

- `manifestVersion`：当前为 1。
- `generator`：包名与版本。
- `source`：源码文件列表及 SHA-256 摘要。
- `modules`：模块、依赖和 cleanup allowlist。
- `collections`、`fields`、`relations`：完全展开的 Schema。
- `resources`：V1 系统资源定义。

Manifest 不包含函数、解析后的 secret 或生成时间戳。`plan/apply` 会重新计算源码摘要；缺失或过期时拒绝执行。配套 Schema 位于 `schemas/manifest.schema.json`。
