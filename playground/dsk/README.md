# DSK 工作区

本目录保存可信的 TypeScript Schema/Resource DSL、JSON 配置、Seed 和生成产物。`dsk build` 会执行 DSL 并生成标准 JSON Manifest。

Schema 文件位于 `schemas/`，按业务组织源码；文件不会形成 Directus 命名空间，collection 名必须全局唯一。常用写法：

```ts
import { collection, field } from '@deeptimes/directus-schema-kit'

export default collection({
  name: 'articles',
  label: '文章',
  fields: [field.string('title', { label: '标题', required: true })],
})
```

系统资源按类型放在 `resources/`。定义中的敏感值必须使用 `env('VARIABLE_NAME')`，不得写入源码。

- `config.json`：项目路径、安全和校验配置。
- `seeds/`：严格 JSON seed，每个文件必须包含 `schemaVersion`。
- `generated/manifest.json`：由 `dsk build` 生成，禁止手工修改。

`plan/apply` 仅消费 JSON Manifest，不执行 TypeScript DSL。
