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

const dskReadme = `# DSK 工作区

本目录保存可信的 TypeScript Schema/Resource DSL、JSON 配置、Seed 和生成产物。\`dsk build\` 会执行 DSL 并生成标准 JSON Manifest。

Schema 文件位于 \`schema/\`，按业务组织源码；文件不会形成 Directus 命名空间，collection 名必须全局唯一。常用写法：

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

\`plan/apply\` 仅消费 JSON Manifest，不执行 TypeScript DSL。
`

export function initializeWorkspace(projectRoot: string, dryRun = false): InitResult {
  const files = new Map<string, string>([
    ['dsk/config.json', JSON.stringify(defaultConfig, null, 2) + '\n'],
    ['dsk/README.md', dskReadme],
    ['dsk/schema/example.ts', schemaExample],
    ['dsk/resources/folders.ts', resourceExample],
    ['dsk/resources/roles.ts', resourceExample],
    ['dsk/resources/policies.ts', resourceExample],
    ['dsk/resources/access.ts', resourceExample],
    ['dsk/resources/permissions.ts', resourceExample],
    ['dsk/resources/presets.ts', resourceExample],
    ['dsk/seeds/example/10-example.json', seedExample],
  ])
  const directories = ['dsk/schema', 'dsk/resources', 'dsk/seeds/example', 'dsk/generated']
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
