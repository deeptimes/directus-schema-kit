# Schema 编写规则

本文档面向使用 Codex/AI 为 Directus 项目编写 DSK schema 的场景。目标是让生成的 `dsk/schemas/*.ts` 稳定符合项目 DSL、Directus 规范和 Manifest V3 执行边界，避免 AI 自行发明 API 或产生 schema 漂移。

## 开始前必须阅读

在新增或修改任何 collection、field、relation、resource、seed 前，必须先阅读：

1. `.ai/PRD.md`：确认 DSK 当前产品边界和禁止事项。
2. `.ai/rules-directus-dbml.md`：确认 Directus、DBML、collection、field、relation 命名规范。
3. `docs/schema-dsl.md`：确认公开 DSL 的正确写法。
4. 当前项目已有的 `dsk/schemas/`、`dsk/resources/` 和 `dsk/seeds/`：继承现有业务命名、分组和文件组织方式。

如果 PRD 与 DBML/Directus 规范冲突，以 PRD 为准，并在回复中明确说明冲突点。

## 工作边界

- 只修改当前任务相关的 schema、resource、seed 或说明文档。
- 不手写、不编辑 `dsk/generated/manifest.json`；Manifest 只能由 `dsk build` 生成。
- 不直接依赖 DSK 内部源码路径；业务 schema 只能从 `@deeptimes/directus-schema-kit` 导入公开 API。
- 不把 TypeScript 文件名理解为 Directus namespace。
- 不假设可以局部 apply、局部 clear 或按文件清理；`plan`、`apply`、`clear` 始终基于完整 Manifest。
- 不在普通 `apply` 中设计删除、字段类型迁移、collection 重命名或存量数据迁移。
- 不把 DSK 用作生产发布工具；它面向本地 Directus 开发实例。

## 文件组织

Schema 文件按业务域组织，例如：

```text
dsk/schemas/
  catalog.ts
  checkout.ts
  customers.ts
```

规则：

- 一个 collection 只能在一个文件中完整定义。
- collection 名在整个项目中全局唯一。
- 其他文件可以通过 relation 引用 collection，但不能重复声明 collection。
- 强相关的 group、collection、relation 可以用 `defineSchema()` 聚合。
- `collectionGroup()` 只用于 Directus Data Studio UI 分组，不代表数据库 namespace。

## 命名规则

必须遵守 `.ai/rules-directus-dbml.md`，并优先使用以下约定：

- collection 和 field 使用小写 `snake_case`。
- 业务 collection 默认使用复数名，例如 `articles`、`products`、`course_lessons`。
- 普通业务 collection 禁止使用 `directus_` 前缀。
- 自身主键使用 `id`。
- Directus 内容状态字段统一使用 `status`。
- 手动排序字段统一使用 `sort`。
- Directus 审计字段使用 `field.audit()` helper，在 `fields` 数组中写作 `...field.audit()`；不要自行发明 `created_at`、`updated_at`、`created_by`。
- 业务时间字段使用 `date_` 前缀，例如 `date_published`、`date_start`。
- 用户关系字段使用 `user_` 前缀，例如 `user_owner`、`user_approved`。
- 布尔字段使用 `is_` 前缀，例如 `is_active`、`is_featured`。

## Collection 编写规则

优先使用稳定、明确的业务字段：

```ts
import { collection, defineSchema, field } from '@deeptimes/directus-schema-kit'

export default defineSchema({
  collections: [
    collection({
      name: 'articles',
      label: '文章',
      fields: [
        field.status(),
        field.sort(),
        field.string('slug', { label: '标识', required: true, unique: true }),
        field.string('title', { label: '标题', required: true }),
        field.text('summary', { label: '摘要' }),
        field.markdown('content', { label: '正文' }),
        ...field.audit(),
      ],
    }),
  ],
})
```

规则：

- 需要发布状态时使用 `field.status()`。
- 需要人工排序时使用 `field.sort()`。
- 需要审计字段时使用 `...field.audit()`。
- 唯一业务标识优先使用 `slug`，并设置 `unique: true`。
- 只有确实需要结构化扩展数据时才使用 `field.json('metadata')`。
- 不使用 `data`、`info`、`value`、`type` 等模糊字段名，除非业务语义已经足够明确。

## 字段类型规则

只使用 DSK DSL 已公开的字段 helper。常用字段包括：

- `field.string()`
- `field.text()`
- `field.integer()`
- `field.bigInteger()`
- `field.float()`
- `field.decimal()`
- `field.boolean()`
- `field.date()`
- `field.dateTime()`
- `field.time()`
- `field.timestamp()`
- `field.json()`
- `field.csv()`
- `field.status()`
- `field.sort()`
- `field.audit()`

UI helper 不代表新的数据库类型：

```ts
field.markdown('content')
field.tags('tags')
field.code('config', { type: 'json' })
field.toggle('is_active')
```

禁止：

- 发明 Directus 或 DSK 不存在的字段类型。
- 把 `interface`、`display`、`special` 当成数据库类型。
- 使用 Directus 内部兜底类型 `unknown` 作为声明入口。
- 手动拼接系统审计字段来替代 `field.audit()`，除非当前任务明确要求定制。

## 关系编写规则

新增关系时优先使用 `relation.*` blueprint，不优先使用旧式 `field.m2o()`。

```ts
import { collection, defineSchema, relation } from '@deeptimes/directus-schema-kit'

export default defineSchema({
  collections: [
    collection({ name: 'articles', label: '文章' }),
    collection({ name: 'categories', label: '分类' }),
  ],
  relations: [
    relation.m2o({ collection: 'articles', field: 'category', relatedCollection: 'categories' }),
    relation.o2m({ collection: 'categories', field: 'articles', relatedCollection: 'articles', relatedField: 'category' }),
  ],
})
```

规则：

- M2O 真实字段优先使用语义化单数名，例如 `category`、`author`、`owner`。
- 同一 collection 多次关联同一目标 collection 时，字段名必须体现角色，例如 `reviewer`、`approver`。
- 自关联父级字段统一使用 `parent`。
- O2M 是虚拟展示字段，不应当作为真实数据库列理解。
- 关联 `directus_users`、`directus_files` 时只引用系统 collection，不重新声明系统 collection。
- `directus_*` collection 不属于 DSK 管理范围，除非 PRD 明确要求。

常用关系：

```ts
relation.m2o({ collection: 'articles', field: 'author', relatedCollection: 'directus_users' })
relation.o2m({ collection: 'articles', field: 'comments', relatedCollection: 'comments', relatedField: 'article' })
relation.m2m({ collection: 'articles', field: 'tags', relatedCollection: 'tags' })
relation.file({ collection: 'articles', field: 'document', allowedMimeTypes: ['application/pdf'] })
relation.image({ collection: 'articles', field: 'cover' })
relation.files({ collection: 'articles', field: 'attachments', allowedMimeTypes: ['application/pdf'] })
relation.translations({ collection: 'articles', languagesCollection: 'languages' })
relation.m2a({ collection: 'pages', field: 'blocks', allowedCollections: ['text_blocks', 'image_blocks'] })
```

## 复合关系与 junction 规则

`relation.m2m()`、`relation.files()`、`relation.m2a()` 和 `relation.translations()` 会自动生成 junction collection。不要在不需要额外业务字段时手写 junction collection。

默认规则：

- `relation.m2m()` 默认使用 `<collection>_<field>` 作为 junction collection。
- `relation.files()` 默认使用 `<collection>_files`，同一 collection 多个 files 字段时必须显式指定不同 `junction.collection`。
- 自动 junction 默认隐藏，并挂载到来源 collection 的下一层 UI 分组。
- 业务人员通常只维护来源 collection 上的 alias 字段。

只有当 junction 本身需要业务字段、状态、审计或独立生命周期时，才将它显式建模为普通 collection。

## 系统资源规则

系统资源放在 `dsk/resources/`，不要混入普通 schema 文件，除非现有项目已经采用这种组织方式。

Public 权限必须使用系统引用：

```ts
import { resource, systemRef } from '@deeptimes/directus-schema-kit'

export default resource('permissions', {
  key: 'public-articles-read',
  data: {
    policy: systemRef('policies.public'),
    collection: 'articles',
    action: 'read',
    fields: ['*'],
  },
})
```

规则：

- 不硬编码 Directus policy、role、user 的环境 UUID。
- 不重复创建 Directus 内置 Public policy。
- 删除系统资源必须显式声明 `delete: true`，并通过独立 destructive 确认路径执行。

## Seed 规则

Seed 只用于本地初始化和基础数据，不用于生产迁移。

规则：

- 使用自然键保证幂等，不依赖环境自增 ID。
- 跨批次引用必须使用稳定业务键。
- 不把 token、secret、密码或真实用户隐私数据写入 seed。
- 重复执行 seed 不应产生重复数据。

## 禁止清单

AI/Codex 不得生成以下内容：

- `directus_` 前缀的业务 collection。
- 未在 DSL 中公开的 helper 或导入路径。
- 手写 `dsk/generated/manifest.json`。
- 依赖文件名 namespace 的 schema。
- 普通 `apply` 自动删除字段、删除 collection 或迁移字段类型的方案。
- `created_at`、`updated_at`、`created_by`、`updated_by` 等非 Directus 标准审计字段。
- JSON 数组保存文件 ID 或多用户 ID。
- 用 `order`、`position`、`sequence` 替代 Directus 手动排序字段 `sort`，除非它们有独立业务含义。
- 硬编码 Directus 系统资源 UUID。
- 声明 Flow、Operation、Dashboard、Panel，当前版本不支持。

## 修改后检查

完成 schema/resource/seed 修改后，按风险执行检查：

```bash
pnpm dsk build
pnpm dsk validate
pnpm dsk plan
```

如果只是文档或很小的 schema 示例变更，可以说明由用户自行运行。涉及真实 Directus 写入前，必须先查看 `plan`，必要时执行：

```bash
pnpm dsk apply --dry-run
pnpm dsk resources apply --dry-run
pnpm dsk seed --plan
```

只有当 `plan` 没有 `conflict` 或 `dangerous`，并且任务明确要求写入本地实例时，才执行真实 `apply`、`resources apply` 或 `seed`。

## 给 Codex 的固定提示词

在目标 Directus 项目中让 Codex 写 schema 时，可使用以下提示：

```text
你正在为 Directus 项目编写 DSK schema。开始前必须阅读 .ai/PRD.md、.ai/schema-authoring.md、.ai/rules-directus-dbml.md、docs/schema-dsl.md，并检查现有 dsk/schemas/ 的写法。不要手写 Manifest，不要修改 dsk/generated/manifest.json。所有 relation 优先使用 relation.* blueprint。修改后运行 pnpm dsk build 和 pnpm dsk validate；如果涉及真实实例差异，再运行 pnpm dsk plan。
```
