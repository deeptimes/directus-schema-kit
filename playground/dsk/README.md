# DSK TypeScript 定义

本目录只保存可信的 TypeScript Schema/Resource DSL。`dsk build` 会执行这些文件并生成标准 JSON Manifest。

Schema 文件位于 `schema/`，每个文件代表一个稳定业务模块。常用写法：

```ts
import { collection, field } from '@deeptimes/directus-schema-kit'

export default collection({
  name: 'articles',
  label: '文章',
  fields: [field.string('title', { label: '标题', required: true })],
})
```

系统资源按类型放在 `resources/`。定义中的敏感值必须使用 `env('VARIABLE_NAME')`，不得写入源码。
