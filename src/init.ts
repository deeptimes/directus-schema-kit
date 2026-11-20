import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defaultConfig } from './config.js'

const templateDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../docs/templates/dsk')

function template(name: string): string {
  return readFileSync(path.join(templateDirectory, name), 'utf8')
}

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

const settingsExample = `/** Directus settings 是 singleton，只允许受控 scalar 字段；按需添加 project_name 等。 */
export default {
  type: 'settings',
  key: 'settings',
  data: {},
}
`

const seedExample = JSON.stringify({ schemaVersion: 1, collection: 'example', upsertBy: ['slug'], items: [] }, null, 2) + '\n'

export function initializeWorkspace(projectRoot: string, dryRun = false): InitResult {
  const files = new Map<string, string>([
    ['dsk/config.json', JSON.stringify(defaultConfig, null, 2) + '\n'],
    ['dsk/README.md', template('README.md')],
    ['dsk/docs/README.md', template('docs/README.md')],
    ['dsk/docs/ai-guide.md', template('docs/ai-guide.md')],
    ['dsk/schemas/example.ts', schemaExample],
    ['dsk/resources/folders.ts', resourceExample],
    ['dsk/resources/roles.ts', resourceExample],
    ['dsk/resources/policies.ts', resourceExample],
    ['dsk/resources/access.ts', resourceExample],
    ['dsk/resources/permissions.ts', resourceExample],
    ['dsk/resources/presets.ts', resourceExample],
    ['dsk/resources/settings.ts', settingsExample],
    ['dsk/seeds/example/10-example.json', seedExample],
  ])
  const directories = ['dsk/docs', 'dsk/schemas', 'dsk/resources', 'dsk/seeds/example', 'dsk/generated']
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
