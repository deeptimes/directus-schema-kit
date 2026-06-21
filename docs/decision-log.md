# Decision Log

## 2026-06-19：Plan 采用纯函数与只读 Adapter

- Plan Engine 不发起网络请求，输入为 Manifest 和标准化 DirectusState。
- DirectusReader 当前只暴露批量读取，不与未来写入 Adapter 混用。
- 未声明的实例资源不产生删除计划；白名单外差异默认 conflict。
- 字段约束和关系语义变化默认 dangerous。
- V1 拒绝连接公网 Directus 地址，避免本地工具误指向生产环境。

## 2026-06-19：Apply 使用全量阻断和串行执行

- 任一 conflict/dangerous 会在首个写请求前阻断整个 apply。
- 更新请求按 Plan change 生成最小 PATCH，不发送完整资源对象。
- 写入串行执行；失败后停止并保留部分成功报告，不宣称事务回滚。
- Plan 摘要必须与 Manifest 摘要一致。

## 2026-06-19：危险删除使用独立授权路径

- 普通 Schema apply 永不删除资源。
- 系统资源删除必须由 DSL 显式声明并提供 `--confirm-destructive`。
- Collection clear 使用独立命令。人工操作使用 `clear <module>`，在同一执行上下文中先展示计划，再通过默认否定的 `y/N` 确认；CI/脚本真实删除仍要求 `--confirm` 和与模块相同的 `--scope`。
- 旧的 `clear --module <id>` 暂时保留兼容；位置参数是新的标准入口，冲突值不允许执行。
- 系统资源依赖按 `$ref` 拓扑排序，不依赖文件顺序；缺失、循环引用在写入前阻断。

## 2026-06-19：收紧 V1 产品范围

- V1 不交付 Flow/Operation 和 Dashboard/Panel，同步能力移至 V2。
- 旧教学中心 Schema、章节数据、生成器和 examples/education 不再迁移。
- V1 系统资源固定为 folders、roles、policies、access、permissions、presets。
- 唯一认证环境为 Node.js 22+、Directus 11.17.4 和 SQLite。

## 2026-06-21：V1.1 对齐 Directus 字段与关系模型

- Directus 11.17.4 继续作为完整实现和自动验收基线；Directus 12.x 先进入兼容性评估，不以 latest 行为替换稳定基线。
- DSL 明确区分 Field Type、Interface 和 Relational Type。Markdown、Tags、Code、Toggle 属于界面语义，不作为新的数据库字段类型。
- 普通字段界面由 `field.*` helper 表达；M2O、O2M、M2M、M2A、Translations、File、Image、Files 由统一的 `relation.*` API 表达。
- M2M、M2A、Translations 和 Files 属于复合关系，必须通过 Relation Blueprint 展开完整的 alias field、junction collection、实体字段和 relations；不得用单一 FieldDefinition 模拟。
- 现有 `field.m2o()` 保留源码兼容，并编译到统一关系模型。
- M2A 要求关系目标允许为空并使用 relation meta 声明 collection discriminator 和 allowed collections，因此升级 Manifest 关系模型并提供 V1 兼容读取。
- 关系结构、目标和删除策略变化仍视为危险变更；relation meta 的安全更新范围需经集成测试后单独列入白名单。
