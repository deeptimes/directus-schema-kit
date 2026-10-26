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
    return { ...data, id }
  }

  async deleteSystemResource(endpoint: string, id: string | number): Promise<void> {
    this.writes.push(`delete:${endpoint}.${id}`)
  }
}

function definitions(overrides: Partial<Record<ResourceType, ResourceDefinition[]>> = {}): Record<ResourceType, ResourceDefinition[]> {
  return { folders: [], roles: [], policies: [], access: [], permissions: [], presets: [], ...overrides }
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
