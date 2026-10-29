import assert from 'node:assert/strict'
import test from 'node:test'
import { createCleanupPlan, executeCleanup, type CleanupSnapshot, type CleanupWriter } from '../src/cleanup.js'
import type { Manifest } from '../src/types.js'

function fixture(): { manifest: Manifest; snapshot: CleanupSnapshot } {
  return {
    manifest: {
      manifestVersion: 1, generator: { name: 'test', version: '1' },
      source: { algorithm: 'sha256', digest: 'a'.repeat(64), files: [] },
      collections: [{ collection: 'articles', fields: [], meta: {}, schema: {}, source: 'test.ts' }],
      fields: [], relations: [], resources: {
        folders: [], roles: [{ type: 'roles', key: 'editor', data: { name: 'Editor' } }],
        policies: [], access: [], permissions: [], presets: [],
      },
    },
    snapshot: {
      currentUser: 'admin', settings: { id: 1, project_name: 'Keep', project_logo: null },
      state: {
        collections: [{ collection: 'articles', schema: {} }, { collection: 'legacy', schema: {} }],
        fields: ['articles', 'legacy'].map((collection) => ({ collection, field: 'id', type: 'uuid', schema: { is_primary_key: true } })),
        relations: [],
      },
      items: { articles: [{ id: 'article' }], legacy: [{ id: 'old' }] },
      resources: {
        users: [{ id: 'admin', role: 'admin-role', status: 'active', avatar: null }, { id: 'writer', role: 'editor-role', status: 'active' }],
        roles: [{ id: 'admin-role', name: 'Administrator', parent: null }, { id: 'editor-role', name: 'Editor', parent: null }],
        policies: [{ id: 'admin-policy', name: 'Administrator', admin_access: true }, { id: 'public', name: '$t:public_label', admin_access: false }, { id: 'editor-policy', name: 'Editor', admin_access: false }],
        access: [{ id: 'admin-access', role: 'admin-role', user: null, policy: 'admin-policy' }, { id: 'public-access', role: null, user: null, policy: 'public' }, { id: 'editor-access', role: 'editor-role', user: null, policy: 'editor-policy' }],
        permissions: [{ id: 1, policy: 'public', collection: 'articles', action: 'read' }, { id: 2, policy: 'editor-policy', collection: 'articles', action: 'read' }],
        presets: [{ id: 1, collection: 'articles', user: 'writer', role: 'editor-role' }],
        files: [{ id: 'image', folder: 'child', storage: 'local', filename_disk: 'image.png' }],
        folders: [{ id: 'root', parent: null, name: 'Root' }, { id: 'child', parent: 'root', name: 'Child' }],
      },
      references: [],
    },
  }
}

class MemoryWriter implements CleanupWriter {
  calls: string[] = []
  async deleteItem(collection: string, id: string | number): Promise<void> { this.calls.push(`item:${collection}:${id}`) }
  async updateItem(collection: string, id: string | number, data: Record<string, unknown>): Promise<Record<string, unknown>> { this.calls.push(`update:${collection}:${id}:${JSON.stringify(data)}`); return data }
  async deleteField(collection: string, field: string): Promise<void> { this.calls.push(`field:${collection}.${field}`) }
  async deleteCollection(collection: string): Promise<void> { this.calls.push(`collection:${collection}`) }
  async deleteSystemResource(endpoint: string, id: string | number): Promise<void> { this.calls.push(`${endpoint}:${id}`) }
}

function emptied(snapshot: CleanupSnapshot, mode: 'data' | 'full'): CleanupSnapshot {
  const after = structuredClone(snapshot)
  after.items = Object.fromEntries(Object.keys(after.items).map((key) => [key, []]))
  if (mode === 'full') {
    after.state = { collections: [], fields: [], relations: [] }
    after.resources.users = after.resources.users.filter((row) => row.id === 'admin')
    after.resources.roles = after.resources.roles.filter((row) => row.id === 'admin-role')
    after.resources.policies = after.resources.policies.filter((row) => row.id === 'admin-policy' || row.id === 'public')
    after.resources.access = after.resources.access.filter((row) => row.id === 'admin-access' || row.id === 'public-access')
    for (const type of ['permissions', 'presets', 'files', 'folders'] as const) after.resources[type] = []
  }
  return after
}

test('完整计划包含所有自定义集合、数据和系统资源，区分声明项与未声明项', () => {
  const { manifest, snapshot } = fixture()
  const plan = createCleanupPlan({ mode: 'full', manifest, snapshot })
  assert.deepEqual(plan.blockers, [])
  assert.equal(plan.operations.find((op) => op.resource === 'articles' && op.kind === 'collection')?.origin, 'declared')
  assert.equal(plan.operations.find((op) => op.resource === 'legacy' && op.kind === 'collection')?.origin, 'undeclared')
  assert.equal(plan.operations.find((op) => op.resource === 'roles' && op.id === 'editor-role')?.origin, 'declared')
  assert.equal(plan.operations.find((op) => op.resource === 'articles' && op.kind === 'collection')?.count, 1)
  assert.ok(plan.operations.some((op) => op.resource === 'files' && op.id === 'image'))
  assert.ok(plan.operations.some((op) => op.resource === 'users' && op.id === 'writer'))
  assert.ok(plan.operations.findIndex((op) => op.resource === 'folders' && op.id === 'child') < plan.operations.findIndex((op) => op.resource === 'folders' && op.id === 'root'))
  assert.equal(plan.operations.some((op) => ['admin', 'admin-role', 'admin-policy', 'admin-access', 'public', 'public-access'].includes(String(op.id))), false)
})

test('clean 只删除业务记录，保留 Schema、文件、用户和权限配置', () => {
  const { manifest, snapshot } = fixture()
  const plan = createCleanupPlan({ mode: 'data', manifest, snapshot })
  assert.deepEqual(plan.blockers, [])
  assert.deepEqual(plan.operations.map((op) => [op.kind, op.resource, op.id]), [['item', 'articles', 'article'], ['item', 'legacy', 'old']])
})

test('没有确认、dry-run、取消确认和禁用配置均零写入', async () => {
  const { manifest, snapshot } = fixture()
  for (const options of [{}, { dryRun: true, confirm: true }, { authorize: async () => false }, { enabled: false, confirm: true }]) {
    const writer = new MemoryWriter()
    const result = await executeCleanup({ mode: 'full', manifest, readSnapshot: async () => snapshot, writer, ...options })
    assert.ok(['planned', 'blocked'].includes(result.status))
    assert.deepEqual(writer.calls, [])
  }
})

test('settings 和管理员引用的文件在任何写入前阻断，不置空引用', async () => {
  for (const source of ['settings', 'admin'] as const) {
    const { manifest, snapshot } = fixture()
    if (source === 'settings') snapshot.settings.project_logo = 'image'
    else snapshot.resources.users[0]!.avatar = 'image'
    const writer = new MemoryWriter()
    const result = await executeCleanup({ mode: 'full', manifest, readSnapshot: async () => snapshot, writer, confirm: true })
    assert.equal(result.status, 'blocked')
    assert.match(result.blockers.join(' '), /image/)
    assert.deepEqual(writer.calls, [])
  }
})

test('保留角色引用的父角色和管理员直接 policy 一起保留', () => {
  const { manifest, snapshot } = fixture()
  snapshot.resources.roles[0]!.parent = 'parent-role'
  snapshot.resources.roles.push({ id: 'parent-role', name: 'Parent' })
  snapshot.resources.access[0]!.role = 'parent-role'
  const plan = createCleanupPlan({ mode: 'full', manifest, snapshot })
  assert.deepEqual(plan.blockers, [])
  assert.equal(plan.operations.some((op) => op.id === 'parent-role'), false)
})

test('无法识别 Public policy、非管理员认证和未激活管理员均阻断', () => {
  for (const change of ['public', 'admin', 'status'] as const) {
    const { manifest, snapshot } = fixture()
    if (change === 'public') snapshot.resources.policies = snapshot.resources.policies.filter((row) => row.id !== 'public')
    if (change === 'admin') snapshot.resources.policies[0]!.admin_access = false
    if (change === 'status') snapshot.resources.users[0]!.status = 'suspended'
    assert.ok(createCleanupPlan({ mode: 'full', manifest, snapshot }).blockers.length > 0)
  }
})

test('非目标资源引用待删角色或策略时全量阻断', () => {
  const { manifest, snapshot } = fixture()
  snapshot.references.push({ collection: 'directus_shares', field: 'role', id: 'share', value: 'editor-role', relatedCollection: 'directus_roles' })
  const plan = createCleanupPlan({ mode: 'full', manifest, snapshot })
  assert.match(plan.blockers.join(' '), /directus_shares.*editor-role/)
})

test('系统集合到自定义集合的关系阻断结构删除', () => {
  const { manifest, snapshot } = fixture()
  snapshot.state.relations.push({ collection: 'directus_users', field: 'favorite', related_collection: 'articles' })
  assert.match(createCleanupPlan({ mode: 'full', manifest, snapshot }).blockers.join(' '), /directus_users.favorite/)
})

test('clean 处理可空循环和自关联；非空循环在写入前阻断', () => {
  for (const nullable of [true, false]) {
    const { manifest, snapshot } = fixture()
    snapshot.state.fields.push({ collection: 'articles', field: 'parent', type: 'uuid', schema: { is_nullable: nullable } })
    snapshot.state.relations.push({ collection: 'articles', field: 'parent', related_collection: 'articles' })
    snapshot.items.articles = [{ id: 'a', parent: 'b' }, { id: 'b', parent: 'a' }]
    const plan = createCleanupPlan({ mode: 'data', manifest, snapshot })
    if (nullable) {
      assert.deepEqual(plan.blockers, [])
      assert.equal(plan.operations[0]?.kind, 'detach')
    } else assert.match(plan.blockers.join(' '), /循环/)
  }
})

test('确认期间实例变化时重新预检并阻断，不能执行过期计划', async () => {
  const { manifest, snapshot } = fixture()
  const writer = new MemoryWriter()
  let reads = 0
  const result = await executeCleanup({
    mode: 'full', manifest, writer, confirm: true,
    readSnapshot: async () => {
      const value = structuredClone(snapshot)
      if (++reads > 1) value.settings.project_logo = 'image'
      return value
    },
  })
  assert.equal(result.status, 'blocked')
  assert.deepEqual(writer.calls, [])
})

test('执行首项失败即停止，报告已完成项且不声称成功', async () => {
  const { manifest, snapshot } = fixture()
  const writer = new MemoryWriter()
  writer.deleteSystemResource = async () => { throw new Error('delete failed') }
  const result = await executeCleanup({ mode: 'full', manifest, readSnapshot: async () => snapshot, writer, confirm: true })
  assert.equal(result.status, 'failed')
  assert.ok(result.failure)
  assert.equal(result.verified, false)
})

test('完整执行后验证保留配置和管理员授权，重复执行安全', async () => {
  const { manifest, snapshot } = fixture()
  const after = emptied(snapshot, 'full')
  let reads = 0
  const writer = new MemoryWriter()
  const result = await executeCleanup({ mode: 'full', manifest, writer, confirm: true, readSnapshot: async () => ++reads <= 2 ? snapshot : after })
  assert.equal(result.status, 'success', JSON.stringify(result))
  assert.equal(result.verified, true)
  const repeated = await executeCleanup({ mode: 'full', manifest, writer: new MemoryWriter(), confirm: true, readSnapshot: async () => after })
  assert.equal(repeated.status, 'success')
  assert.deepEqual(repeated.completed, [])
})

test('清理后 settings 被改写或管理员失去授权时验证失败', async () => {
  for (const change of ['settings', 'access'] as const) {
    const { manifest, snapshot } = fixture()
    const after = emptied(snapshot, 'full')
    if (change === 'settings') after.settings.project_name = 'Changed'
    else after.resources.access = []
    let reads = 0
    const result = await executeCleanup({ mode: 'full', manifest, writer: new MemoryWriter(), confirm: true, readSnapshot: async () => ++reads <= 2 ? snapshot : after })
    assert.equal(result.status, 'failed')
    assert.equal(result.verified, false)
  }
})

test('clean 遇到保留系统记录引用业务数据时在写入前阻断', () => {
  const { manifest, snapshot } = fixture()
  snapshot.references.push({ collection: 'directus_settings', field: 'featured', id: 1, value: 'article', relatedCollection: 'articles' })
  assert.match(createCleanupPlan({ mode: 'data', manifest, snapshot }).blockers.join(' '), /directus_settings.featured/)
})

test('clean 执行后校验全部结构及权限配置未变化', async () => {
  const { manifest, snapshot } = fixture()
  const after = emptied(snapshot, 'data')
  after.resources.roles[1]!.name = 'Unexpected change'
  let reads = 0
  const result = await executeCleanup({ mode: 'data', manifest, writer: new MemoryWriter(), confirm: true, readSnapshot: async () => ++reads <= 2 ? snapshot : after })
  assert.equal(result.status, 'failed')
})

test('reset 保留主键到集合删除阶段，先删除普通关系字段解除外键', () => {
  const { manifest, snapshot } = fixture()
  snapshot.state.fields.push({ collection: 'articles', field: 'other', type: 'uuid', schema: { is_nullable: true } })
  snapshot.state.relations.push({ collection: 'articles', field: 'id', related_collection: 'legacy' }, { collection: 'legacy', field: 'other', related_collection: 'articles' })
  const plan = createCleanupPlan({ mode: 'full', manifest, snapshot })
  assert.ok(plan.operations.some((op) => op.kind === 'field' && op.resource === 'legacy' && op.field === 'other'))
  assert.equal(plan.operations.some((op) => op.kind === 'field' && op.field === 'id'), false)
  assert.ok(plan.operations.findIndex((op) => op.kind === 'collection' && op.resource === 'articles') < plan.operations.findIndex((op) => op.kind === 'collection' && op.resource === 'legacy'))
})

test('reset 遇到无法解除的主键外键循环，在写入前阻断', () => {
  const { manifest, snapshot } = fixture()
  snapshot.state.relations.push({ collection: 'articles', field: 'id', related_collection: 'legacy' }, { collection: 'legacy', field: 'id', related_collection: 'articles' })
  assert.match(createCleanupPlan({ mode: 'full', manifest, snapshot }).blockers.join(' '), /主键.*循环/)
})

test('保留管理员引用待删用户时阻断，避免用户删除级联改写保留账号', () => {
  const { manifest, snapshot } = fixture()
  snapshot.references.push({ collection: 'directus_users', field: 'inviter', id: 'admin', value: 'writer', relatedCollection: 'directus_users' })
  assert.match(createCleanupPlan({ mode: 'full', manifest, snapshot }).blockers.join(' '), /inviter/)
})

test('clean 按 M2A discriminator 解析记录依赖，先删除必填 junction 再删除目标记录', () => {
  const { manifest, snapshot } = fixture()
  snapshot.state.fields.push({ collection: 'legacy', field: 'item', type: 'string', schema: { is_nullable: false } })
  snapshot.state.relations.push({ collection: 'legacy', field: 'item', related_collection: null, meta: { one_collection_field: 'collection', one_allowed_collections: ['articles'] } })
  snapshot.items.legacy = [{ id: 'old', collection: 'articles', item: 'article' }]
  const plan = createCleanupPlan({ mode: 'data', manifest, snapshot })
  const deleted = plan.operations.filter((op) => op.kind === 'item')
  assert.deepEqual(deleted.map((op) => op.resource), ['legacy', 'articles'])
})

test('clean 无法解析非主键外键时在写入前阻断', () => {
  const { manifest, snapshot } = fixture()
  snapshot.state.relations.push({ collection: 'legacy', field: 'article_slug', related_collection: 'articles', schema: { foreign_key_column: 'slug' } })
  assert.match(createCleanupPlan({ mode: 'data', manifest, snapshot }).blockers.join(' '), /非主键/)
})

test('reset 先解除业务集合对普通用户的必填外键，再删除用户和角色', () => {
  const { manifest, snapshot } = fixture()
  snapshot.state.fields.push({ collection: 'articles', field: 'user_owner', type: 'uuid', schema: { is_nullable: false } })
  snapshot.state.relations.push({ collection: 'articles', field: 'user_owner', related_collection: 'directus_users', schema: { on_delete: 'RESTRICT' } })
  snapshot.items.articles![0]!.user_owner = 'writer'
  const plan = createCleanupPlan({ mode: 'full', manifest, snapshot })
  assert.deepEqual(plan.blockers, [])
  const fieldIndex = plan.operations.findIndex((op) => op.kind === 'field' && op.field === 'user_owner')
  const userIndex = plan.operations.findIndex((op) => op.resource === 'users' && op.id === 'writer')
  assert.ok(fieldIndex < userIndex)
  assert.ok(plan.operations.findIndex((op) => op.kind === 'collection' && op.resource === 'articles') < userIndex)
})


test('translations 声明不扩大 clean/reset 范围，也不要求清理快照读取翻译', () => {
  const { manifest, snapshot } = fixture()
  manifest.resources.translations = [{ type: 'translations', key: 'shared', data: { key: 'shared.label', language: 'zh-CN', value: '共享' } }]
  for (const mode of ['data', 'full'] as const) {
    const plan = createCleanupPlan({ mode, manifest, snapshot })
    assert.deepEqual(plan.blockers, [])
    assert.equal(plan.operations.some((item) => item.resource === 'translations' || item.resource === 'directus_translations'), false)
  }
})
