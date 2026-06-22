# Manifest 规范

`dsk/generated/manifest.json` 是 `build` 的确定性输出，也是 plan/apply 唯一执行输入。

顶层字段：

- `manifestVersion`：当前生成版本为 3；旧版本需要重新执行 build。
- `generator`：包名与版本。
- `source`：源码摘要和参与构建的文件；每项定义使用 `source` 定位来源文件。
- `collections`、`fields`、`relations`：完全展开的 Schema。
- `resources`：V1 系统资源定义。

Manifest 不包含函数、解析后的 secret 或生成时间戳。`plan/apply` 会重新计算源码摘要；缺失或过期时拒绝执行。配套 Schema 位于 `schemas/manifest.schema.json`。

## V3 扁平模型

V3 移除 modules。所有 Schema 文件编译到全局唯一的 collections、fields 和 relations；定义上的 `source` 仅用于定位源码。V3 继续允许 M2A 的 `related_collection: null` 并完整保存 Relation Meta。M2M、Files、Translations 和 M2A blueprint 在 build 时展开，Manifest 中不保留 blueprint。

复合关系的两条 junction relations 必须通过 `meta.junction_field` 互相引用。缺少反向引用时 Directus Studio 会把 alias 误判为 O2M，并报告 M2M/M2A Interface 不可用；validate 会拒绝这种不完整结构。

创建顺序固定为 collection（含 junction）→ 非 alias 字段 → relation → alias 字段。关系目标、删除策略、junction 结构和 M2A allowed collections 的变化属于 dangerous；当前仅 `meta.sort_field` 属于可安全更新。

## 从 V1/V2 迁移

- 原 `field.m2o()` 无需修改。
- 将 `defineModule({ id, version, dependsOn, cleanupCollections, ... })` 改为 `defineSchema({ ... })`，删除模块字段。
- 将 `.dsk/` 中的 config、seeds 和 generated 移入 `dsk/`，并更新配置中的相对路径。
- 重新执行 `dsk build` 生成 V3；V1/V2 Manifest 不再供 validate/plan/apply 读取。
- 未知版本会明确报错并提示重新 build，不会尝试猜测结构。
- 旧项目若用单一 alias 字段模拟 M2M/M2A，应改用对应 `relation.*`，由 build 生成完整资源。
