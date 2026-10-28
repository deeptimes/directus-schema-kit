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

test('清理读取按实际页长翻页，不受服务端 limit 上限截断', async () => {
  const offsets: number[] = []
  const fetcher: typeof fetch = async (input) => {
    const url = new URL(String(input))
    offsets.push(Number(url.searchParams.get('offset')))
    assert.equal(url.searchParams.get('sort'), 'id')
    return Response.json({ data: Number(url.searchParams.get('offset')) === 0 ? [{ id: 'a' }] : Number(url.searchParams.get('offset')) === 1 ? [{ id: 'b' }] : [] })
  }
  const reader = new DirectusReader('http://localhost:8055', 'secret', 1000, fetcher)
  assert.deepEqual(await reader.listAll('users'), [{ id: 'a' }, { id: 'b' }])
  assert.deepEqual(offsets, [0, 1, 2])
})

test('清理读取发现分页重复记录即拒绝，不生成不完整范围', async () => {
  const reader = new DirectusReader('http://localhost:8055', 'secret', 1000, async () => Response.json({ data: [{ id: 'a' }] }))
  await assert.rejects(() => reader.listAll('users'), /分页/)
})

test('清空记录使用逐个主键 DELETE，不发送无范围删除请求', async () => {
  const requests: Array<{ url: string; method: string | undefined }> = []
  const writer = new DirectusWriter('http://localhost:8055', 'secret', 1000, 1, async (input, init) => {
    requests.push({ url: String(input), method: init?.method })
    return new Response(null, { status: 204 })
  })
  await writer.deleteItem('articles', 'one/two')
  assert.deepEqual(requests, [{ url: 'http://localhost:8055/items/articles/one%2Ftwo', method: 'DELETE' }])
})

test('清理权限只读取有主键的持久记录并核对总数，不纳入内置虚拟权限', async () => {
  const fetcher: typeof fetch = async (input) => {
    const url = new URL(String(input))
    assert.equal(url.searchParams.get('filter[id][_nnull]'), 'true')
    assert.equal(url.searchParams.get('meta'), 'filter_count')
    return Response.json({ data: [{ id: 7, policy: 'editor' }, { system: true, collection: 'directus_users', policy: null }], meta: { filter_count: 1 } })
  }
  const reader = new DirectusReader('http://localhost', 'secret', 1000, fetcher)
  assert.deepEqual(await reader.listStoredPermissions(), [{ id: 7, policy: 'editor' }])
})

test('许可或接口过滤导致权限未完整返回时阻断，不能静默遗漏', async () => {
  const reader = new DirectusReader('http://localhost', 'secret', 1000, async () => Response.json({ data: [], meta: { filter_count: 1 } }))
  await assert.rejects(() => reader.listStoredPermissions(), /权限.*完整/)
})
