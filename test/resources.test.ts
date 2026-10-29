import assert from 'node:assert/strict'
import test from 'node:test'
import { syncResources, type ResourceReader, type ResourceWriter } from '../src/resources.js'
import { ref, systemRef } from '../src/index.js'
import type { ResourceDefinition, ResourceType } from '../src/types.js'

class MemoryResources implements ResourceReader, ResourceWriter {
  data = new Map<string, Array<Record<string, unknown>>>()
  writes: string[] = []

  async listSystemResource(endpoint: string): Promise<Array<Record<string, unknown>>> {
    return [...(this.data.get(endpoint) ?? [])]
  }

  async createSystemResource(endpoint: string, data: Record<string, unknown>): Promise<Record<string, unknown>> {
    const rows = this.data.get(endpoint) ?? []
    const saved = { ...data, id: `${endpoint}-${rows.length + 1}` }
    rows.push(saved)
    this.data.set(endpoint, rows)
    this.writes.push(`create:${endpoint}`)
    return saved
  }

  async updateSystemResource(endpoint: string, id: string | number, data: Record<string, unknown>): Promise<Record<string, unknown>> {
    this.writes.push(`update:${endpoint}.${id}`)
    const saved = { ...data, id }
    const rows = this.data.get(endpoint) ?? []
    const index = rows.findIndex((row) => row.id === id)
    if (index >= 0) rows[index] = { ...rows[index], ...saved }
    return saved
  }

  async deleteSystemResource(endpoint: string, id: string | number): Promise<void> {
    this.writes.push(`delete:${endpoint}.${id}`)
    this.data.set(endpoint, (this.data.get(endpoint) ?? []).filter((row) => row.id !== id))
  }
}

function definitions(overrides: Partial<Record<ResourceType, ResourceDefinition[]>> = {}): Record<ResourceType, ResourceDefinition[]> {
  return { folders: [], roles: [], policies: [], access: [], permissions: [], presets: [], translations: [], ...overrides }
}

test('系统资源按依赖顺序创建并解析稳定引用', async () => {
  const store = new MemoryResources()
  const result = await syncResources({
    definitions: definitions({
      folders: [
        { type: 'folders', key: 'child', data: { name: 'Child', parent: ref('folders.root') } },
        { type: 'folders', key: 'root', data: { name: 'Root', parent: null } },
      ],
      roles: [{ type: 'roles', key: 'editor', data: { name: 'Editor', icon: 'edit' } }],
      policies: [{ type: 'policies', key: 'editor', data: { name: 'Editor Policy' } }],
      access: [{ type: 'access', key: 'editor', data: { role: ref('roles.editor'), policy: ref('policies.editor'), user: null } }],
      permissions: [{ type: 'permissions', key: 'editor-read', data: { policy: ref('policies.editor'), collection: 'articles', action: 'read' } }],
    }),
    reader: store,
    writer: store,
  })
  assert.equal(result.status, 'success')
  assert.deepEqual(store.writes, ['create:folders', 'create:folders', 'create:roles', 'create:policies', 'create:access', 'create:permissions'])
  assert.equal(store.data.get('folders')?.[1]?.parent, 'folders-1')
  assert.equal(store.data.get('permissions')?.[0]?.policy, 'policies-1')
})

test('系统 Public policy 引用解析现有资源且不创建或更新 policy', async () => {
  const store = new MemoryResources()
  store.data.set('policies', [{ id: 'public-policy', name: '$t:public_label' }])
  const result = await syncResources({
    definitions: definitions({
      permissions: [{
        type: 'permissions', key: 'public-articles-read',
        data: { policy: systemRef('policies.public'), collection: 'articles', action: 'read', permissions: {}, fields: ['*'] },
      }],
    }),
    reader: store,
    writer: store,
  })
  assert.equal(result.status, 'success')
  assert.deepEqual(store.writes, ['create:permissions'])
  assert.equal(store.data.get('permissions')?.[0]?.policy, 'public-policy')
})

test('系统 Public policy 缺失时在写入前失败', async () => {
  const store = new MemoryResources()
  await assert.rejects(
    () => syncResources({
      definitions: definitions({
        permissions: [{ type: 'permissions', key: 'public-read', data: { policy: systemRef('policies.public'), collection: 'articles', action: 'read' } }],
      }),
      reader: store,
      writer: store,
    }),
    /无法唯一解析系统资源 policies\.public/,
  )
  assert.deepEqual(store.writes, [])
})

test('显式删除没有确认时整体阻断', async () => {
  const store = new MemoryResources()
  store.data.set('roles', [{ id: 'role-1', name: 'Legacy' }])
  const result = await syncResources({
    definitions: definitions({ roles: [{ type: 'roles', key: 'legacy', data: { name: 'Legacy' }, delete: true }] }),
    reader: store,
    writer: store,
  })
  assert.equal(result.status, 'blocked')
  assert.deepEqual(store.writes, [])
})

test('重复业务键产生 conflict 且不写入', async () => {
  const store = new MemoryResources()
  store.data.set('roles', [{ id: '1', name: 'Duplicate' }, { id: '2', name: 'Duplicate' }])
  const result = await syncResources({
    definitions: definitions({ roles: [{ type: 'roles', key: 'duplicate', data: { name: 'Duplicate' } }] }),
    reader: store,
    writer: store,
  })
  assert.equal(result.status, 'blocked')
  assert.equal(result.operations[0]?.action, 'conflict')
})

test('关联资源删除按依赖逆序且不会重复执行', async () => {
  const store = new MemoryResources()
  store.data.set('roles', [{ id: 'role-1', name: 'Legacy' }])
  store.data.set('permissions', [{ id: 'permission-1', role: 'role-1', collection: 'articles', action: 'read' }])
  const result = await syncResources({
    definitions: definitions({
      roles: [{ type: 'roles', key: 'legacy', data: { name: 'Legacy' }, delete: true }],
      permissions: [{ type: 'permissions', key: 'legacy-read', data: { role: ref('roles.legacy'), collection: 'articles', action: 'read' }, delete: true }],
    }),
    reader: store, writer: store, confirmDestructive: true,
  })
  assert.equal(result.status, 'success')
  assert.deepEqual(store.writes, ['delete:permissions.permission-1', 'delete:roles.role-1'])
})

test('未启用 Directus 自定义权限规则时，在任何资源写入前拒绝同步', async () => {
  for (const data of [
    { fields: ['*'], permissions: { status: { _eq: 'published' } } },
    { fields: ['id', 'title'] },
    { fields: ['*'], validation: { user_created: { _eq: '$CURRENT_USER' } } },
    { fields: ['*'], presets: { user_created: '$CURRENT_USER' } },
    {},
  ]) {
    const store = Object.assign(new MemoryResources(), { getCustomPermissionRulesEnabled: async () => false })
    await assert.rejects(
      () => syncResources({
        definitions: definitions({
          folders: [{ type: 'folders', key: 'media', data: { name: 'Media', parent: null } }],
          permissions: [{ type: 'permissions', key: 'read', data: { policy: 'policy-1', collection: 'articles', action: 'read', ...data } }],
        }),
        reader: store, writer: store,
      }),
      /custom_permission_rules_enabled/,
    )
    assert.deepEqual(store.writes, [])
  }
})

test('已启用自定义规则时保留原始权限过滤条件', async () => {
  const store = Object.assign(new MemoryResources(), { getCustomPermissionRulesEnabled: async () => true })
  const result = await syncResources({
    definitions: definitions({ permissions: [{
      type: 'permissions', key: 'read',
      data: { policy: 'policy-1', collection: 'articles', action: 'read', fields: ['*'], permissions: { status: { _eq: 'published' } } },
    }] }),
    reader: store, writer: store,
  })
  assert.equal(result.status, 'success')
  assert.deepEqual(store.data.get('permissions')?.[0]?.permissions, { status: { _eq: 'published' } })
})

test('无自定义规则的权限和删除操作无需许可预检', async () => {
  const store = Object.assign(new MemoryResources(), {
    getCustomPermissionRulesEnabled: async (): Promise<boolean> => { throw new Error('不应请求许可') },
  })
  store.data.set('permissions', [{ id: 'permission-1', policy: 'policy-1', collection: 'legacy', action: 'read' }])
  const result = await syncResources({
    definitions: definitions({ permissions: [
      { type: 'permissions', key: 'read', data: { policy: 'policy-1', collection: 'articles', action: 'read', fields: ['*'], permissions: {} } },
      { type: 'permissions', key: 'legacy', delete: true, data: { policy: 'policy-1', collection: 'legacy', action: 'read' } },
    ] }),
    reader: store, writer: store, confirmDestructive: true,
  })
  assert.equal(result.status, 'success')
  assert.deepEqual(store.writes, ['create:permissions', 'delete:permissions.permission-1'])
})

test('权限能力查询失败时 dry-run 也不报告可同步', async () => {
  const store = Object.assign(new MemoryResources(), {
    getCustomPermissionRulesEnabled: async (): Promise<boolean> => { throw new Error('许可查询失败') },
  })
  await assert.rejects(() => syncResources({
    definitions: definitions({ permissions: [{
      type: 'permissions', key: 'read', data: { policy: 'policy-1', collection: 'articles', action: 'read', fields: ['title'] },
    }] }),
    reader: store, writer: store, dryRun: true,
  }), /许可查询失败/)
  assert.deepEqual(store.writes, [])
})

test('translations 按 key + language 认领、预览差异、原位更新及幂等', async () => {
  const store = new MemoryResources()
  store.data.set('translations', [
    { id: 'existing-zh', key: 'context.sun', language: 'zh-CN', value: '旧值' },
    { id: 'foreign', key: 'other.project', language: 'zh-CN', value: '保留' },
  ])
  const target = definitions({ translations: [
    { type: 'translations', key: 'sun-zh', data: { key: 'context.sun', language: 'zh-CN', value: '太阳\n☀️' } },
    { type: 'translations', key: 'sun-en', data: { key: 'context.sun', language: 'en-US', value: 'Sun' } },
  ] })
  const preview = await syncResources({ definitions: target, reader: store, writer: store, dryRun: true })
  assert.deepEqual(preview.operations.map((item) => item.action), ['update', 'create'])
  assert.deepEqual(preview.operations[0]?.changes, [{ path: 'value', current: '旧值', target: '太阳\n☀️' }])
  assert.deepEqual(store.writes, [])
  const applied = await syncResources({ definitions: target, reader: store, writer: store })
  assert.equal(applied.status, 'success')
  assert.equal(applied.operations[0]?.id, 'existing-zh')
  assert.equal(store.data.get('translations')?.find((row) => row.id === 'existing-zh')?.value, '太阳\n☀️')
  const repeated = await syncResources({ definitions: target, reader: store, writer: store })
  assert.equal(repeated.operations.every((item) => item.action === 'unchanged'), true)
  assert.deepEqual(store.writes, ['update:translations.existing-zh', 'create:translations'])
  assert.equal(store.data.get('translations')?.find((row) => row.id === 'foreign')?.value, '保留')
})

test('translations 重复实例自然键全量阻断，移除声明无隐式删除，显式删除需确认', async () => {
  const store = new MemoryResources()
  const data = { key: 'context.sun', language: 'zh-CN', value: '太阳' }
  const target = definitions({ translations: [{ type: 'translations', key: 'sun', data }] })
  store.data.set('translations', [{ ...data, id: 'one' }, { ...data, id: 'two' }])
  assert.equal((await syncResources({ definitions: target, reader: store, writer: store })).status, 'blocked')
  assert.deepEqual(store.writes, [])
  store.data.set('translations', [{ ...data, id: 'one' }])
  assert.equal((await syncResources({ definitions: definitions(), reader: store, writer: store })).completed.length, 0)
  target.translations[0]!.delete = true
  delete target.translations[0]!.data.value
  assert.equal((await syncResources({ definitions: target, reader: store, writer: store })).status, 'blocked')
  assert.deepEqual(store.writes, [])
  assert.equal((await syncResources({ definitions: target, reader: store, writer: store, confirmDestructive: true })).status, 'success')
  assert.deepEqual(store.writes, ['delete:translations.one'])
  const repeated = await syncResources({ definitions: target, reader: store, writer: store })
  assert.equal(repeated.operations[0]?.action, 'unchanged')
})

test('translations 部分失败保留完成项，停止后续写入，可重新同步恢复', async () => {
  const store = new MemoryResources()
  const target = definitions({ translations: ['one', 'two', 'three'].map((key) => ({
    type: 'translations', key, data: { key, language: 'en-US', value: key },
  })) })
  const create = store.createSystemResource.bind(store)
  store.createSystemResource = async (endpoint, data) => {
    if (data.key === 'two') throw new Error('permission denied')
    return create(endpoint, data)
  }
  const result = await syncResources({ definitions: target, reader: store, writer: store })
  assert.equal(result.status, 'failed')
  assert.deepEqual(result.completed.map((item) => item.key), ['one'])
  assert.equal(result.failure?.key, 'two')
  assert.equal(result.failure?.message, 'permission denied')
  assert.deepEqual(result.notExecuted?.map((item) => item.key), ['three'])
  assert.deepEqual(store.writes, ['create:translations'])
  store.createSystemResource = create
  const recovered = await syncResources({ definitions: target, reader: store, writer: store })
  assert.equal(recovered.status, 'success')
  assert.deepEqual(recovered.operations.map((item) => item.action), ['unchanged', 'create', 'create'])
})

test('translations 无效声明在读取及任何写入前拒绝', async () => {
  const store = new MemoryResources()
  store.listSystemResource = async () => { throw new Error('不应读取') }
  for (const translations of [
    [{ type: 'translations', key: 'invalid', data: { key: 'x', value: 'x' } }],
    ['a', 'b'].map((key) => ({ type: 'translations', key, data: { key: 'x', language: 'en-US', value: 'x' } })),
  ] as ResourceDefinition[][]) {
    await assert.rejects(() => syncResources({ definitions: definitions({ translations }), reader: store, writer: store }), /Translation Strings 校验失败/)
  }
  assert.deepEqual(store.writes, [])
})
