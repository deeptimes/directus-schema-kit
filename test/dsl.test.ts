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

test('dateTime 默认使用统一的日期界面和显示格式', () => {
  const date = field.dateTime('date_published')

  assert.equal(date.meta.interface, 'datetime')
  assert.deepEqual(date.meta.options, { format: 'yyyy-MM-dd HH:mm' })
  assert.equal(date.meta.display, 'datetime')
  assert.deepEqual(date.meta.display_options, { format: 'yyyy-MM-dd HH:mm', use24: true })
})

test('dateTime 允许覆盖默认的日期界面和显示格式', () => {
  const date = field.dateTime('date_published', {
    options: { format: 'yyyy-MM-dd HH:mm' },
    displayOptions: { format: 'yyyy-MM-dd HH:mm', use24: false },
  })

  assert.deepEqual(date.meta.options, { format: 'yyyy-MM-dd HH:mm' })
  assert.deepEqual(date.meta.display_options, { format: 'yyyy-MM-dd HH:mm', use24: false })
})

test('status 默认使用带颜色圆点的标签显示', () => {
  const status = field.status()

  assert.equal(status.meta.display, 'labels')
  assert.deepEqual(status.meta.display_options, {
    choices: [
      { text: '草稿', value: 'draft', color: '#FFC23B' },
      { text: '已发布', value: 'published', color: '#6644FF' },
      { text: '已归档', value: 'archived', color: '#E35169' },
    ],
    showAsDot: true,
  })
})

test('常用标量字段默认使用 half 宽度并允许覆盖', () => {
  const fields = [
    field.string('title'),
    field.integer('count'),
    field.decimal('price'),
    field.boolean('enabled'),
    field.dateTime('date_published'),
  ]

  for (const definition of fields) assert.equal(definition.meta.width, 'half')
  assert.equal(field.string('summary', { width: 'full' }).meta.width, 'full')
})

test('env/ref 只保留声明，不解析运行时值', () => {
  assert.deepEqual(env('DIRECTUS_TOKEN'), { $env: 'DIRECTUS_TOKEN' })
  assert.deepEqual(ref('roles.editor'), { $ref: 'roles.editor' })
  assert.throws(() => env('invalid-name'))
})
