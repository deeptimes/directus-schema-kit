import { resource } from '@deeptimes/directus-schema-kit'

export default [
  resource('policies', {
    key: 'student',
    data: { name: '学员策略', icon: 'school', description: '读取已发布课程并管理自己的学习数据。', app_access: true, admin_access: false },
  }),
  resource('policies', {
    key: 'instructor',
    data: { name: '讲师策略', icon: 'co_present', description: '管理本人名下课程及下属章节课时。', app_access: true, admin_access: false },
  }),
  resource('policies', {
    key: 'operator',
    data: { name: '课程运营策略', icon: 'support_agent', description: '管理在线课程项目的全部业务集合。', app_access: true, admin_access: false },
  }),
]
