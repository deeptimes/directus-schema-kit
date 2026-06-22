import { ref, resource } from '@deeptimes/directus-schema-kit'

export default [
  resource('access', {
    key: 'blog-member',
    data: {
      role: ref('roles.blog-member'),
      policy: ref('policies.blog-member'),
      user: null,
    },
  }),
]
