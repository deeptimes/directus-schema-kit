# AI Schema 编写规则

本文档用于放入业务 Directus 项目，约束 Codex/AI 使用 DSK 编写 `dsk/schemas/*.ts`、`dsk/resources/*.ts` 和 `dsk/seeds/**/*.json`。

## 开始前

让 AI 写 schema 前，应要求它先阅读：

1. 当前业务项目的 `dsk/` 目录。
2. 当前业务项目已有的 `.ai/` 规则文档。
3. DSK 文档中的 [Schema DSL](./schema-dsl.md)。
4. DSK 文档中的 [Manifest V1](./manifest.md)。

## 必须遵守

- 只从 `@deeptimes/directus-schema-kit` 导入公开 API。
- 不手写、不编辑 `dsk/generated/manifest.json`。
- 文件名只用于组织源码，不代表 Directus namespace。
- collection 名在整个项目中全局唯一。
- 一个 collection 只能在一个文件中完整定义。
- 关系优先使用 `relation.*` blueprint。
- `field.audit()` 在 `fields` 数组中必须写作 `...field.audit()`。
- `plan`、`apply` 和 `clear` 始终基于完整 Manifest，不按文件局部执行。
- 普通 `apply` 不做删除、字段类型迁移、collection 重命名或存量数据迁移。

## 命名约定

- collection 和 field 使用小写 `snake_case`。
- 业务 collection 默认使用复数名，例如 `articles`、`products`。
- 业务 collection 禁止使用 `directus_` 前缀。
- 主键使用 `id`。
- 内容状态字段使用 `status`。
- 手动排序字段使用 `sort`。
- 审计字段使用 `...field.audit()`。
- 业务时间字段使用 `date_` 前缀。
- 用户关系字段使用 `user_` 前缀。
- 布尔字段使用 `is_` 前缀。

## 禁止

- 发明 DSK 未公开的 helper、字段类型或导入路径。
- 把 Directus interface/display/special 当成数据库类型。
- 声明或修改 `directus_*` 系统 collection。
- 用 `created_at`、`updated_at`、`created_by`、`updated_by` 替代 Directus 标准审计字段。
- 用 JSON 数组保存文件 ID 或多用户 ID。
- 硬编码 Directus role、policy、user 等系统资源 UUID。
- 声明 Flow、Operation、Dashboard、Panel，当前版本不支持。

## 推荐提示词

```text
你正在为 Directus 项目编写 DSK schema。开始前必须阅读当前项目 .ai/、dsk/ 和 DSK 的 docs/schema-dsl.md、docs/manifest.md。不要手写 Manifest，不要修改 dsk/generated/manifest.json。所有 relation 优先使用 relation.* blueprint。修改后运行 pnpm dsk build 和 pnpm dsk validate；如果涉及真实实例差异，再运行 pnpm dsk plan。
```
