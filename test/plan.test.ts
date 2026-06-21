import assert from 'node:assert/strict'
import test from 'node:test'
import { collection, field } from '../src/index.js'
import { createPlan } from '../src/plan.js'
import type { DirectusState, Manifest } from '../src/types.js'

function manifest(): Manifest {
  const authors = collection({ name: 'authors', label: '作者', fields: [field.string('name', { label: '名称', required: true })] })
  const articles = collection({
    name: 'articles', label: '文章', icon: 'article',
    fields: [field.string('title', { label: '标题', required: true }), field.m2o('author_id', { label: '作者', collection: 'authors' })],
  })
  const definitions = [authors, articles]
  return {
    manifestVersion: 1,
    generator: { name: 'test', version: '1.0.0' },
    source: { algorithm: 'sha256', digest: 'a'.repeat(64), files: [] },
    modules: [{ id: 'content', dependsOn: [], cleanupCollections: [], sources: [] }],
    collections: definitions.map((item) => ({ ...item, fields: [], module: 'content' })),
    fields: definitions.flatMap((item) => item.fields.map(({ relation: _relation, ...definition }) => ({ ...definition, collection: item.collection, module: 'content' }))),
    relations: [{ collection: 'articles', field: 'author_id', related_collection: 'authors', schema: { on_delete: 'SET NULL' }, module: 'content' }],
    resources: { folders: [], roles: [], policies: [], access: [], permissions: [], presets: [] },
  }
}

const emptyState: DirectusState = { collections: [], fields: [], relations: [] }

test('缺失资源全部分类为可执行 create', () => {
  const plan = createPlan(manifest(), emptyState, 'http://127.0.0.1:8055')
  assert.equal(plan.summary.create, 8)
  assert.equal(plan.operations.every((item) => item.executable && item.risk === 'low'), true)
})

test('UI Meta 为安全 update，字段约束和关系变化为 dangerous', () => {
  const target = manifest()
  const state: DirectusState = {
    collections: target.collections.map((item) => ({ collection: item.collection, meta: { ...item.meta, icon: item.collection === 'articles' ? 'old' : item.meta.icon } })),
    fields: target.fields.map((item) => ({
      collection: item.collection,
      field: item.field,
      type: item.field === 'title' ? 'text' : item.type,
      meta: item.meta,
      schema: item.schema,
    })),
    relations: [{ collection: 'articles', field: 'author_id', related_collection: 'users', schema: { on_delete: 'CASCADE' } }],
  }
  const plan = createPlan(target, state, 'http://localhost:8055')
  const collectionOperation = plan.operations.find((item) => item.resource === 'articles' && item.resourceType === 'collection')
  const fieldOperation = plan.operations.find((item) => item.resource === 'articles.title')
  const relationOperation = plan.operations.find((item) => item.resource === 'articles.author_id' && item.resourceType === 'relation')

  assert.equal(collectionOperation?.action, 'update')
  assert.equal(fieldOperation?.action, 'dangerous')
  assert.equal(fieldOperation?.executable, false)
  assert.equal(relationOperation?.action, 'dangerous')
  assert.equal(plan.summary.dangerous, 2)
})

test('已有 UUID 主键的必填元数据可安全修正', () => {
  const target = manifest()
  const state: DirectusState = {
    collections: target.collections.map((item) => ({ collection: item.collection, meta: item.meta })),
    fields: target.fields.map((item) => ({
      collection: item.collection,
      field: item.field,
      type: item.type,
      meta: item.schema?.is_primary_key ? { ...item.meta, required: true } : item.meta,
      schema: item.schema,
    })),
    relations: target.relations.map((item) => ({ ...item })),
  }

  const plan = createPlan(target, state, 'http://localhost:8055')
  const operation = plan.operations.find((item) => item.resource === 'authors.id')
  assert.equal(operation?.action, 'update')
  assert.equal(operation?.executable, true)
  assert.deepEqual(operation?.changes, [{ path: 'meta.required', current: true, target: false }])
})

test('module filter 只保留目标模块', () => {
  const target = manifest()
  target.modules.push({ id: 'other', dependsOn: [], cleanupCollections: [], sources: [] })
  target.collections.push({ collection: 'other', meta: {}, schema: {}, fields: [], module: 'other' })
  const plan = createPlan(target, emptyState, 'http://127.0.0.1:8055', 'content')
  assert.equal(plan.operations.some((item) => item.module === 'other'), false)
})

test('白名单外的声明差异分类为 conflict', () => {
  const target = manifest()
  const article = target.collections.find((item) => item.collection === 'articles')
  assert.ok(article)
  article.meta.unsupported_setting = true
  const state: DirectusState = {
    collections: target.collections.map((item) => ({ collection: item.collection, meta: item.collection === 'articles' ? { ...item.meta, unsupported_setting: false } : item.meta })),
    fields: [],
    relations: [],
  }
  const plan = createPlan(target, state, 'http://localhost:8055')
  const operation = plan.operations.find((item) => item.resource === 'articles' && item.resourceType === 'collection')
  assert.equal(operation?.action, 'conflict')
  assert.equal(operation?.executable, false)
})

test('SQLite 将 UUID 外键返回为 string 时视为等价类型', () => {
  const target = manifest()
  const state: DirectusState = {
    collections: target.collections.map((item) => ({ collection: item.collection, meta: item.meta })),
    fields: target.fields.map((item) => ({
      collection: item.collection, field: item.field,
      type: item.field === 'author_id' ? 'string' : item.type,
      meta: item.meta, schema: item.schema,
    })),
    relations: target.relations.map((item) => ({ ...item })),
  }
  const plan = createPlan(target, state, 'http://localhost:8055')
  const operation = plan.operations.find((item) => item.resource === 'articles.author_id' && item.resourceType === 'field')
  assert.equal(operation?.action, 'unchanged')
})

test('SQLite 将 decimal 返回为无精度信息的 float 时视为等价', () => {
  const target = manifest()
  target.fields.push({
    ...field.decimal('price', { precision: 10, scale: 2 }),
    collection: 'articles',
    module: 'content',
  })
  const state: DirectusState = {
    collections: target.collections.map((item) => ({ collection: item.collection, meta: item.meta })),
    fields: target.fields.map((item) => ({
      collection: item.collection,
      field: item.field,
      type: item.field === 'price' ? 'float' : item.type,
      meta: item.meta,
      schema: item.field === 'price' ? { ...item.schema, numeric_precision: null, numeric_scale: null } : item.schema,
    })),
    relations: target.relations.map((item) => ({ ...item })),
  }

  const sqlitePlan = createPlan(target, state, 'http://localhost:8055', undefined, 'sqlite3')
  const genericPlan = createPlan(target, state, 'http://localhost:8055')
  const sqliteOperation = sqlitePlan.operations.find((item) => item.resource === 'articles.price')
  const genericOperation = genericPlan.operations.find((item) => item.resource === 'articles.price')

  assert.equal(sqliteOperation?.action, 'unchanged')
  assert.equal(genericOperation?.action, 'dangerous')
  assert.deepEqual(genericOperation?.changes.map((item) => item.path), ['type', 'schema.numeric_precision', 'schema.numeric_scale'])
})

test('Relation Meta 的 sort_field 为安全更新，结构变化为 dangerous', () => {
  const safeTarget = manifest()
  const safeRelation = safeTarget.relations[0]
  assert.ok(safeRelation)
  safeRelation.meta = { sort_field: 'sort' }
  const state: DirectusState = {
    collections: safeTarget.collections.map((item) => ({ collection: item.collection, meta: item.meta })),
    fields: safeTarget.fields.map((item) => ({ collection: item.collection, field: item.field, type: item.type, meta: item.meta, schema: item.schema })),
    relations: [{ collection: safeRelation.collection, field: safeRelation.field, related_collection: safeRelation.related_collection, schema: safeRelation.schema, meta: { sort_field: null } }],
  }
  const safe = createPlan(safeTarget, state, 'http://localhost:8055').operations.find((item) => item.resourceType === 'relation')
  assert.equal(safe?.action, 'update')
  assert.equal(safe?.executable, true)

  safeRelation.meta = { one_field: 'articles' }
  const dangerous = createPlan(safeTarget, state, 'http://localhost:8055').operations.find((item) => item.resourceType === 'relation')
  assert.equal(dangerous?.action, 'dangerous')
  assert.equal(dangerous?.executable, false)
})
