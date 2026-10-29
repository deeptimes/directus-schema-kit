import assert from 'node:assert/strict'
import test from 'node:test'
import { defaultConfig } from '../src/config.js'
import { collection, field, resource } from '../src/index.js'
import { createPlan } from '../src/plan.js'
import { executeApply } from '../src/apply.js'
import { validateManifest } from '../src/validate.js'
import type { Manifest } from '../src/types.js'

function fixture(): Manifest {
  const model = collection({ name: 'article_contexts', label: '条件', fields: [field.string('type'), field.string('object')] })
  return {
    manifestVersion: 1, generator: { name: 'test', version: '1' },
    source: { algorithm: 'sha256', digest: 'a'.repeat(64), files: [] },
    collections: [{ ...model, fields: [], source: 'content.ts' }],
    fields: model.fields.map((item) => ({ ...item, collection: model.collection, source: 'content.ts' })),
    relations: [], resources: { folders: [], roles: [], policies: [], access: [], permissions: [], presets: [] },
  }
}

const conditions = [
  { name: '显示并必填', rule: { type: { _in: ['object', 'aspect'] } }, hidden: false, required: true, options: {} },
  { name: '隐藏并清空', rule: { type: { _nin: ['object', 'aspect'] } }, hidden: true, required: false, clear_hidden_value_on_save: true, options: {} },
]

test('conditions 更新只 PATCH 声明变化的 meta，dry-run 无写入并能收敛', async () => {
  const manifest = fixture()
  const state = structuredClone({ collections: manifest.collections.map((item) => ({ ...item })), fields: manifest.fields.map((item) => ({ ...item })), relations: manifest.relations.map((item) => ({ ...item })) })
  const target = manifest.fields.find((item) => item.field === 'object')!
  target.meta.hidden = true
  target.meta.conditions = conditions
  const plan = createPlan(manifest, state, 'http://localhost:8055')
  const operation = plan.operations.find((item) => item.resource === 'article_contexts.object')!
  assert.equal(operation.action, 'update')
  assert.deepEqual(operation.changes.map((item) => item.path), ['meta.hidden', 'meta.conditions'])
  assert.match(operation.reason!, /清空/)
  const patches: unknown[] = []
  const writer = {
    createCollection: async () => {}, updateCollection: async () => {}, createField: async () => {},
    createRelation: async () => {}, updateRelation: async () => {},
    updateField: async (collection: string, name: string, patch: { meta?: Record<string, unknown> }) => {
      assert.equal(collection, 'article_contexts')
      assert.equal(name, 'object')
      patches.push(patch)
      Object.assign(state.fields.find((item) => item.field === name)!.meta!, patch.meta)
    },
  }
  await executeApply({ manifest, plan, writer, dryRun: true })
  assert.equal(patches.length, 0)
  assert.equal((await executeApply({ manifest, plan, writer })).status, 'success')
  assert.deepEqual(patches, [{ meta: { hidden: true, conditions } }])
  assert.equal(createPlan(manifest, state, 'http://localhost:8055').summary.update, 0)
})

test('conditions 对象键无序、数组有序，缺省保留，null 与 [] 明确清空', () => {
  const manifest = fixture()
  const target = manifest.fields.find((item) => item.field === 'object')!
  target.meta.conditions = conditions
  const state = structuredClone({ collections: manifest.collections.map((item) => ({ ...item })), fields: manifest.fields.map((item) => ({ ...item })), relations: manifest.relations.map((item) => ({ ...item })) })
  const current = state.fields.find((item) => item.field === 'object')!
  current.meta!.conditions = conditions.map((item) => ({ ...item, rule: { type: { [Object.keys(item.rule.type)[0]!]: ['object', 'aspect'] } } }))
  const action = () => createPlan(manifest, state, 'http://localhost:8055').operations.find((item) => item.resource === 'article_contexts.object')!.action
  assert.equal(action(), 'unchanged')
  target.meta.conditions = [...conditions].reverse()
  assert.equal(action(), 'update')
  delete target.meta.conditions
  assert.equal(action(), 'unchanged')
  for (const empty of [null, []]) {
    target.meta.conditions = empty
    assert.equal(action(), 'update')
    current.meta!.conditions = empty === null ? [] : null
    assert.equal(action(), 'unchanged')
    current.meta!.conditions = conditions
  }
})

test('条件不会放宽 special、数据库约束和未知 meta 的保护', () => {
  for (const [key, value, action] of [['special', ['uuid'], 'dangerous'], ['is_nullable', false, 'dangerous'], ['unknown', true, 'conflict']] as const) {
    const manifest = fixture()
    const state = structuredClone({ collections: manifest.collections.map((item) => ({ ...item })), fields: manifest.fields.map((item) => ({ ...item })), relations: manifest.relations.map((item) => ({ ...item })) })
    const target = manifest.fields.find((item) => item.field === 'object')!
    target.meta.conditions = conditions
    if (key === 'is_nullable') target.schema!.is_nullable = value
    else Object.assign(target.meta, { [key]: value })
    assert.equal(createPlan(manifest, state, 'http://localhost:8055').operations.find((item) => item.resource === 'article_contexts.object')!.action, action)
  }
})

test('conditions 校验定位来源、字段、条件及非法属性或过滤规则', () => {
  const invalid = [
    {}, [null], [{ name: '条件', rule: {}, hidden: 'false' }],
    [{ name: '条件', rule: { type: { _in: 'x' } } }],
    [{ name: '条件', rule: { _and: {} } }], [{ name: '条件', rule: { type: { _typo: 1 } } }],
    [{ name: '条件', rule: { type: { _eq: 'x' } }, unsupported: true }],
    [{ name: '条件', rule: { type: 'x' } }], [{ name: '条件', rule: [] }], [{ name: '条件', rule: { _eq: 'x' } }],
    [{ name: '条件', rule: {}, clear_hidden_value_on_save: 'true' }],
  ]
  for (const value of invalid) {
    const manifest = fixture()
    Object.assign(manifest.fields.find((item) => item.field === 'object')!.meta, { conditions: value })
    assert.ok(validateManifest(manifest, defaultConfig).some((message) => message.includes('content.ts') && message.includes('article_contexts.object') && message.includes('conditions')), JSON.stringify(value))
  }
  const manifest = fixture()
  manifest.fields[2]!.meta.conditions = conditions
  assert.deepEqual(validateManifest(manifest, defaultConfig), [])
})

test('translations 校验自然键重复、结构、长度，允许空文字和完整 Unicode', () => {
  const manifest = fixture()
  Object.assign(manifest.resources, { translations: [
    resource('translations', { key: 'sun-zh', data: { key: 'context.sun', language: 'zh-CN', value: '太阳\n☀️' } }),
    resource('translations', { key: 'sun-en', data: { key: 'context.sun', language: 'en-US', value: '' } }),
  ].map((item) => ({ ...item, source: 'translations.ts' })) })
  assert.deepEqual(validateManifest(manifest, defaultConfig), [])
  const translations = Object.values(manifest.resources).flat().filter((item) => item.type === ('translations'))
  translations[1]!.data.language = 'zh-CN'
  assert.ok(validateManifest(manifest, defaultConfig).some((message) => message.includes('重复') && message.includes('translations.ts')))
  for (const data of [{ key: 'x'.repeat(256), language: 'en-US', value: 'x' }, { key: 'x', language: 'x'.repeat(256), value: 'x' }, { key: '', language: 'en-US', value: 'x' }, { key: 'x', language: '', value: 'x' }, { key: 'x', language: 'en-US', value: 1 }, { key: 'x', language: 'en-US' }, { key: 'x', language: 'en-US', value: 'x', id: 'uuid' }]) {
    translations[0]!.data = data
    assert.ok(validateManifest(manifest, defaultConfig).some((message) => message.includes('translations.ts') && message.includes('sun-zh')))
  }
})


test('translations 非法记录结构提供校验错误，不抛出运行时属性访问错误', () => {
  for (const records of [null, {}, [null], [{ type: 'translations', key: 'invalid', data: null }]]) {
    const manifest = fixture()
    Object.assign(manifest.resources, { translations: records })
    assert.ok(validateManifest(manifest, defaultConfig).length > 0)
  }
})
