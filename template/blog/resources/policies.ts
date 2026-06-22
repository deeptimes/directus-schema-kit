import { resource } from '@deeptimes/directus-schema-kit'

export default [
  resource('policies', {
    key: 'blog-public',
    data: {
      name: 'Blog Public Policy',
      icon: 'public',
      description: '匿名访客只读公开且已发布的博客内容',
      app_access: false,
      admin_access: false,
    },
  }),
  resource('policies', {
    key: 'blog-member',
    data: {
      name: 'Blog Member Policy',
      icon: 'workspace_premium',
      description: '会员读取高级内容并管理自己的资料和评论',
      app_access: false,
      admin_access: false,
    },
  }),
]
