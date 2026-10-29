# Manifest V1

`dsk/generated/manifest.json` 是 `build` 的确定性输出，也是 plan/apply 唯一执行输入。

顶层字段：

- `manifestVersion`：当前生成版本为 1；不兼容的 Manifest 需要重新执行 build。
- `generator`：包名与版本。
- `source`：源码摘要和参与构建的文件；每项定义使用 `source` 定位来源文件。
- `collections`、`fields`、`relations`：完全展开的 Schema。
- `resources`：folders、roles、policies、access、permissions、presets、translations 定义。

`resources.translations` 为兼容已有 V1 输入而允许省略；新 build 始终输出数组。翻译按 `data.key + data.language` 校验唯一性，条件数组保留声明顺序。字段条件和翻译资源的属性约束与示例见 [Schema DSL](./schema-dsl.md)。

Manifest 不包含函数、解析后的 secret 或生成时间戳。`plan/apply` 会重新计算源码摘要；缺失或过期时拒绝执行。配套 Schema 位于 `schemas/manifest.schema.json`。

## 扁平模型

Manifest V1 不包含 modules。所有 Schema 文件编译到全局唯一的 collections、fields 和 relations；定义上的 `source` 仅用于定位源码。Manifest V1 允许 M2A 的 `related_collection: null` 并完整保存 Relation Meta。M2M、Files、Translations 和 M2A blueprint 在 build 时展开，Manifest 中不保留 blueprint。

复合关系的两条 junction relations 必须通过 `meta.junction_field` 互相引用。缺少反向引用时 Directus Studio 会把 alias 误判为 O2M，并报告 M2M/M2A Interface 不可用；validate 会拒绝这种不完整结构。

创建顺序固定为 collection（含 junction）→ 非 alias 字段 → relation → alias 字段。关系目标、删除策略、junction 结构和 M2A allowed collections 的变化属于 dangerous；当前仅 `meta.sort_field` 属于可安全更新。

## 重新生成 Manifest

缺失、过期或未知版本的 Manifest 必须通过 `dsk build` 重新生成，再运行 `dsk validate`；执行层不猜测旧格式。修改关系时使用公开 `relation.*` blueprint，不用单 alias 模拟复合关系。
