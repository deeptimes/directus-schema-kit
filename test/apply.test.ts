import assert from 'node:assert/strict'
import test from 'node:test'
import { executeApply, type SchemaWriter } from '../src/apply.js'
import { collection, collectionGroup, field } from '../src/index.js'
import type { Manifest, Plan, PlanOperation } from '../src/types.js'

function fixture(): { manifest: Manifest; plan: Plan } {
  const parent = collectionGroup({ name: 'parent', label: '父分组' })
  const child = collectionGroup({ name: 'child', label: '子分组', group: 'parent' })
  const articles = collection({ name: 'articles', label: '文章', group: 'child', fields: [field.string('title', { label: '标题' })] })
  const fields = articles.fields.map(({ relation: _relation, ...item }) => ({ ...item, collection: 'articles', module: 'content' }))
  const manifest: Manifest = {
    manifestVersion: 1,
    generator: { name: 'test', version: '1' },
    source: { algorithm: 'sha256', digest: 'a'.repeat(64), files: [] },
    modules: [{ id: 'content', dependsOn: [], cleanupCollections: [], sources: [] }],
    collections: [{ ...child, module: 'content' }, { ...parent, module: 'content' }, { ...articles, fields: [], module: 'content' }],
    fields,
    relations: [],
    resources: { folders: [], roles: [], policies: [], access: [], permissions: [], flows: [], dashboards: [], presets: [] },
  }
  const operations: PlanOperation[] = [
    create('field', 'articles.id'), create('collection', 'articles'), create('collection', 'child'),
    create('field', 'articles.title'), create('collection', 'parent'),
  ]
  return {
    manifest,
    plan: {
      planVersion: 1, manifestDigest: manifest.source.digest, target: { url: 'http://localhost:8055' }, operations,
      summary: { create: operations.length, update: 0, unchanged: 0, conflict: 0, dangerous: 0 },
    },
  }
}

function create(resourceType: PlanOperation['resourceType'], resource: string): PlanOperation {
  return { module: 'content', resourceType, resource, action: 'create', risk: 'low', executable: true, changes: [] }
}

function fakeWriter(log: string[], failAt?: string): SchemaWriter {
  const call = async (value: string): Promise<void> => {
    log.push(value)
    if (value === failAt) throw new Error('expected failure')
  }
  return {
    createCollection: async (item, primary) => call(`collection:${item.collection}:${primary?.field ?? '-'}`),
    updateCollection: async (name) => call(`update-collection:${name}`),
    createField: async (name, item) => call(`field:${name}.${item.field}`),
    updateField: async (name, item) => call(`update-field:${name}.${item}`),
    createRelation: async (item) => call(`relation:${item.collection}.${item.field}`),
  }
}

test('apply 按父 group、子 group、collection、field 执行且主键不重复写入', async () => {
  const { manifest, plan } = fixture()
  const log: string[] = []
  const result = await executeApply({ manifest, plan, writer: fakeWriter(log) })
  assert.equal(result.status, 'success')
  assert.deepEqual(log, ['collection:parent:-', 'collection:child:-', 'collection:articles:id', 'field:articles.title'])
  assert.equal(result.completed.find((item) => item.resource === 'articles.id')?.detail, '已随集合创建')
})

test('存在 dangerous 时在任何写入前阻断', async () => {
  const { manifest, plan } = fixture()
  plan.operations.push({ module: 'content', resourceType: 'field', resource: 'articles.title', action: 'dangerous', risk: 'high', executable: false, changes: [], reason: 'type changed' })
  plan.summary.dangerous = 1
  const log: string[] = []
  const result = await executeApply({ manifest, plan, writer: fakeWriter(log) })
  assert.equal(result.status, 'blocked')
  assert.deepEqual(log, [])
})

test('失败后停止并准确报告已完成和未执行项', async () => {
  const { manifest, plan } = fixture()
  const log: string[] = []
  const result = await executeApply({ manifest, plan, writer: fakeWriter(log, 'collection:articles:id') })
  assert.equal(result.status, 'failed')
  assert.equal(result.completed.length, 2)
  assert.equal(result.failed?.resource, 'articles')
  assert.equal(result.notExecuted.length, 2)
})

test('dry-run 不调用 writer', async () => {
  const { manifest, plan } = fixture()
  const log: string[] = []
  const result = await executeApply({ manifest, plan, writer: fakeWriter(log), dryRun: true })
  assert.equal(result.status, 'success')
  assert.equal(result.notExecuted.length, 5)
  assert.deepEqual(log, [])
})

test('安全 update 只发送 Plan 中变化的白名单属性', async () => {
  const { manifest, plan } = fixture()
  const article = manifest.collections.find((item) => item.collection === 'articles')
  assert.ok(article)
  article.meta.icon = 'article'
  plan.operations = [{
    module: 'content', resourceType: 'collection', resource: 'articles', action: 'update', risk: 'low', executable: true,
    changes: [{ path: 'meta.icon', current: 'old', target: 'article' }],
  }]
  plan.summary = { create: 0, update: 1, unchanged: 0, conflict: 0, dangerous: 0 }
  let patch: Record<string, unknown> | undefined
  const writer = fakeWriter([])
  writer.updateCollection = async (_name, meta) => { patch = meta }
  const result = await executeApply({ manifest, plan, writer })
  assert.equal(result.status, 'success')
  assert.deepEqual(patch, { icon: 'article' })
})

test('拒绝执行摘要不匹配的 Plan', async () => {
  const { manifest, plan } = fixture()
  plan.manifestDigest = 'b'.repeat(64)
  await assert.rejects(() => executeApply({ manifest, plan, writer: fakeWriter([]) }), /Plan 与 Manifest 摘要不一致/)
})
