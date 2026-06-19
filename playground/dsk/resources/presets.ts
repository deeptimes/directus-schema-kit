import { ref, resource } from '@deeptimes/directus-schema-kit'

export default [
  resource('presets', {
    key: 'instructor-my-courses',
    data: {
      bookmark: '我的课程', collection: 'courses', role: ref('roles.instructor'), user: null,
      search: null, layout: 'tabular', refresh_interval: null,
      filter: { instructor: { _eq: '$CURRENT_USER' } },
      layout_query: { tabular: { fields: ['title', 'status', 'price', 'published_at'] } },
      layout_options: { tabular: { widths: { title: 320, status: 120, price: 120 } } },
    },
  }),
  resource('presets', {
    key: 'operator-pending-orders',
    data: {
      bookmark: '待支付订单', collection: 'course_orders', role: ref('roles.operator'), user: null,
      search: null, layout: 'tabular', refresh_interval: 30,
      filter: { payment_status: { _eq: 'pending' } },
      layout_query: { tabular: { fields: ['order_no', 'student', 'course', 'amount', 'date_created'] } },
      layout_options: null,
    },
  }),
]
