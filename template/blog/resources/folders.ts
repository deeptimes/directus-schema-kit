import { resource } from '@deeptimes/directus-schema-kit'

export default [
  resource('folders', {
    key: 'blog-media',
    data: { name: 'Blog Media', parent: null },
  }),
  resource('folders', {
    key: 'blog-downloads',
    data: { name: 'Blog Downloads', parent: null },
  }),
]
