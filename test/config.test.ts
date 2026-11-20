import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { defaultConfig, loadConfig } from '../src/config.js'

function project(config: unknown): string {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'dsk-config-'))
  mkdirSync(path.join(directory, 'dsk'))
  writeFileSync(path.join(directory, 'dsk/config.json'), JSON.stringify(config, null, 2))
  return directory
}

test('config 接受显式 development 环境和 allowedHosts', () => {
  const loaded = loadConfig(project({
    ...defaultConfig,
    safety: { environment: 'development', allowedHosts: ['172.16.0.0/12'] },
  }))
  assert.equal(loaded.config.safety?.environment, 'development')
  assert.deepEqual(loaded.config.safety?.allowedHosts, ['172.16.0.0/12'])
})

test('config 拒绝非 development 环境', () => {
  assert.throws(
    () => loadConfig(project({ ...defaultConfig, safety: { environment: 'production' } })),
    /配置文件校验失败/,
  )
})

test('config 允许省略 environment 以支持离线命令，但在线命令会拒绝', () => {
  const loaded = loadConfig(project({ ...defaultConfig, safety: { clearEnabled: true } }))
  assert.equal(loaded.config.safety?.environment, undefined)
})

test('config 校验 allowedHosts 类型', () => {
  assert.throws(
    () => loadConfig(project({ ...defaultConfig, safety: { environment: 'development', allowedHosts: [1] } })),
    /配置文件校验失败/,
  )
})
