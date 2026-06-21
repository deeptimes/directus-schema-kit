# Schema DSL

`dsk/schema/<module-id>.ts` 使用包公开 API，不允许依赖内部源码。

## Module ID 的作用

`defineModule({ id: 'catalog' })` 中的 `id` 是 DSK 的逻辑模块标识，不是 Directus collection，也不会在数据库中创建名为 `catalog` 的表。

一个模块用于表示稳定的业务边界，可以包含多个强相关的 groups、collections、fields 和 relations。例如课程目录模块可以同时包含课程分类、课程、章节和课时：

```ts
import { collection, collectionGroup, defineModule } from '@deeptimes/directus-schema-kit'

const group = 'course_catalog'

export default defineModule({
  id: 'catalog',
  version: '1.0.0',
  groups: [
    collectionGroup({ name: group, label: '课程内容', icon: 'school' }),
  ],
  collections: [
    collection({ name: 'course_categories', label: '课程分类', group }),
    collection({ name: 'courses', label: '课程', group }),
    collection({ name: 'course_chapters', label: '课程章节', group }),
    collection({ name: 'course_lessons', label: '课程课时', group }),
  ],
})
```

Module ID 主要用于：

- 在 Manifest 中记录定义所属的业务模块和源码文件。
- 限定计划和应用范围：`dsk plan --module catalog`、`dsk apply --module catalog`。
- 限定危险清理范围：`dsk clear catalog --confirm --scope catalog`。
- 聚合同一逻辑模块的多个源码文件；多个文件使用相同 ID 时会编译到同一个 Manifest module。
- 保存模块版本、依赖和 cleanup allowlist 等模块级元数据。

`id` 应使用稳定、简短的业务名称，例如 `catalog`、`commerce`、`learning`。发布后不要仅为改善命名随意修改，否则会改变范围过滤和清理时使用的模块标识。

推荐按业务能力拆分，而不是一个 collection 对应一个 module。在线课程项目可以采用：

```text
catalog
  course_categories, courses, course_chapters, course_lessons

identity
  instructor_profiles, student_profiles

commerce
  products, orders, order_items, payments

learning
  enrollments, lesson_progress, course_reviews
```

当一组 collections 需要独立 plan、apply 或 clear 时，再把它们拆成独立模块。

## Module ID 与 Collection Group

两者职责不同：

- `id: 'catalog'` 是 DSK 工程化标识，用于 Manifest、范围过滤和安全操作。
- `collectionGroup({ name: 'course_catalog' })` 是 Directus Data Studio 中的 UI 分组，用于组织 collection 的显示层级。

它们不需要同名。建议 Module ID 表达业务能力，Collection Group 名称遵循项目的 Directus collection 命名规则。

## 基本定义

```ts
import { collection, defineModule, field } from '@deeptimes/directus-schema-kit'

export default defineModule({
  id: 'content',
  collections: [
    collection({
      name: 'articles',
      label: '文章',
      fields: [
        field.status(),
        field.string('slug', { label: '标识', required: true, unique: true }),
        field.string('title', { label: '标题', required: true }),
      ],
    }),
  ],
  cleanupCollections: ['articles'],
})
```

常用字段包括 `string`、`text`、`integer`、`bigInteger`、`float`、`decimal`、`boolean`、`date`、`dateTime`、`time`、`timestamp`、`json`、`csv`、`status`、`sort` 和 `audit`。

界面 helper 不会引入虚构的数据库类型：

```ts
field.markdown('content')
field.tags('tags')
field.tags('keywords', { type: 'csv' })
field.code('config', { type: 'json' })
field.toggle('enabled', { labelOn: '启用' })
```

所有 helper 都保留 `interface`、`options`、`display` 和 `displayOptions` 高级入口。Directus 11.17.4 的 Field Type 映射见 [兼容矩阵](./compatibility.md)。`unknown` 是 Directus 内部兜底类型，不作为 DSK 声明入口。

## 关系 Blueprint

关系统一写在 module 的 `relations` 中。`field.m2o()` 继续兼容；新代码推荐 `relation.*`：

```ts
import { collection, defineModule, relation } from '@deeptimes/directus-schema-kit'

export default defineModule({
  id: 'content',
  collections: [
    collection({ name: 'articles', label: '文章' }),
    collection({ name: 'tags', label: '标签' }),
    collection({ name: 'languages', label: '语言' }),
  ],
  relations: [
    relation.m2o({ collection: 'articles', field: 'author_id', relatedCollection: 'directus_users' }),
    relation.o2m({ collection: 'articles', field: 'comments', relatedCollection: 'comments', relatedField: 'article_id' }),
    relation.m2m({ collection: 'articles', field: 'tags', relatedCollection: 'tags' }),
    relation.file({ collection: 'articles', field: 'document' }),
    relation.image({ collection: 'articles', field: 'cover' }),
    relation.files({ collection: 'articles', field: 'attachments' }),
    relation.translations({ collection: 'articles', languagesCollection: 'languages' }),
    relation.m2a({ collection: 'articles', field: 'blocks', allowedCollections: ['text_blocks', 'image_blocks'] }),
  ],
})
```

复合关系默认使用 `<collection>_<field>` 作为 junction collection，UUID `id` 主键，`<collection>_id`/`<relatedCollection>_id` 外键、`sort` 排序字段和 `CASCADE` 删除策略。可通过 `junction` 显式覆盖；`sortField: false` 禁用排序字段。Translations 默认语言集合名为 `languages`，该集合必须由项目声明。

关系删除策略只允许 `NO ACTION`、`CASCADE`、`SET NULL`、`SET DEFAULT`、`RESTRICT`。

V1 系统资源类型为 folders、roles、policies、access、permissions、presets。使用 `ref('policies.editor')` 引用稳定业务键，使用 `env('VARIABLE')` 保留环境变量引用。
