import assert from 'node:assert/strict'
import test from 'node:test'
import { readCleanupSnapshot } from '../src/cleanup-reader.js'
import { DirectusReader } from '../src/directus.js'

function reader(overrides: Record<string, unknown> = {}): { reader: DirectusReader; requests: URL[] } {
  const requests: URL[] = []
  const values: Record<string, unknown> = {
    '/collections': [{ collection: 'old', schema: {} }, { collection: 'group', schema: null }],
    '/fields': [{ collection: 'old', field: 'key', type: 'uuid', schema: { is_primary_key: true } }],
    '/relations': [{ collection: 'directus_settings', field: 'project_logo', related_collection: 'directus_files' }, { collection: 'directus_shares', field: 'role', related_collection: 'directus_roles' }],
    '/users/me': { id: 'admin' }, '/settings': { id: 1, project_logo: 'logo' },
    '/users': [{ id: 'admin', role: 'admin-role' }],
    '/roles': [], '/policies': [], '/access': [], '/permissions': [], '/presets': [], '/files': [], '/folders': [],
    '/shares': [{ id: 'share', role: 'editor-role' }], '/items/old': [{ key: 'record' }],
    ...overrides,
  }
  const fetcher: typeof fetch = async (input, init) => {
    assert.equal(init?.method, 'GET')
    const url = new URL(String(input))
    requests.push(url)
    if (!(url.pathname in values)) throw new Error(`Unexpected endpoint: ${url.pathname}`)
    const value = values[url.pathname]
    return Response.json({ data: Array.isArray(value) && Number(url.searchParams.get('offset')) > 0 ? [] : value, meta: { filter_count: Array.isArray(value) ? value.length : value && typeof value === 'object' && (value as Record<string, unknown>).key ? 1 : 0 } })
  }
  return { reader: new DirectusReader('http://localhost:8055', 'secret', 1000, fetcher), requests }
}

test('读取清理快照覆盖未声明集合、系统资源和外部引用，跳过 group', async () => {
  const fixture = reader()
  const snapshot = await readCleanupSnapshot(fixture.reader)
  assert.equal(snapshot.currentUser, 'admin')
  assert.deepEqual(snapshot.items.old, [{ key: 'record' }])
  assert.equal(fixture.requests.some((url) => url.pathname === '/items/group'), false)
  assert.ok(snapshot.references.some((ref) => ref.collection === 'directus_shares' && ref.value === 'editor-role'))
  assert.ok(snapshot.references.some((ref) => ref.collection === 'directus_settings' && ref.value === 'logo'))
})

test('无法完整读取的引用源必须在写入前失败', async () => {
  const fixture = reader({ '/relations': [{ collection: 'directus_unknown', field: 'role', related_collection: 'directus_roles' }] })
  await assert.rejects(() => readCleanupSnapshot(fixture.reader), /directus_unknown/)
})

test('快照只请求系统资源的持久字段，避免反向关联数组变化误判管理员授权被改写', async () => {
  const fixture = reader({
    '/fields': [
      { collection: 'old', field: 'key', type: 'uuid', schema: { is_primary_key: true } },
      { collection: 'directus_roles', field: 'id', type: 'uuid', schema: { is_primary_key: true } },
      { collection: 'directus_roles', field: 'name', type: 'string', schema: {} },
      { collection: 'directus_roles', field: 'users', type: 'alias', schema: null },
    ],
  })
  await readCleanupSnapshot(fixture.reader)
  const request = fixture.requests.find((url) => url.pathname === '/roles')!
  assert.equal(request.searchParams.get('fields'), 'id,name')
})

test('读取保留用户之间的自定义引用与 M2A discriminator', async () => {
  const fixture = reader({ '/relations': [
    { collection: 'directus_users', field: 'inviter', related_collection: 'directus_users' },
    { collection: 'old', field: 'item', related_collection: null, meta: { one_collection_field: 'collection', one_allowed_collections: ['old'] } },
  ], '/users': [{ id: 'admin', inviter: 'ordinary' }] })
  const snapshot = await readCleanupSnapshot(fixture.reader)
  assert.ok(snapshot.references.some((ref) => ref.field === 'inviter'))
  assert.ok(fixture.requests.find((url) => url.pathname === '/items/old')!.searchParams.get('fields')!.split(',').includes('collection'))
})

test('读取全部业务持久字段参与摘要，能发现确认期间普通字段变化', async () => {
  const fixture = reader({ '/fields': [
    { collection: 'old', field: 'key', type: 'uuid', schema: { is_primary_key: true } },
    { collection: 'old', field: 'title', type: 'string', schema: {} },
    { collection: 'old', field: 'children', type: 'alias', schema: null },
  ] })
  await readCleanupSnapshot(fixture.reader)
  assert.equal(fixture.requests.find((url) => url.pathname === '/items/old')!.searchParams.get('fields'), 'key,title')
})

test('自定义 singleton 按对象读取；空 singleton 不把默认值当真实记录', async () => {
  for (const key of ['record', null]) {
    const fixture = reader({ '/collections': [{ collection: 'old', schema: {}, meta: { singleton: true } }], '/items/old': { key } })
    const snapshot = await readCleanupSnapshot(fixture.reader)
    assert.deepEqual(snapshot.items.old, key ? [{ key }] : [])
  }
})

test('保留 Flow 引用普通用户也需要预检，不能通过删用户静默置空', async () => {
  const fixture = reader({ '/relations': [{ collection: 'directus_flows', field: 'user_created', related_collection: 'directus_users' }], '/flows': [{ id: 'flow', user_created: 'ordinary' }] })
  const snapshot = await readCleanupSnapshot(fixture.reader)
  assert.ok(snapshot.references.some((ref) => ref.collection === 'directus_flows' && ref.value === 'ordinary'))
})

test('Directus 12 空 deployment 不误阻断；存在配置但不能完整枚举子项时拒绝清理', async () => {
  const relation = { collection: 'directus_deployment_projects', field: 'user_created', related_collection: 'directus_users' }
  const empty = reader({ '/relations': [relation], '/deployments': [] })
  await readCleanupSnapshot(empty.reader)
  const configured = reader({ '/relations': [relation], '/deployments': [{ id: 'deployment', user_created: 'admin' }] })
  await assert.rejects(() => readCleanupSnapshot(configured.reader), /deployment/)
})
