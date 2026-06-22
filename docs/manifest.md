# Manifest 规范

`.dsk/generated/manifest.json` 是 `build` 的确定性输出，也是 plan/apply 唯一执行输入。

顶层字段：

- `manifestVersion`：当前生成版本为 2；读取层兼容 V1。
- `generator`：包名与版本。
- `source`：源码文件列表及 SHA-256 摘要。
- `modules`：模块、依赖和 cleanup allowlist。
- `collections`、`fields`、`relations`：完全展开的 Schema。
- `resources`：V1 系统资源定义。

Manifest 不包含函数、解析后的 secret 或生成时间戳。`plan/apply` 会重新计算源码摘要；缺失或过期时拒绝执行。配套 Schema 位于 `schemas/manifest.schema.json`。

## V2 关系模型

V2 允许 M2A 的 `related_collection: null`，并完整保存 Relation Meta。M2M、Files、Translations 和 M2A blueprint 在 build 时展开，Manifest 中不保留 blueprint。

复合关系的两条 junction relations 必须通过 `meta.junction_field` 互相引用。缺少反向引用时 Directus Studio 会把 alias 误判为 O2M，并报告 M2M/M2A Interface 不可用；V2 validate 会拒绝这种不完整结构。

创建顺序固定为 collection（含 junction）→ 非 alias 字段 → relation → alias 字段。关系目标、删除策略、junction 结构和 M2A allowed collections 的变化属于 dangerous；当前仅 `meta.sort_field` 属于可安全更新。

## 从 V1 迁移

- 原 `field.m2o()` 无需修改；重新执行 `dsk build` 即生成 V2 relation meta。
- V1 Manifest 仍可供 validate/plan/apply 读取，但下一次 build 会确定性升级为 V2。
- 未知版本会明确报错并提示重新 build，不会尝试猜测结构。
- 旧项目若用单一 alias 字段模拟 M2M/M2A，应改用对应 `relation.*`，由 build 生成完整资源。
