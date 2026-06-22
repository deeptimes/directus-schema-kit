import { collection, defineSchema, field, relation } from '@deeptimes/directus-schema-kit'

const membershipChoices = [
  { text: '有效', value: 'active', color: '#2ECDA7' },
  { text: '已到期', value: 'expired', color: '#A2B5CD' },
  { text: '已停用', value: 'suspended', color: '#E35169' },
]

export default defineSchema({
  collections: [
    collection({
      name: 'blog_member_profiles',
      label: '会员资料',
      icon: 'badge',
      group: 'blog',
      displayTemplate: '{{display_name}}',
      fields: [
        field.status(),
        field.string('display_name', { label: '显示名称', required: true, maxLength: 120 }),
        field.text('biography', { label: '个人简介' }),
        field.string('website', { label: '个人网站', interface: 'input', maxLength: 255 }),
        field.string('membership_status', {
          label: '会员状态',
          required: true,
          defaultValue: 'active',
          interface: 'select-dropdown',
          options: { choices: membershipChoices },
          display: 'labels',
          displayOptions: { choices: membershipChoices },
        }),
        field.dateTime('date_membership_expires', { label: '会员到期时间' }),
        field.json('preferences', { label: '用户偏好' }),
        field.m2o('user_account', {
          label: 'Directus 用户',
          collection: 'directus_users',
          required: true,
          unique: true,
          onDelete: 'CASCADE',
          displayTemplate: '{{email}}',
        }),
        ...field.audit(),
      ],
    }),
    collection({
      name: 'blog_comments',
      label: '文章评论',
      icon: 'comment',
      group: 'blog',
      fields: [
        field.status(),
        field.toggle('is_pinned', { label: '置顶', defaultValue: false, labelOn: '置顶', labelOff: '普通' }),
        field.text('content', { label: '评论内容', required: true }),
        ...field.audit(),
      ],
    }),
  ],
  relations: [
    relation.o2m({
      collection: 'blog_posts',
      field: 'comments',
      relatedCollection: 'blog_comments',
      relatedField: 'post',
      onDelete: 'CASCADE',
      fieldOptions: { label: '评论' },
    }),
    relation.m2o({
      collection: 'blog_comments',
      field: 'parent',
      relatedCollection: 'blog_comments',
      onDelete: 'CASCADE',
      fieldOptions: { label: '父评论' },
    }),
    relation.m2o({
      collection: 'blog_comments',
      field: 'user_author',
      relatedCollection: 'directus_users',
      onDelete: 'SET NULL',
      fieldOptions: { label: '评论用户', displayTemplate: '{{first_name}} {{last_name}}' },
    }),
  ],
})
