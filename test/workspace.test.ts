import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { buildCommand, initCommand, validateCommand } from '../src/commands.js'

function project(): string {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'dsk-test-'))
  writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ dependencies: { directus: '11.17.4' } }))
  return directory
}

test('init 幂等创建工作区并生成初始 Manifest', async () => {
  const cwd = project()
  const context = { cwd, packageVersion: '0.1.0' }
  const first = await initCommand(context, false)
  const second = await initCommand(context, false)

  assert.ok(first.created.includes('.dsk/config.json'))
  assert.equal(second.created.length, 0)
  assert.ok(second.preserved.includes('dsk/schema/example.ts'))
  const manifest = JSON.parse(readFileSync(path.join(cwd, '.dsk/generated/manifest.json'), 'utf8')) as { manifestVersion: number; source: { digest: string } }
  assert.equal(manifest.manifestVersion, 1)
  assert.match(manifest.source.digest, /^[a-f0-9]{64}$/)
})

test('build --check 和 validate 检测源码新鲜度', async () => {
  const cwd = project()
  const context = { cwd, packageVersion: '0.1.0' }
  await initCommand(context, false)
  const checked = await buildCommand(context, true)
  assert.equal(checked.changed, false)
  const result = await validateCommand(context)
  assert.equal(result.collections, 0)

  writeFileSync(path.join(cwd, 'dsk/schema/example.ts'), 'export default []\n// changed\n')
  await assert.rejects(() => validateCommand(context), /工作区校验失败/)
  await assert.rejects(() => buildCommand(context, true), /Manifest 与 DSL 源码不一致/)
})

test('init --dry-run 不写入文件', async () => {
  const cwd = project()
  const result = await initCommand({ cwd, packageVersion: '0.1.0' }, true)
  assert.ok(result.created.length > 0)
  assert.throws(() => readFileSync(path.join(cwd, '.dsk/config.json')))
})

test('拒绝非 11.17.4 的 Directus 项目', async () => {
  const cwd = mkdtempSync(path.join(os.tmpdir(), 'dsk-version-test-'))
  writeFileSync(path.join(cwd, 'package.json'), JSON.stringify({ dependencies: { directus: '12.0.2' } }))
  await assert.rejects(() => initCommand({ cwd, packageVersion: '0.1.0' }, true), /不支持 Directus 12\.0\.2/)
})
