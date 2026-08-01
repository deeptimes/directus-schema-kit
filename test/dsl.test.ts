import assert from 'node:assert/strict'
import test from 'node:test'
import { collection, env, field, preset, ref, relation } from '../src/index.js'
import { expandRelationBlueprint } from '../src/dsl/expand.js'

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

test('tabular preset 生成确定性字段顺序和约定列宽', () => {
  const definition = preset.tabular({
    collection: 'articles',
    icon: 'article',
    color: '#6644FF',
    fields: ['status', 'title', 'slug', 'description', 'cover'],
    widths: { slug: 240 },
  })

  assert.equal(definition.type, 'presets')
  assert.equal(definition.key, 'default-articles-tabular')
  assert.deepEqual(definition.data.layout_query, { tabular: { page: 1, fields: ['status', 'title', 'slug', 'description', 'cover'] } })
  assert.deepEqual(definition.data.layout_options, { tabular: { widths: { status: 100, title: 220, slug: 240, description: 280, cover: 120 } } })
  assert.equal(definition.data.role, null)
  assert.equal(definition.data.user, null)
  assert.equal(definition.data.bookmark, null)
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
  assert.deepEqual(env('ADMIN_TOKEN'), { $env: 'ADMIN_TOKEN' })
  assert.deepEqual(ref('roles.editor'), { $ref: 'roles.editor' })
  assert.throws(() => env('invalid-name'))
})

test('Markdown、Tags、Code、Toggle 与新增基础类型映射到 Directus Field Type/Interface', () => {
  assert.deepEqual([field.markdown('body').type, field.markdown('body').meta.interface], ['text', 'input-rich-text-md'])
  assert.deepEqual([field.tags('tags').type, field.tags('tags').meta.interface], ['json', 'tags'])
  assert.equal(field.tags('tags', { type: 'csv' }).type, 'csv')
  assert.deepEqual([field.code('config', { type: 'json', language: 'json' }).type, field.code('config', { type: 'json' }).meta.interface], ['json', 'input-code'])
  assert.deepEqual(field.toggle('enabled', { labelOn: '是', labelOff: '否' }).meta.options, { labelOn: '是', labelOff: '否' })
  assert.deepEqual(
    [field.time('time').type, field.timestamp('stamp').type, field.bigInteger('big').type, field.float('ratio').type, field.csv('values').type],
    ['time', 'timestamp', 'bigInteger', 'float', 'csv'],
  )
})

test('M2M blueprint 确定性展开 junction、外键、relation 和 alias', () => {
  const expanded = expandRelationBlueprint(relation.m2m({ collection: 'articles', field: 'tags', relatedCollection: 'tags' }))
  assert.equal(expanded.collections[0]?.collection, 'articles_tags')
  assert.equal(expanded.collections[0]?.meta.hidden, true)
  assert.equal(expanded.collections[0]?.meta.icon, 'import_export')
  assert.equal(expanded.collections[0]?.meta.group, 'articles')
  assert.deepEqual(expanded.fields.map((item) => `${item.collection}.${item.field}`), [
    'articles_tags.id', 'articles.tags', 'articles_tags.articles_id', 'articles_tags.tags_id', 'articles_tags.sort',
  ])
  assert.equal(expanded.fields[1]?.type, 'alias')
  assert.equal(expanded.relations[0]?.meta?.junction_field, 'tags_id')
  assert.equal(expanded.relations[1]?.meta?.junction_field, 'articles_id')
})

test('M2A blueprint 使用 nullable related_collection 和 allowed collections', () => {
  const expanded = expandRelationBlueprint(relation.m2a({ collection: 'pages', field: 'blocks', allowedCollections: ['text_blocks', 'image_blocks'] }))
  assert.equal(expanded.collections[0]?.meta.hidden, true)
  assert.equal(expanded.collections[0]?.meta.group, 'pages')
  const polymorphic = expanded.relations.find((item) => item.field === 'item')
  assert.equal(polymorphic?.related_collection, null)
  assert.equal(polymorphic?.meta?.one_collection_field, 'collection')
  assert.deepEqual(polymorphic?.meta?.one_allowed_collections, ['text_blocks', 'image_blocks'])
  assert.equal(polymorphic?.meta?.junction_field, 'pages_id')
})

test('File、Image、Files 与 Translations 使用固定目标和完整关系展开', () => {
  const file = expandRelationBlueprint(relation.file({ collection: 'articles', field: 'video', allowedMimeTypes: ['video/*'] }))
  assert.equal(file.relations[0]?.related_collection, 'directus_files')
  assert.equal(file.fields[0]?.meta.interface, 'file')
  assert.equal(file.fields[0]?.meta.display, 'file')
  assert.deepEqual(file.fields[0]?.meta.special, ['file'])
  assert.deepEqual(file.fields[0]?.meta.options, { allowedMimeTypes: ['video/*'] })
  const image = expandRelationBlueprint(relation.image({ collection: 'articles', field: 'cover' }))
  assert.equal(image.fields[0]?.meta.interface, 'file-image')
  assert.equal(image.fields[0]?.meta.display, 'image')
  assert.deepEqual(image.fields[0]?.meta.special, ['file'])
  assert.deepEqual(image.fields[0]?.meta.options, { allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/avif', 'image/tiff'] })
  const files = expandRelationBlueprint(relation.files({ collection: 'articles', field: 'attachments', allowedMimeTypes: ['image/*'] }))
  assert.equal(files.collections[0]?.collection, 'articles_files')
  assert.equal(files.collections[0]?.meta.hidden, true)
  assert.equal(files.collections[0]?.meta.icon, 'import_export')
  assert.equal(files.collections[0]?.meta.group, 'articles')
  assert.equal(files.fields[0]?.type, 'integer')
  assert.equal(files.fields[0]?.schema?.has_auto_increment, true)
  assert.equal(files.fields[1]?.meta.interface, 'files')
  assert.deepEqual(files.fields[1]?.meta.special, ['files'])
  assert.deepEqual(files.fields[1]?.meta.options, { template: null, allowedMimeTypes: ['image/*'] })
  assert.deepEqual(files.fields[1]?.meta.display_options, { template: '{{directus_files_id.$thumbnail}}{{directus_files_id.title}}' })
  assert.equal(files.fields[2]?.meta.hidden, true)
  assert.equal(files.fields[3]?.meta.hidden, true)
  assert.equal(files.fields[4]?.meta.interface, null)
  assert.equal(files.relations[0]?.schema?.on_delete, 'SET NULL')
  assert.equal(files.relations[0]?.meta?.sort_field, 'sort')
  const translations = expandRelationBlueprint(relation.translations({ collection: 'articles' }))
  assert.equal(translations.collections[0]?.collection, 'articles_translations')
  assert.equal(translations.collections[0]?.meta.hidden, true)
  assert.equal(translations.collections[0]?.meta.group, 'articles')
  assert.equal(translations.relations[1]?.related_collection, 'languages')
})
