import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { defaultConfig } from '../src/config.js'
import { directusConnection, resolveHostPolicy, validateAllowedHosts } from '../src/env.js'
import type { DskConfig } from '../src/types.js'

function config(safety: DskConfig['safety'] = { environment: 'development' }): DskConfig {
  return {
    ...defaultConfig,
    env: { file: '.env', allowedVariables: ['PUBLIC_URL', 'ADMIN_TOKEN'] },
    safety,
  }
}

function connection(url: string, safety: DskConfig['safety'] = { environment: 'development' }): string {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'dsk-env-'))
  writeFileSync(path.join(directory, '.env'), `PUBLIC_URL=${url}\nADMIN_TOKEN=test-secret\n`)
  return directusConnection(config(safety), directory).url
}

test('默认允许 loopback、10/8、192.168/16 和 .local', () => {
  for (const url of [
    'http://localhost:8055',
    'http://127.0.0.1:8055',
    'http://[::1]:8055',
    'http://10.1.2.3:8055',
    'http://192.168.1.20:8055',
    'http://dev.local:8055',
    'https://dev.local',
  ]) {
    assert.equal(connection(url), url.replace(/\/$/, ''))
  }
})

test('默认拒绝 172 网段、公网 IP 和公网域名', () => {
  for (const url of ['http://172.16.1.1:8055', 'http://172.31.255.255:8055', 'http://8.8.8.8:8055', 'http://cms.example.com']) {
    assert.throws(() => connection(url), /拒绝连接非开发 Directus 地址/)
  }
})

test('allowedHosts 可以显式放开 172 私网或精确地址', () => {
  assert.equal(
    connection('http://172.16.1.1:8055', { environment: 'development', allowedHosts: ['172.16.0.0/12'] }),
    'http://172.16.1.1:8055',
  )
  assert.equal(
    connection('http://172.20.0.1:8055', { environment: 'development', allowedHosts: ['172.20.0.0/24'] }),
    'http://172.20.0.1:8055',
  )
})

test('allowedHosts 不允许公网地址、公网域名或过宽网段', () => {
  for (const entry of ['8.8.8.8', '0.0.0.0/0', '10.0.0.0/4', 'cms.example.com']) {
    assert.throws(() => validateAllowedHosts([entry]), /safety\.allowedHosts/)
  }
  assert.doesNotThrow(() => validateAllowedHosts([
    'localhost',
    '*.local',
    '127.0.0.0/8',
    '10.0.0.0/8',
    '192.168.1.0/24',
    '172.16.0.0/12',
  ]))
})

test('缺少 safety.environment 或非 development 时拒绝连接', () => {
  assert.throws(() => connection('http://127.0.0.1:8055', { clearEnabled: true }), /safety\.environment/)
  assert.throws(() => connection('http://127.0.0.1:8055', { environment: 'production' as never }), /safety\.environment/)
})

test('resolveHostPolicy 返回命中的规则', () => {
  assert.deepEqual(resolveHostPolicy('127.0.0.1'), { allowed: true, matchedRule: '127.0.0.0/8' })
  assert.deepEqual(resolveHostPolicy('10.1.2.3'), { allowed: true, matchedRule: '10.0.0.0/8' })
  assert.deepEqual(resolveHostPolicy('192.168.1.2'), { allowed: true, matchedRule: '192.168.0.0/16' })
  assert.deepEqual(resolveHostPolicy('dev.local'), { allowed: true, matchedRule: '*.local' })
  assert.equal(resolveHostPolicy('172.16.1.1').allowed, false)
  assert.equal(resolveHostPolicy('8.8.8.8').allowed, false)
})

test('拒绝非 http/https 协议', () => {
  assert.throws(() => connection('ftp://127.0.0.1:8055'), /协议/)
})
