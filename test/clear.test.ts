import assert from 'node:assert/strict'
import test from 'node:test'
import { createClearPlan, deleteOrder, executeClear, type ClearWriter } from '../src/clear.js'
import type { DirectusState, Manifest } from '../src/types.js'

function fixture(): { manifest: Manifest; state: DirectusState } {
  return {
    manifest: {
      manifestVersion: 1, generator: { name: 'test', version: '1' },
      source: { algorithm: 'sha256', digest: 'a'.repeat(64), files: [] },
      modules: [{ id: 'content', dependsOn: [], cleanupCollections: ['legacy'], sources: [] }],
      collections: [
        { collection: 'content_group', meta: {}, schema: null, fields: [], module: 'content' },
        { collection: 'parents', meta: {}, schema: {}, fields: [], module: 'content' },
        { collection: 'children', meta: {}, schema: {}, fields: [], module: 'content' },
      ], fields: [], relations: [], resources: { folders: [], roles: [], policies: [], access: [], permissions: [], presets: [] },
    },
    state: {
      collections: ['content_group', 'parents', 'children', 'legacy', 'outside'].map((collection) => ({ collection })),
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
  const plan = createClearPlan(manifest, state, 'content')
  assert.deepEqual(plan.map((item) => `${item.resourceType}:${item.resource}`), [
    'field:children.parent_id', 'collection:children', 'collection:parents', 'collection:legacy', 'collection:content_group',
  ])
})

test('没有双重确认时只计划或阻断，且零删除', async () => {
  const { manifest, state } = fixture()
  const writer = new MemoryClear()
  const planned = await executeClear({ manifest, state, module: 'content', writer })
  const blocked = await executeClear({ manifest, state, module: 'content', writer, confirm: true, scope: 'wrong' })
  assert.equal(planned.status, 'planned')
  assert.equal(blocked.status, 'blocked')
  assert.deepEqual(writer.calls, [])
})

test('完整确认后只删除模块范围', async () => {
  const { manifest, state } = fixture()
  const writer = new MemoryClear()
  const result = await executeClear({ manifest, state, module: 'content', writer, confirm: true, scope: 'content' })
  assert.equal(result.status, 'success')
  assert.equal(writer.calls.some((item) => item.includes('outside')), false)
  assert.equal(writer.calls.length, 5)
})

test('系统集合无条件拒绝', () => {
  const { manifest, state } = fixture()
  manifest.modules[0]!.cleanupCollections.push('directus_users')
  assert.throws(() => createClearPlan(manifest, state, 'content'), /禁止清理系统集合/)
})

test('循环关系仍生成每个集合一次', () => {
  const relations: DirectusState['relations'] = [
    { collection: 'a', field: 'b_id', related_collection: 'b' },
    { collection: 'b', field: 'a_id', related_collection: 'a' },
  ]
  assert.deepEqual(new Set(deleteOrder(['a', 'b'], relations)), new Set(['a', 'b']))
})
