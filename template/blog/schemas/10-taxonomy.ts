import { collection, collectionGroup, defineSchema, field, relation } from '@deeptimes/directus-schema-kit'

const group = 'blog'

export default defineSchema({
  groups: [
    collectionGroup({ name: group, label: 'IT 博客', icon: 'rss_feed' }),
  ],
  collections: [
    collection({
      name: 'blog_categories',
      label: '文章分类',
      icon: 'folder',
      group,
      displayTemplate: '{{name}}',
      fields: [
        field.status(),
        field.sort(),
        field.string('name', { label: '名称', required: true, maxLength: 120 }),
        field.string('slug', { label: 'URL 标识', required: true, unique: true, maxLength: 160 }),
        field.text('description', { label: '描述' }),
        ...field.audit(),
      ],
    }),
    collection({
      name: 'blog_tags',
      label: '文章标签',
      icon: 'sell',
      group,
      displayTemplate: '{{name}}',
      fields: [
        field.status(),
        field.sort(),
        field.string('name', { label: '名称', required: true, maxLength: 80 }),
        field.string('slug', { label: 'URL 标识', required: true, unique: true, maxLength: 120 }),
        field.text('description', { label: '描述' }),
        field.string('color', { label: '标签颜色', interface: 'select-color', maxLength: 32 }),
        ...field.audit(),
      ],
    }),
  ],
  relations: [
    relation.image({
      collection: 'blog_categories',
      field: 'image',
      fieldOptions: { label: '分类图片' },
    }),
  ],
})
