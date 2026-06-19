import { collection, collectionGroup, defineModule, field } from '@deeptimes/directus-schema-kit'

const group = 'course_commerce'

export default defineModule({
  id: 'commerce',
  version: '1.0.0',
  dependsOn: ['catalog'],
  groups: [
    collectionGroup({ name: group, label: '交易与报名', icon: 'payments', order: 20 }),
  ],
  collections: [
    collection({
      name: 'course_orders',
      label: '课程订单',
      icon: 'receipt_long',
      group,
      order: 10,
      displayTemplate: '{{order_no}}',
      fields: [
        field.status({ defaultValue: 'draft' }),
        field.string('order_no', { label: '订单号', required: true, unique: true, width: 'half' }),
        field.m2o('student', {
          label: '学员', collection: 'directus_users', required: true,
          onDelete: 'RESTRICT', displayTemplate: '{{email}}', width: 'half',
        }),
        field.m2o('course', {
          label: '课程', collection: 'courses', required: true,
          onDelete: 'RESTRICT', displayTemplate: '{{title}}',
        }),
        field.decimal('amount', { label: '实付金额', required: true, precision: 10, scale: 2, width: 'half' }),
        field.string('currency', { label: '币种', required: true, defaultValue: 'CNY', maxLength: 3, width: 'half' }),
        field.string('payment_status', {
          label: '支付状态', required: true, defaultValue: 'pending', width: 'half',
          interface: 'select-dropdown', display: 'labels',
          options: { choices: [
            { text: '待支付', value: 'pending' },
            { text: '已支付', value: 'paid' },
            { text: '已退款', value: 'refunded' },
            { text: '已关闭', value: 'closed' },
          ] },
        }),
        field.string('payment_provider', { label: '支付渠道', width: 'half' }),
        field.dateTime('paid_at', { label: '支付时间', width: 'half' }),
        field.json('provider_payload', { label: '支付渠道原始数据', hidden: true }),
        ...field.audit(),
      ],
    }),
    collection({
      name: 'course_enrollments',
      label: '课程报名',
      icon: 'how_to_reg',
      group,
      order: 20,
      displayTemplate: '{{student.email}} · {{course.title}}',
      fields: [
        field.status({ defaultValue: 'published' }),
        field.m2o('student', {
          label: '学员', collection: 'directus_users', required: true,
          onDelete: 'CASCADE', displayTemplate: '{{email}}', width: 'half',
        }),
        field.m2o('course', {
          label: '课程', collection: 'courses', required: true,
          onDelete: 'CASCADE', displayTemplate: '{{title}}', width: 'half',
        }),
        field.m2o('order', {
          label: '来源订单', collection: 'course_orders', onDelete: 'SET NULL',
          displayTemplate: '{{order_no}}',
        }),
        field.string('source', {
          label: '报名来源', required: true, defaultValue: 'purchase', width: 'half',
          interface: 'select-dropdown', options: { choices: [
            { text: '购买', value: 'purchase' },
            { text: '赠送', value: 'gift' },
            { text: '运营分配', value: 'manual' },
          ] },
        }),
        field.integer('progress_percent', { label: '学习进度（%）', defaultValue: 0, readonly: true, width: 'half' }),
        field.dateTime('enrolled_at', { label: '报名时间', required: true, width: 'half' }),
        field.dateTime('expires_at', { label: '到期时间', width: 'half' }),
        field.dateTime('completed_at', { label: '完成时间', width: 'half' }),
        ...field.audit(),
      ],
    }),
    collection({
      name: 'course_reviews',
      label: '课程评价',
      icon: 'reviews',
      group,
      order: 30,
      displayTemplate: '{{course.title}} · {{rating}}分',
      fields: [
        field.status({ defaultValue: 'published' }),
        field.m2o('student', {
          label: '学员', collection: 'directus_users', required: true,
          onDelete: 'CASCADE', displayTemplate: '{{email}}', width: 'half',
        }),
        field.m2o('course', {
          label: '课程', collection: 'courses', required: true,
          onDelete: 'CASCADE', displayTemplate: '{{title}}', width: 'half',
        }),
        field.integer('rating', { label: '评分', required: true, width: 'half', note: '1 到 5 分。' }),
        field.boolean('is_visible', { label: '前台可见', defaultValue: true, width: 'half' }),
        field.text('content', { label: '评价内容', required: true }),
        field.text('reply', { label: '运营回复' }),
        ...field.audit(),
      ],
    }),
  ],
  cleanupCollections: ['course_orders', 'course_enrollments', 'course_reviews'],
})
