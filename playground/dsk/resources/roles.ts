import { resource } from '@deeptimes/directus-schema-kit'

export default [
  resource('roles', {
    key: 'student',
    data: { name: '学员', icon: 'school', description: '购买课程并完成学习的用户。', parent: null },
  }),
  resource('roles', {
    key: 'instructor',
    data: { name: '讲师', icon: 'co_present', description: '维护本人课程及课程内容。', parent: null },
  }),
  resource('roles', {
    key: 'operator',
    data: { name: '课程运营', icon: 'support_agent', description: '管理课程、交易、报名和评价。', parent: null },
  }),
]
