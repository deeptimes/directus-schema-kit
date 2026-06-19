import assert from 'node:assert/strict'
import test from 'node:test'
import { runSeeds, validateBatch, type SeedReader, type SeedWriter } from '../src/seed.js'
import type { SeedBatch } from '../src/types.js'

class MemoryItems implements SeedReader, SeedWriter {
  readonly data = new Map<string, Array<Record<string, unknown>>>()
  writes: string[] = []

  async listItems(collection: string, options = {} as { limit?: number; offset?: number; filter?: Record<string, unknown> }): Promise<Array<Record<string, unknown>>> {
    const rows = this.data.get(collection) ?? []
    const filtered = rows.filter((row) => Object.entries(options.filter ?? {}).every(([key, value]) => row[key] === value))
    return filtered.slice(options.offset ?? 0, (options.offset ?? 0) + (options.limit ?? 100))
  }

  async createItem(collection: string, data: Record<string, unknown>): Promise<Record<string, unknown>> {
    const rows = this.data.get(collection) ?? []
    const saved = { ...data, id: rows.length + 1 }
    rows.push(saved)
    this.data.set(collection, rows)
    this.writes.push(`create:${collection}`)
    return saved
  }

  async updateItem(collection: string, id: string | number, data: Record<string, unknown>): Promise<Record<string, unknown>> {
    const rows = this.data.get(collection) ?? []
    const index = rows.findIndex((item) => item.id === id)
    const saved = { ...rows[index], ...data, id }
    rows[index] = saved
    this.writes.push(`update:${collection}.${id}`)
    return saved
  }
}

function batch(value: Partial<SeedBatch> & Pick<SeedBatch, 'collection' | 'upsertBy' | 'items'>): SeedBatch {
  return { schemaVersion: 1, file: `${value.collection}.json`, ...value }
}

test('seed apply 通过自然键创建、更新并解析跨批次引用', async () => {
  const store = new MemoryItems()
  store.data.set('categories', [{ id: 7, slug: 'existing', name: '旧名称' }])
  const batches = [
    batch({ collection: 'categories', upsertBy: ['slug'], items: [{ slug: 'existing', name: '新名称' }, { slug: 'new', name: '新分类' }] }),
    batch({
      collection: 'articles', upsertBy: ['slug'],
      refs: { category_id: { collection: 'categories', field: 'slug', from: 'category' } },
      items: [{ slug: 'hello', title: 'Hello', category: 'new' }],
    }),
  ]
  const result = await runSeeds({ batches, mode: 'apply', reader: store, writer: store })
  assert.equal(result.status, 'success')
  assert.deepEqual(result.summary, { create: 2, update: 1, unchanged: 0 })
  assert.deepEqual(store.writes, ['update:categories.7', 'create:categories', 'create:articles'])
  assert.equal(store.data.get('articles')?.[0]?.category_id, 2)
  assert.equal(Object.hasOwn(store.data.get('articles')?.[0] ?? {}, 'category'), false)
})

test('seed plan 不写入且识别 unchanged', async () => {
  const store = new MemoryItems()
  store.data.set('categories', [{ id: 1, slug: 'same', name: '相同' }])
  const batches = [batch({ collection: 'categories', upsertBy: ['slug'], items: [{ slug: 'same', name: '相同' }] })]
  const result = await runSeeds({ batches, mode: 'plan', reader: store })
  assert.deepEqual(result.summary, { create: 0, update: 0, unchanged: 1 })
  assert.deepEqual(store.writes, [])
})

test('缺失引用立即失败且不创建错误数据', async () => {
  const store = new MemoryItems()
  const batches = [batch({
    collection: 'articles', upsertBy: ['slug'], refs: { category_id: { collection: 'categories', from: 'category' } },
    items: [{ slug: 'hello', category: 'missing' }],
  })]
  const result = await runSeeds({ batches, mode: 'apply', reader: store, writer: store })
  assert.equal(result.status, 'failed')
  assert.match(result.failure?.message ?? '', /引用不存在/)
  assert.deepEqual(store.writes, [])
})

test('静态校验组合自然键和引用 scope', () => {
  const errors = validateBatch(batch({
    collection: 'chapters', upsertBy: ['book', 'slug'], refs: { parent_id: { collection: 'chapters', from: 'parent', scope: ['book'] } },
    items: [{ slug: 'chapter-1', parent: 'unit-1' }],
  }))
  assert.equal(errors.some((item) => item.includes('缺少自然键 book')), true)
  assert.equal(errors.some((item) => item.includes('缺少 scope book')), true)
})
