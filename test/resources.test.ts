import assert from 'node:assert/strict'
import test from 'node:test'
import { syncResources, type ResourceReader, type ResourceWriter } from '../src/resources.js'
import { ref } from '../src/index.js'
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
  return { folders: [], roles: [], permissions: [], flows: [], dashboards: [], presets: [], ...overrides }
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
      permissions: [{ type: 'permissions', key: 'editor-read', data: { role: ref('roles.editor'), collection: 'articles', action: 'read' } }],
    }),
    reader: store,
    writer: store,
  })
  assert.equal(result.status, 'success')
  assert.deepEqual(store.writes, ['create:folders', 'create:folders', 'create:roles', 'create:permissions'])
  assert.equal(store.data.get('folders')?.[1]?.parent, 'folders-1')
  assert.equal(store.data.get('permissions')?.[0]?.role, 'roles-1')
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
  store.data.set('dashboards', [{ id: '1', name: 'Stats' }, { id: '2', name: 'Stats' }])
  const result = await syncResources({
    definitions: definitions({ dashboards: [{ type: 'dashboards', key: 'stats', data: { name: 'Stats' } }] }),
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
