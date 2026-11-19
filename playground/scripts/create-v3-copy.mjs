#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const playground = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repository = path.resolve(playground, '..')
const destination = path.join(playground, '.v3-runtime')
const force = process.argv.includes('--force')
const install = process.argv.includes('--install')

if (existsSync(destination)) {
  if (!force) {
    console.error(`目标已存在: ${destination}\n如需重建，请加 --force（会删除该目录）`)
    process.exit(1)
  }
  rmSync(destination, { recursive: true, force: true })
}

mkdirSync(destination, { recursive: true })

for (const item of ['dsk', 'docs', 'extensions', '.env', '.env.example', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'tsconfig.json', 'README.md']) {
  const source = path.join(playground, item)
  if (existsSync(source)) cpSync(source, path.join(destination, item), { recursive: true })
}

mkdirSync(path.join(destination, 'database'), { recursive: true })
mkdirSync(path.join(destination, 'uploads'), { recursive: true })

const packagePath = path.join(destination, 'package.json')
const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'))
packageJson.name = 'dsk-v3-playground'
packageJson.version = '0.0.0'
packageJson.dependencies = { ...packageJson.dependencies, directus: '12.7.0' }
packageJson.devDependencies = {
  ...packageJson.devDependencies,
  '@deeptimes/directus-schema-kit': `link:${repository}`,
}
packageJson.scripts = {
  ...packageJson.scripts,
  'dev:v3': 'PORT=8056 directus start',
}
delete packageJson.scripts['v3:copy']
writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`)

const workspacePath = path.join(destination, 'pnpm-workspace.yaml')
if (existsSync(workspacePath)) {
  const workspace = readFileSync(workspacePath, 'utf8').replaceAll('../docs/patches/', '../../docs/patches/')
  writeFileSync(workspacePath, workspace)
}

const envPath = path.join(destination, '.env')
if (!existsSync(envPath)) {
  console.error(`缺少 ${envPath}，请先从 playground/.env.example 准备本地凭证`)
  process.exit(1)
}

const env = readFileSync(envPath, 'utf8')
  .replace(/^DB_FILENAME=.*$/m, 'DB_FILENAME=./database/v3.db')
  .replace(/^PUBLIC_URL=.*$/m, 'PUBLIC_URL=http://127.0.0.1:8056')
  .replace(/^WEBSOCKETS_ENABLED=.*$/m, 'WEBSOCKETS_ENABLED=false')
const example = readFileSync(path.join(playground, '.env.example'), 'utf8')

function exampleValue(key) {
  const match = new RegExp(`^${key}=(.*)$`, 'm').exec(example)
  return match?.[1]?.trim() ?? ''
}

const additions = []
if (!/^ADMIN_EMAIL=/m.test(env)) additions.push(`ADMIN_EMAIL=${exampleValue('ADMIN_EMAIL') || 'admin@example.com'}`)
if (!/^ADMIN_PASSWORD=/m.test(env)) additions.push(`ADMIN_PASSWORD=${exampleValue('ADMIN_PASSWORD') || 'change-this-password'}`)
// 新数据库需要新的静态 token；不沿用旧 playground 的 token。
const withoutToken = env.replace(/^ADMIN_TOKEN=.*$/m, '').trimEnd()
additions.push(`ADMIN_TOKEN=${randomBytes(32).toString('hex')}`)
const withPort = /^PORT=/m.test(withoutToken) ? withoutToken : `${withoutToken}\nPORT=8056`
writeFileSync(envPath, `${withPort.trimEnd()}\n${additions.join('\n')}\n`)

console.log(`已创建 v3 运行时副本: ${destination}`)
console.log('  Directus: 12.7.0')
console.log('  DSK: link:' + repository)
console.log('  DB: ./database/v3.db')
console.log('  URL: http://127.0.0.1:8056')
console.log('')
console.log('下一步:')
console.log(`  cd ${path.relative(process.cwd(), destination)}`)
console.log('  pnpm install')
console.log('  pnpm bootstrap')
console.log('  pnpm dev:v3')

if (install) {
  const { spawnSync } = await import('node:child_process')
  const result = spawnSync('pnpm', ['install'], { cwd: destination, stdio: 'inherit' })
  process.exit(result.status ?? 1)
}
