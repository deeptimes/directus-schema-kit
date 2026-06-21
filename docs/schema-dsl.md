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

常用字段包括 `string`、`text`、`integer`、`decimal`、`boolean`、`dateTime`、`json`、`status`、`sort`、`m2o` 和 `audit`。关系删除策略只允许 `NO ACTION`、`CASCADE`、`SET NULL`、`SET DEFAULT`、`RESTRICT`。

V1 系统资源类型为 folders、roles、policies、access、permissions、presets。使用 `ref('policies.editor')` 引用稳定业务键，使用 `env('VARIABLE')` 保留环境变量引用。
