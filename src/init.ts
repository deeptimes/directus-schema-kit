import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { defaultConfig } from './config.js'

export interface InitResult {
  created: string[]
  preserved: string[]
  dryRun: boolean
}

const schemaExample = `/**
 * 安全的空 Schema 文件。按业务域复制此文件，并使用 collection()/field.*() 添加定义。
 * 详见 dsk/README.md。
 */
export default []
`

const resourceExample = `/** 安全的空 Resource 定义。 */
export default []
`

const seedExample = JSON.stringify({ schemaVersion: 1, collection: 'example', upsertBy: ['slug'], items: [] }, null, 2) + '\n'

const aiGuide = `# Directus Schema Kit AI 规则

本文件由 \`dsk init\` 生成，用于约束 Codex/AI 在当前 Directus 项目中编写 DSK schema。

## 开始前必须阅读

1. 当前项目已有的 \`.ai/\` 规则文档。
2. 当前项目的 \`dsk/README.md\`。
3. 当前项目已有的 \`dsk/schemas/\`、\`dsk/resources/\` 和 \`dsk/seeds/\`。
4. DSK 公开文档中的 Schema DSL、Manifest 和 CLI 说明。

## 必须遵守

- 只从 \`@deeptimes/directus-schema-kit\` 导入公开 API。
- 不手写、不编辑 \`dsk/generated/manifest.json\`。
- 文件名只用于组织源码，不代表 Directus namespace。
- collection 名在整个项目中全局唯一。
- 一个 collection 只能在一个文件中完整定义。
- 关系优先使用 \`relation.*\` blueprint。
- \`field.audit()\` 在 \`fields\` 数组中必须写作 \`...field.audit()\`。
- \`plan\`、\`apply\` 和 \`clear\` 始终基于完整 Manifest，不按文件局部执行。
- 普通 \`apply\` 不做删除、字段类型迁移、collection 重命名或存量数据迁移。

## 命名约定

- collection 和 field 使用小写 \`snake_case\`。
- 业务 collection 默认使用复数名，例如 \`articles\`、\`products\`。
- 业务 collection 禁止使用 \`directus_\` 前缀。
- 主键使用 \`id\`。
- 内容状态字段使用 \`status\`。
- 手动排序字段使用 \`sort\`。
- 审计字段使用 \`...field.audit()\`。
- 业务时间字段使用 \`date_\` 前缀。
- 用户关系字段使用 \`user_\` 前缀。
- 布尔字段使用 \`is_\` 前缀。

## 禁止

- 发明 DSK 未公开的 helper、字段类型或导入路径。
- 把 Directus interface/display/special 当成数据库类型。
- 声明或修改 \`directus_*\` 系统 collection。
- 用 \`created_at\`、\`updated_at\`、\`created_by\`、\`updated_by\` 替代 Directus 标准审计字段。
- 用 JSON 数组保存文件 ID 或多用户 ID。
- 硬编码 Directus role、policy、user 等系统资源 UUID。
- 声明 Flow、Operation、Dashboard、Panel，当前版本不支持。

## 修改后检查

\`\`\`bash
pnpm dsk build
pnpm dsk validate
pnpm dsk plan
\`\`\`
`

const dskReadme = `# DSK 工作区

本目录保存可信的 TypeScript Schema/Resource DSL、JSON 配置、Seed 和生成产物。\`dsk build\` 会执行 DSL 并生成标准 JSON Manifest。

Schema 文件位于 \`schemas/\`，按业务组织源码；文件不会形成 Directus 命名空间，collection 名必须全局唯一。常用写法：

\`\`\`ts
import { collection, field } from '@deeptimes/directus-schema-kit'

export default collection({
  name: 'articles',
  label: '文章',
  fields: [field.string('title', { label: '标题', required: true })],
})
\`\`\`

系统资源按类型放在 \`resources/\`。定义中的敏感值必须使用 \`env('VARIABLE_NAME')\`，不得写入源码。

- \`config.json\`：项目路径、安全和校验配置。
- \`seeds/\`：严格 JSON seed，每个文件必须包含 \`schemaVersion\`。
- \`generated/manifest.json\`：由 \`dsk build\` 生成，禁止手工修改。
- \`../.ai/directus-schema-kit.md\`：给 Codex/AI 的 schema 编写规则。

\`plan/apply\` 仅消费 JSON Manifest，不执行 TypeScript DSL。
`

export function initializeWorkspace(projectRoot: string, dryRun = false): InitResult {
  const files = new Map<string, string>([
    ['dsk/config.json', JSON.stringify(defaultConfig, null, 2) + '\n'],
    ['dsk/README.md', dskReadme],
    ['dsk/schemas/example.ts', schemaExample],
    ['dsk/resources/folders.ts', resourceExample],
    ['dsk/resources/roles.ts', resourceExample],
    ['dsk/resources/policies.ts', resourceExample],
    ['dsk/resources/access.ts', resourceExample],
    ['dsk/resources/permissions.ts', resourceExample],
    ['dsk/resources/presets.ts', resourceExample],
    ['dsk/seeds/example/10-example.json', seedExample],
    ['.ai/directus-schema-kit.md', aiGuide],
  ])
  const directories = ['.ai', 'dsk/schemas', 'dsk/resources', 'dsk/seeds/example', 'dsk/generated']
  const result: InitResult = { created: [], preserved: [], dryRun }

  for (const directory of directories) {
    const absolute = path.join(projectRoot, directory)
    if (!existsSync(absolute) && !dryRun) mkdirSync(absolute, { recursive: true })
  }
  for (const [relative, content] of files) {
    const absolute = path.join(projectRoot, relative)
    if (existsSync(absolute)) {
      result.preserved.push(relative)
      continue
    }
    result.created.push(relative)
    if (!dryRun) writeFileSync(absolute, content, { encoding: 'utf8', flag: 'wx' })
  }
  return result
}
