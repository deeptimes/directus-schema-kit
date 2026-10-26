import assert from 'node:assert/strict'
import test from 'node:test'
import { DirectusReader, DirectusWriter } from '../src/directus.js'

test('DirectusReader 并发读取三个端点且只使用 GET', async () => {
  const requests: Array<{ url: string; method: string | undefined; authorization: string | null }> = []
  const fetcher: typeof fetch = async (input, init) => {
    const headers = new Headers(init?.headers)
    requests.push({ url: String(input), method: init?.method, authorization: headers.get('authorization') })
    return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  const state = await new DirectusReader('http://127.0.0.1:8055', 'secret', 10_000, fetcher).readState()
  assert.deepEqual(state, { collections: [], fields: [], relations: [] })
  assert.deepEqual(requests.map((item) => new URL(item.url).pathname).sort(), ['/collections', '/fields', '/relations'])
  assert.equal(requests.every((item) => item.method === 'GET'), true)
  assert.equal(requests.every((item) => item.authorization === 'Bearer secret'), true)
})

test('DirectusWriter 对可恢复错误有限重试', async () => {
  let attempts = 0
  const delays: number[] = []
  const fetcher: typeof fetch = async () => {
    attempts++
    return attempts < 3
      ? new Response(JSON.stringify({ errors: [{ message: 'temporary' }] }), { status: 503 })
      : new Response(null, { status: 204 })
  }
  const writer = new DirectusWriter('http://localhost:8055', 'secret', 1000, 3, fetcher, async (delay) => { delays.push(delay) })
  await writer.updateCollection('articles', { icon: 'article' })
  assert.equal(attempts, 3)
  assert.deepEqual(delays, [250, 500])
})

test('DirectusWriter 不重试确定性 4xx', async () => {
  let attempts = 0
  const fetcher: typeof fetch = async () => {
    attempts++
    return new Response(JSON.stringify({ errors: [{ message: 'invalid payload' }] }), { status: 400 })
  }
  const writer = new DirectusWriter('http://localhost:8055', 'secret', 1000, 3, fetcher, async () => {})
  await assert.rejects(() => writer.updateCollection('articles', { icon: 'article' }), /写入 Directus 失败/)
  assert.equal(attempts, 1)
})

test('DirectusWriter 从错误详情中脱敏 token', async () => {
  const secret = 'token-that-must-not-leak'
  const fetcher: typeof fetch = async () => new Response(JSON.stringify({ errors: [{ message: `invalid ${secret}` }] }), { status: 400 })
  const writer = new DirectusWriter('http://localhost:8055', secret, 1000, 1, fetcher, async () => {})
  await assert.rejects(
    () => writer.updateCollection('articles', { icon: 'article' }),
    (error: unknown) => {
      const value = error as { message?: string; details?: string[] }
      const serialized = JSON.stringify({ message: value.message, details: value.details })
      return !serialized.includes(secret) && serialized.includes('[REDACTED]')
    },
  )
})

test('DirectusReader 根据实际服务版本与许可判断自定义权限规则能力', async () => {
  for (const fixture of [
    { version: '11.17.4', entitlement: { default: false }, enabled: true },
    { version: '12.5.1', entitlement: { default: false }, enabled: false },
    { version: '12.5.1', entitlement: { default: true }, enabled: true },
    { version: '12.5.1', entitlement: { default: false, override: true }, enabled: true },
    { version: '12.5.1', entitlement: { default: true, override: false }, enabled: false },
  ]) {
    const fetcher: typeof fetch = async (input, init) => {
      assert.equal(init?.method, 'GET')
      const pathname = new URL(String(input)).pathname
      if (pathname === '/server/info') return Response.json({ data: { version: fixture.version } })
      assert.equal(pathname, '/license')
      assert.notEqual(fixture.version, '11.17.4')
      return Response.json({ data: { status: 'active', entitlements: { custom_permission_rules_enabled: fixture.entitlement } } })
    }
    const reader = new DirectusReader('http://localhost:8055', 'secret', 1000, fetcher)
    assert.equal(await reader.getCustomPermissionRulesEnabled(), fixture.enabled)
  }
})

test('DirectusReader 不将缺失许可信息或查询失败当作支持自定义规则', async () => {
  for (const response of [
    Response.json({ data: { status: 'active', entitlements: {} } }),
    Response.json({ errors: [{ message: 'forbidden' }] }, { status: 403 }),
  ]) {
    const fetcher: typeof fetch = async (input) => new URL(String(input)).pathname === '/server/info'
      ? Response.json({ data: { version: '12.5.1' } })
      : response
    const reader = new DirectusReader('http://localhost:8055', 'secret', 1000, fetcher)
    await assert.rejects(() => reader.getCustomPermissionRulesEnabled())
  }
})
