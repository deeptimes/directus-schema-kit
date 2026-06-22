import { resource } from '@deeptimes/directus-schema-kit'

export default resource('roles', {
  key: 'blog-member',
  data: {
    name: 'Blog Member',
    icon: 'workspace_premium',
    description: '可阅读会员文章、下载会员资源并发表评论',
  },
})
