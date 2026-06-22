import assert from 'node:assert/strict'
import test from 'node:test'
import { createClearPlan, deleteOrder, executeClear, type ClearWriter } from '../src/clear.js'
import type { DirectusState, Manifest } from '../src/types.js'

function fixture(): { manifest: Manifest; state: DirectusState } {
  return {
    manifest: {
      manifestVersion: 3, generator: { name: 'test', version: '1' },
      source: { algorithm: 'sha256', digest: 'a'.repeat(64), files: [] },
      collections: [
        { collection: 'content_group', meta: {}, schema: null, fields: [], source: 'dsk/schema/content.ts' },
        { collection: 'parents', meta: {}, schema: {}, fields: [], source: 'dsk/schema/content.ts' },
        { collection: 'children', meta: {}, schema: {}, fields: [], source: 'dsk/schema/content.ts' },
      ], fields: [], relations: [], resources: { folders: [], roles: [], policies: [], access: [], permissions: [], presets: [] },
    },
    state: {
      collections: ['content_group', 'parents', 'children', 'outside'].map((collection) => ({ collection })),
      fields: [],
      relations: [{ collection: 'children', field: 'parent_id', related_collection: 'parents' }],
    },
  }
}

class MemoryClear implements ClearWriter {
  calls: string[] = []
  async deleteField(collection: string, field: string): Promise<void> { this.calls.push(`field:${collection}.${field}`) }
  async deleteCollection(collection: string): Promise<void> { this.calls.push(`collection:${collection}`) }
}

test('clear 先删除关系字段、子集合、父集合，最后删除 group', () => {
  const { manifest, state } = fixture()
  const plan = createClearPlan(manifest, state)
  assert.deepEqual(plan.map((item) => `${item.resourceType}:${item.resource}`), [
    'field:children.parent_id', 'collection:children', 'collection:parents', 'collection:content_group',
  ])
})

test('没有确认时只生成计划且零删除', async () => {
  const { manifest, state } = fixture()
  const writer = new MemoryClear()
  const planned = await executeClear({ manifest, state, writer })
  assert.equal(planned.status, 'planned')
  assert.deepEqual(writer.calls, [])
})

test('确认后删除 Manifest 声明的全部自定义集合', async () => {
  const { manifest, state } = fixture()
  const writer = new MemoryClear()
  const result = await executeClear({ manifest, state, writer, confirm: true })
  assert.equal(result.status, 'success')
  assert.equal(writer.calls.some((item) => item.includes('outside')), false)
  assert.equal(writer.calls.length, 4)
})

test('交互授权基于已生成计划执行，拒绝授权时零删除', async () => {
  const { manifest, state } = fixture()
  const writer = new MemoryClear()
  let plannedResources: string[] = []
  const accepted = await executeClear({
    manifest, state, writer,
    authorize: async (operations) => {
      plannedResources = operations.map((item) => item.resource)
      return true
    },
  })
  assert.equal(accepted.status, 'success')
  assert.deepEqual(plannedResources, accepted.completed.map((item) => item.resource))

  const rejectedWriter = new MemoryClear()
  const rejected = await executeClear({
    manifest, state, writer: rejectedWriter,
    authorize: async () => false,
  })
  assert.equal(rejected.status, 'planned')
  assert.match(rejected.reason ?? '', /用户取消/)
  assert.deepEqual(rejectedWriter.calls, [])
})

test('系统集合无条件拒绝', () => {
  const { manifest, state } = fixture()
  manifest.collections.push({ collection: 'directus_users', meta: {}, schema: {}, fields: [], source: 'dsk/schema/content.ts' })
  assert.throws(() => createClearPlan(manifest, state), /禁止清理系统集合/)
})

test('不删除 Directus 系统集合上的反向关系字段', () => {
  const { manifest, state } = fixture()
  state.relations.push({ collection: 'directus_users', field: 'child', related_collection: 'children' })
  state.collections.push({ collection: 'directus_users' })
  assert.equal(createClearPlan(manifest, state).some((item) => item.resource === 'directus_users.child'), false)
})

test('循环关系仍生成每个集合一次', () => {
  const relations: DirectusState['relations'] = [
    { collection: 'a', field: 'b_id', related_collection: 'b' },
    { collection: 'b', field: 'a_id', related_collection: 'a' },
  ]
  assert.deepEqual(new Set(deleteOrder(['a', 'b'], relations)), new Set(['a', 'b']))
})
