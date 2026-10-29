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

`collectionGroup()` 只负责 Directus Data Studio 的 UI 分组，与 TypeScript 文件名无关。普通业务 collection 也可以作为 `group` 的父集合，例如 `blog_tags` 设置 `group: 'blogs'`。apply 按所有集合的 `meta.group` 依赖先创建父级，再创建子级，不依赖文件或声明顺序；父集合必须在完整 Manifest 中声明。缺失父级、自引用和循环依赖在 build / validate 及 apply 写入前阻断。

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
relation.file({ collection: 'articles', field: 'video', allowedMimeTypes: ['video/*'] })
relation.image({ collection: 'articles', field: 'cover' })
relation.files({ collection: 'articles', field: 'attachments', allowedMimeTypes: ['application/pdf'] })
relation.translations({ collection: 'articles', languagesCollection: 'languages' })
relation.m2a({ collection: 'articles', field: 'blocks', allowedCollections: ['text_blocks', 'image_blocks'] })
```

复合关系默认使用 `<collection>_<field>` 作为 junction collection，UUID `id` 主键，`<collection>_id`/`<relatedCollection>_id` 外键、`sort` 排序字段和 `CASCADE` 删除策略。可通过 `junction` 显式覆盖；`sortField: false` 禁用排序字段。

所有由 `relation.m2m()`、`relation.files()`、`relation.m2a()` 和 `relation.translations()` 自动生成的 junction collection 默认隐藏，并通过 `meta.group` 挂载到来源 collection 的下一层。业务人员只通过来源 collection 的 alias 字段维护关系。需要直接维护额外业务字段的中间模型应显式定义为普通 collection，而不是使用自动 junction。

`relation.files()` 使用 Directus 专用 Files 界面，不按普通 M2M 展示。它默认生成隐藏的 `<collection>_files` junction、自增整数主键、`sort` 字段和 `SET NULL` 删除策略，并支持 `allowedMimeTypes`。同一 collection 定义多个 Files 字段时，必须通过 `junction.collection` 为每个字段指定不同的 junction 名称。

`relation.file()` 和 `relation.image()` 使用 Directus 专用单文件界面并生成 `special: ['file']`。`relation.file()` 可通过 `allowedMimeTypes` 限制视频、文档等类型；`relation.image()` 默认使用 Directus 11.17.4 支持的图片 MIME 类型集合，也允许显式覆盖。

## 系统资源引用

Public permission 使用只读系统引用绑定 Directus 内置 Public policy，不硬编码环境相关 UUID，也不重复创建匿名 policy：

```ts
import { resource, systemRef } from '@deeptimes/directus-schema-kit'

export default resource('permissions', {
  key: 'public-articles-read',
  data: {
    policy: systemRef('policies.public'),
    collection: 'articles',
    action: 'read',
    permissions: { status: { _eq: 'published' } },
    fields: ['*'],
  },
})
```

`systemRef()` 首版只支持 `policies.public`。`dsk resources apply` 必须在实例中唯一找到 Directus 内置 `$t:public_label` policy，否则在任何写入前失败。该引用只用于关联，DSK 不管理系统 policy 的生命周期。

## 表格 Preset

使用 `preset.tabular()` 声明集合的默认表格视图，不需要重复编写 `layout_query` 和 `layout_options`：

```ts
import { preset } from '@deeptimes/directus-schema-kit'

export default preset.tabular({
  collection: 'articles',
  icon: 'article',
  color: '#6644FF',
  fields: ['status', 'title', 'slug', 'description', 'cover'],
  widths: { slug: 240 },
})
```

默认生成全局 tabular preset（`bookmark`、`role`、`user` 均为 `null`），page 为 1，并根据常见字段名设置列宽；`widths` 可以逐字段覆盖，`defaultWidth` 控制其他字段的默认宽度。

## 全量 Clear

`dsk clear` 仅用于数据库初期建模和 DSK 调试。它清理 Manifest 声明的全部非 `directus_*` collection，不支持按文件或 collection 局部清理：

```bash
dsk clear --dry-run
dsk clear --confirm
```

交互式终端会先展示完整计划并要求 `y/N` 确认。

## 字段条件

字段 helper 的 `conditions` 与原始 `FieldMeta.conditions` 均保存 Directus 原生规则：

```ts
field.string('object', {
  label: '对象', hidden: true,
  conditions: [
    {
      name: '对象类型显示并必填', rule: { type: { _in: ['object', 'aspect'] } },
      hidden: false, required: true, options: {},
    },
    {
      name: '其他类型隐藏并清空', rule: { type: { _nin: ['object', 'aspect'] } },
      hidden: true, required: false, clear_hidden_value_on_save: true, options: {},
    },
  ],
})
```

每条条件必须有 `name` 和对象形式的 `rule`；支持 `hidden`、`required`、`readonly`、`options`、`clear_hidden_value_on_save`，未知条件属性和无效 Filter 结构会报来源文件、集合、字段及条件位置。规则不执行 JavaScript。`options` 保留嵌套内容；条件数组按声明顺序保存、比较，不排序。对象键顺序不影响比对。

已有字段的条件新增、修改、删除和重排归为安全 `update`，只 PATCH 变化的元数据。未声明 `conditions` 保留实例配置；显式 `null` 或 `[]` 都表示清空，两种空表示比对等价。条件中的 `required` 仅影响表单，不修改 `schema.is_nullable`。

Plan 展示完整条件差异；涉及 `clear_hidden_value_on_save: true` 时额外提示后续保存的数据影响。清空由 Studio 在保存条目时执行，不会在应用元数据时批量改写业务数据，也不适用于普通 API 客户端；后端仍需独立校验。字段类型、数据库约束、`meta.special` 和其他未支持属性继续受原有阻断机制保护。

## Translation Strings

后台界面翻译使用 `resource('translations', ...)`，与业务内容的 `relation.translations()` 分开。将以下定义放入 `dsk/resources/translations.ts`：

```ts
import { resource } from '@deeptimes/directus-schema-kit'

export default [
  resource('translations', {
    key: 'context-sun-zh',
    data: { key: 'context.object.sun', language: 'zh-CN', value: '太阳' },
  }),
  resource('translations', {
    key: 'context-sun-en',
    data: { key: 'context.object.sun', language: 'en-US', value: 'Sun' },
  }),
  resource('translations', {
    key: 'context-house-one-zh',
    data: { key: 'context.house.one', language: 'zh-CN', value: '第 1 宫' },
  }),
  resource('translations', {
    key: 'context-house-one-en',
    data: { key: 'context.house.one', language: 'en-US', value: 'House 1' },
  }),
]
```

在 Schema 文件中引用，选项保存值不会随语言变化：

```ts
field.string('object', {
  label: '对象', interface: 'select-dropdown',
  options: { choices: [{ value: 'sun', text: '$t:context.object.sun' }] },
})
field.integer('house', {
  label: '宫位', interface: 'select-dropdown',
  options: { choices: [{ value: 1, text: '$t:context.house.one' }] },
})
```

外层 `key` 是 DSK 资源标识；实例按 `data.key + data.language` 自然键匹配，首次接入可认领手工创建的记录，更新保留原 ID。新增与修改进入现有 `resources apply --dry-run` / `resources apply`，只调用官方 `/translations` API。预览展示新增内容和文字前后差异。重复声明、实例中的重复自然键均阻断；一个语言的修改不会覆盖另一语言。

`data.key`、`data.language` 必须是含非空白字符、最多 255 个字符的字符串；不改写语言大小写或分隔符。`value` 必须是字符串，允许空字符串、Unicode 和换行，不转义或插值。声明字段限定为这三项，禁止硬编码实例 `id` 或使用引用替代自然键。显式删除只需 `key` 和 `language`，可省略 `value`：

```ts
resource('translations', {
  key: 'context-sun-zh', delete: true,
  data: { key: 'context.object.sun', language: 'zh-CN' },
})
```

删除仍需 `--confirm-destructive`；目标不存在时为 `unchanged`。移除声明、改变翻译键或语言不会删除旧记录。`clear`、`clean`、`reset` 都不自动删除共享 Translation Strings，删除须走资源显式机制。旧 Manifest V1 可以没有 `resources.translations`；重新 build 后会生成该数组。

推荐先 `build`、`validate`，再审查并应用 Schema，随后同步 resources，最后开放 Studio 编辑；Schema 与资源分别验收。若项目需要提前准备翻译，可预先部署只含翻译的声明阶段；不要将依赖集合的 permissions 一并强制提前。第一版不检查 `$t:` 引用完整性，因为引用也可能来自内置词条或其他维护方。
