import assert from 'node:assert/strict'
import test from 'node:test'
import { collection, env, field, ref } from '../src/index.js'

test('collection 展开主键、字段和关系声明', () => {
  const definition = collection({
    name: 'articles',
    label: '文章',
    primaryKey: 'integer',
    fields: [
      field.status(),
      field.m2o('author_id', { label: '作者', collection: 'authors', required: true, onDelete: 'RESTRICT' }),
    ],
  })

  assert.equal(definition.fields[0]?.field, 'id')
  assert.equal(definition.fields[0]?.schema?.has_auto_increment, true)
  assert.equal(definition.fields[2]?.relation?.related_collection, 'authors')
  assert.equal(definition.meta.archive_field, 'status')
})

test('自动生成的 UUID 主键不触发 Data Studio 必填校验', () => {
  const definition = collection({ name: 'categories', label: '分类' })
  const primary = definition.fields[0]

  assert.equal(primary?.type, 'uuid')
  assert.deepEqual(primary?.meta.special, ['uuid'])
  assert.equal(primary?.meta.required, false)
  assert.equal(primary?.schema?.is_nullable, false)
  assert.equal(primary?.schema?.is_primary_key, true)
})

test('env/ref 只保留声明，不解析运行时值', () => {
  assert.deepEqual(env('DIRECTUS_TOKEN'), { $env: 'DIRECTUS_TOKEN' })
  assert.deepEqual(ref('roles.editor'), { $ref: 'roles.editor' })
  assert.throws(() => env('invalid-name'))
})
