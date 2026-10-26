import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { buildCommand, initCommand, validateCommand } from '../src/commands.js'
import { DskError } from '../src/errors.js'

function project(): string {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'dsk-test-'))
  writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ dependencies: { directus: '11.17.4' } }))
  return directory
}

test('init 幂等创建工作区并生成初始 Manifest', async () => {
  const cwd = project()
  const context = { cwd, packageVersion: '1.0.0' }
  const first = await initCommand(context, false)
  const second = await initCommand(context, false)

  assert.ok(first.created.includes('dsk/config.json'))
  assert.ok(first.created.includes('docs/directus-schema-kit.md'))
  assert.equal(existsSync(path.join(cwd, '.ai')), false)
  assert.equal(existsSync(path.join(cwd, 'docs/directus-schema-kit.md')), true)
  assert.equal(second.created.length, 0)
  assert.ok(second.preserved.includes('dsk/schemas/example.ts'))
  assert.ok(second.preserved.includes('docs/directus-schema-kit.md'))
  const manifest = JSON.parse(readFileSync(path.join(cwd, 'dsk/generated/manifest.json'), 'utf8')) as { manifestVersion: number; source: { digest: string } }
  assert.equal(manifest.manifestVersion, 1)
  assert.match(manifest.source.digest, /^[a-f0-9]{64}$/)
})

test('build --check 和 validate 检测源码新鲜度', async () => {
  const cwd = project()
  const context = { cwd, packageVersion: '1.0.0' }
  await initCommand(context, false)
  const checked = await buildCommand(context, true)
  assert.equal(checked.changed, false)
  const result = await validateCommand(context)
  assert.equal(result.collections, 0)

  writeFileSync(path.join(cwd, 'dsk/schemas/example.ts'), 'export default []\n// changed\n')
  await assert.rejects(() => validateCommand(context), /工作区校验失败/)
  await assert.rejects(() => buildCommand(context, true), /Manifest 与 DSL 源码不一致/)
})

test('init --dry-run 不写入文件', async () => {
  const cwd = project()
  const result = await initCommand({ cwd, packageVersion: '1.0.0' }, true)
  assert.ok(result.created.length > 0)
  assert.throws(() => readFileSync(path.join(cwd, 'dsk/config.json')))
  assert.ok(result.created.includes('docs/directus-schema-kit.md'))
  assert.equal(existsSync(path.join(cwd, 'docs')), false)
  assert.equal(existsSync(path.join(cwd, '.ai')), false)
})

test('拒绝不受支持的 Directus 主版本', async () => {
  const cwd = mkdtempSync(path.join(os.tmpdir(), 'dsk-version-test-'))
  writeFileSync(path.join(cwd, 'package.json'), JSON.stringify({ dependencies: { directus: '13.0.0' } }))
  await assert.rejects(() => initCommand({ cwd, packageVersion: '1.0.0' }, true), /不支持 Directus 13\.0\.0/)
})

test('接受 Directus 11.x 和 12.x 的精确版本及常用版本范围', async () => {
  for (const version of ['11.17.4', '^11.17.4', '12.5.1', '~12.5.1']) {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'dsk-version-test-'))
    writeFileSync(path.join(cwd, 'package.json'), JSON.stringify({ dependencies: { directus: version } }))
    await assert.doesNotReject(() => initCommand({ cwd, packageVersion: '1.0.0' }, true), version)
  }
})

test('build 将 Relation Blueprint 完整展开为无模块 Manifest V1', async () => {
  const cwd = project()
  const context = { cwd, packageVersion: '1.0.0' }
  await initCommand(context, false)
  const api = path.resolve('src/index.ts')
  writeFileSync(path.join(cwd, 'dsk/schemas/example.ts'), `
    import { collection, defineSchema, relation } from ${JSON.stringify(api)}
    export default defineSchema({
      collections: [
        collection({ name: 'articles', label: 'Articles' }),
        collection({ name: 'tags', label: 'Tags' }),
      ],
      relations: [relation.m2m({ collection: 'articles', field: 'tags', relatedCollection: 'tags' })],
    })
  `)
  await buildCommand(context, false)
  const manifest = JSON.parse(readFileSync(path.join(cwd, 'dsk/generated/manifest.json'), 'utf8')) as {
    manifestVersion: number
    collections: Array<{ collection: string }>
    fields: Array<{ collection: string; field: string; type: string }>
    relations: Array<{ collection: string; field: string }>
  }
  assert.equal(manifest.manifestVersion, 1)
  assert.equal(manifest.collections.some((item) => item.collection === 'articles_tags'), true)
  assert.equal(manifest.fields.some((item) => item.collection === 'articles' && item.field === 'tags' && item.type === 'alias'), true)
  assert.deepEqual(manifest.relations.map((item) => `${item.collection}.${item.field}`), ['articles_tags.articles_id', 'articles_tags.tags_id'])
})

test('跨文件重复 collection 报告全部来源', async () => {
  const cwd = project()
  const context = { cwd, packageVersion: '1.0.0' }
  await initCommand(context, false)
  const api = path.resolve('src/index.ts')
  const definition = `import { collection } from ${JSON.stringify(api)}\nexport default collection({ name: 'articles', label: 'Articles' })\n`
  writeFileSync(path.join(cwd, 'dsk/schemas/first.ts'), definition)
  writeFileSync(path.join(cwd, 'dsk/schemas/second.ts'), definition)
  await assert.rejects(
    () => buildCommand(context, false),
    (error: unknown) => error instanceof DskError
      && error.details.some((detail) => detail.includes('集合重复定义: articles') && detail.includes('first.ts') && detail.includes('second.ts')),
  )
})


test('init 保留用户已有的 docs 规则与旧 .ai 文件', async () => {
  const cwd = project()
  mkdirSync(path.join(cwd, 'docs'))
  mkdirSync(path.join(cwd, '.ai'))
  const guide = path.join(cwd, 'docs/directus-schema-kit.md')
  const legacy = path.join(cwd, '.ai/directus-schema-kit.md')
  writeFileSync(guide, '# 项目自定义规则\n')
  writeFileSync(legacy, '# 旧规则与项目备注\n')
  const result = await initCommand({ cwd, packageVersion: '1.0.0' }, false)
  assert.ok(result.preserved.includes('docs/directus-schema-kit.md'))
  assert.equal(readFileSync(guide, 'utf8'), '# 项目自定义规则\n')
  assert.equal(readFileSync(legacy, 'utf8'), '# 旧规则与项目备注\n')
})

test('旧项目重新 init 时创建 docs 规则并保留旧 .ai 内容', async () => {
  const cwd = project()
  mkdirSync(path.join(cwd, '.ai'))
  const legacy = path.join(cwd, '.ai/directus-schema-kit.md')
  writeFileSync(legacy, '# 旧规则与项目备注\n')
  const result = await initCommand({ cwd, packageVersion: '1.0.0' }, false)
  assert.ok(result.created.includes('docs/directus-schema-kit.md'))
  assert.equal(existsSync(path.join(cwd, 'docs/directus-schema-kit.md')), true)
  assert.equal(readFileSync(legacy, 'utf8'), '# 旧规则与项目备注\n')
})
