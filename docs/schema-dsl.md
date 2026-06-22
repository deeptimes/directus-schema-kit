# Schema DSL

`dsk/schemas/*.ts` 使用包公开 API，不允许依赖内部源码。文件按业务组织，例如 `catalog.ts`、`checkout.ts`、`customers.ts`；文件不会形成 Directus 命名空间或独立 apply/clear 范围。

## 全局 Schema 模型

`dsk build` 按文件名字典序加载所有定义，并编译为一个扁平 Manifest。约束如下：

- collection 名在整个项目中全局唯一。
- 一个 collection 只能由一个文件完整定义，其他文件可以通过 relation 引用它。
- 重复 collection、field、relation 或系统资源定义会阻断 build。
- Manifest 使用 `source` 记录源码文件，仅用于诊断和审查。
- `plan`、`apply` 和 `clear` 始终基于完整 Manifest，不按文件过滤。

一个文件可以直接导出单个 collection、定义数组，或使用 `defineSchema()` 聚合强相关定义：

```ts
import { collection, collectionGroup, defineSchema, field } from '@deeptimes/directus-schema-kit'

const group = 'commerce_catalog'

export default defineSchema({
  groups: [
    collectionGroup({ name: group, label: '商品目录', icon: 'storefront' }),
  ],
  collections: [
    collection({
      name: 'products',
      label: '商品',
      group,
      fields: [
        field.status(),
        field.string('slug', { label: '标识', required: true, unique: true }),
        field.string('title', { label: '标题', required: true }),
      ],
    }),
  ],
})
```

`collectionGroup()` 只负责 Directus Data Studio 的 UI 分组，与 TypeScript 文件名无关。

## 字段

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

## 跨文件关系

关系可以引用其他文件声明的 collection，但不得重复声明目标 collection：

```ts
// dsk/schemas/checkout.ts
import { collection, defineSchema, relation } from '@deeptimes/directus-schema-kit'

export default defineSchema({
  collections: [
    collection({ name: 'carts', label: '购物车' }),
    collection({ name: 'cart_items', label: '购物车项' }),
  ],
  relations: [
    relation.m2o({ collection: 'carts', field: 'customer', relatedCollection: 'customers' }),
    relation.m2o({ collection: 'cart_items', field: 'product', relatedCollection: 'products' }),
  ],
})
```

关系统一使用 `relation.*` blueprint；`field.m2o()` 继续兼容：

```ts
relation.m2o({ collection: 'articles', field: 'author_id', relatedCollection: 'directus_users' })
relation.o2m({ collection: 'articles', field: 'comments', relatedCollection: 'comments', relatedField: 'article_id' })
relation.m2m({ collection: 'articles', field: 'tags', relatedCollection: 'tags' })
relation.file({ collection: 'articles', field: 'document' })
relation.image({ collection: 'articles', field: 'cover' })
relation.files({ collection: 'articles', field: 'attachments' })
relation.translations({ collection: 'articles', languagesCollection: 'languages' })
relation.m2a({ collection: 'articles', field: 'blocks', allowedCollections: ['text_blocks', 'image_blocks'] })
```

复合关系默认使用 `<collection>_<field>` 作为 junction collection，UUID `id` 主键，`<collection>_id`/`<relatedCollection>_id` 外键、`sort` 排序字段和 `CASCADE` 删除策略。可通过 `junction` 显式覆盖；`sortField: false` 禁用排序字段。

## 全量 Clear

`dsk clear` 仅用于数据库初期建模和 DSK 调试。它清理 Manifest 声明的全部非 `directus_*` collection，不支持按文件或 collection 局部清理：

```bash
dsk clear --dry-run
dsk clear --confirm
```

交互式终端会先展示完整计划并要求 `y/N` 确认。
