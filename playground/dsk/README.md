# DSK TypeScript 定义

本目录统一保存可信的 TypeScript Schema/Resource DSL、配置、Seed 和生成的 JSON Manifest。

Schema 文件位于 `schema/`，按业务组织源码但不形成 Directus 命名空间；collection 名必须全局唯一。常用写法：

```ts
import { collection, field } from '@deeptimes/directus-schema-kit'

export default collection({
  name: 'articles',
  label: '文章',
  fields: [field.string('title', { label: '标题', required: true })],
})
```

系统资源按类型放在 `resources/`。定义中的敏感值必须使用 `env('VARIABLE_NAME')`，不得写入源码。
