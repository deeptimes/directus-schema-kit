import { collection, defineSchema, field, relation } from '@deeptimes/directus-schema-kit'

const accessChoices = [
  { text: '公开', value: 'public', color: '#2ECDA7' },
  { text: '会员', value: 'member', color: '#6644FF' },
]

const accessField = (defaultValue: 'public' | 'member') => field.string('access_level', {
  label: '访问级别',
  required: true,
  defaultValue,
  interface: 'select-dropdown',
  options: { choices: accessChoices },
  display: 'labels',
  displayOptions: { choices: accessChoices },
})

export default defineSchema({
  collections: [
    collection({
      name: 'blog_posts',
      label: '博客文章',
      icon: 'article',
      group: 'blog',
      displayTemplate: '{{title}}',
      fields: [
        field.status(),
        field.sort(),
        field.string('slug', { label: 'URL 标识', required: true, unique: true, maxLength: 200 }),
        field.string('title', { label: '标题', required: true }),
        field.text('summary', { label: '摘要', required: true }),
        field.markdown('content', { label: '正文', required: true }),
        accessField('public'),
        field.integer('reading_minutes', { label: '预计阅读分钟', required: true, defaultValue: 1 }),
        field.toggle('is_featured', { label: '推荐文章', defaultValue: false, labelOn: '推荐', labelOff: '普通' }),
        field.tags('keywords', { label: 'SEO 关键词' }),
        field.code('seo', { label: 'SEO 配置', type: 'json', language: 'json' }),
        field.dateTime('date_published', { label: '发布时间' }),
        ...field.audit(),
      ],
    }),
    collection({
      name: 'blog_downloads',
      label: '文章下载',
      icon: 'download',
      group: 'blog',
      displayTemplate: '{{title}}',
      fields: [
        field.status(),
        field.sort(),
        field.string('slug', { label: '下载标识', required: true, unique: true, maxLength: 200 }),
        field.string('title', { label: '标题', required: true }),
        field.text('description', { label: '说明' }),
        accessField('member'),
        field.integer('download_count', { label: '下载次数', required: true, defaultValue: 0, readonly: true }),
        field.dateTime('date_available_from', { label: '开放时间' }),
        field.dateTime('date_available_until', { label: '截止时间' }),
        ...field.audit(),
      ],
    }),
  ],
  relations: [
    relation.m2o({
      collection: 'blog_posts',
      field: 'category',
      relatedCollection: 'blog_categories',
      fieldOptions: { label: '分类', required: true, displayTemplate: '{{name}}' },
    }),
    relation.m2o({
      collection: 'blog_posts',
      field: 'user_author',
      relatedCollection: 'directus_users',
      fieldOptions: { label: '作者', displayTemplate: '{{first_name}} {{last_name}}' },
    }),
    relation.image({
      collection: 'blog_posts',
      field: 'cover',
      fieldOptions: { label: '封面图片' },
    }),
    relation.file({
      collection: 'blog_posts',
      field: 'featured_video',
      allowedMimeTypes: ['video/*'],
      fieldOptions: { label: '特色视频' },
    }),
    relation.files({
      collection: 'blog_posts',
      field: 'gallery',
      allowedMimeTypes: ['image/*'],
      fieldOptions: { label: '文章画廊' },
    }),
    relation.m2m({
      collection: 'blog_posts',
      field: 'tags',
      relatedCollection: 'blog_tags',
      fieldOptions: { label: '标签' },
    }),
    relation.o2m({
      collection: 'blog_posts',
      field: 'downloads',
      relatedCollection: 'blog_downloads',
      relatedField: 'post',
      onDelete: 'CASCADE',
      fieldOptions: { label: '下载资源' },
    }),
    relation.file({
      collection: 'blog_downloads',
      field: 'file',
      onDelete: 'RESTRICT',
      fieldOptions: { label: '下载文件', required: true },
    }),
  ],
})
