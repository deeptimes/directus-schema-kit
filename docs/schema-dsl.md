# Schema DSL

`dsk/schema/<module-id>.ts` 使用包公开 API，不允许依赖内部源码。

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
