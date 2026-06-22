import { ref, resource } from '@deeptimes/directus-schema-kit'

const published = { status: { _eq: 'published' } }
const publicContent = { _and: [published, { access_level: { _eq: 'public' } }] }
const memberContent = { _and: [published, { access_level: { _in: ['public', 'member'] } }] }

export default [
  resource('permissions', {
    key: 'blog-public-categories-read',
    data: { policy: ref('policies.blog-public'), collection: 'blog_categories', action: 'read', permissions: published, fields: ['*'] },
  }),
  resource('permissions', {
    key: 'blog-public-tags-read',
    data: { policy: ref('policies.blog-public'), collection: 'blog_tags', action: 'read', permissions: published, fields: ['*'] },
  }),
  resource('permissions', {
    key: 'blog-public-posts-read',
    data: { policy: ref('policies.blog-public'), collection: 'blog_posts', action: 'read', permissions: publicContent, fields: ['*'] },
  }),
  resource('permissions', {
    key: 'blog-public-post-tags-read',
    data: {
      policy: ref('policies.blog-public'),
      collection: 'blog_posts_tags',
      action: 'read',
      permissions: { blog_posts_id: publicContent },
      fields: ['*'],
    },
  }),
  resource('permissions', {
    key: 'blog-public-post-gallery-read',
    data: {
      policy: ref('policies.blog-public'),
      collection: 'blog_posts_files',
      action: 'read',
      permissions: { blog_posts_id: publicContent },
      fields: ['*'],
    },
  }),
  resource('permissions', {
    key: 'blog-public-comments-read',
    data: { policy: ref('policies.blog-public'), collection: 'blog_comments', action: 'read', permissions: published, fields: ['*'] },
  }),
  resource('permissions', {
    key: 'blog-public-media-read',
    data: {
      policy: ref('policies.blog-public'),
      collection: 'directus_files',
      action: 'read',
      permissions: { folder: { _eq: ref('folders.blog-media') } },
      fields: ['id', 'title', 'description', 'type', 'filename_download', 'filesize', 'width', 'height', 'duration', 'folder'],
    },
  }),

  resource('permissions', {
    key: 'blog-member-categories-read',
    data: { policy: ref('policies.blog-member'), collection: 'blog_categories', action: 'read', permissions: published, fields: ['*'] },
  }),
  resource('permissions', {
    key: 'blog-member-tags-read',
    data: { policy: ref('policies.blog-member'), collection: 'blog_tags', action: 'read', permissions: published, fields: ['*'] },
  }),
  resource('permissions', {
    key: 'blog-member-posts-read',
    data: { policy: ref('policies.blog-member'), collection: 'blog_posts', action: 'read', permissions: memberContent, fields: ['*'] },
  }),
  resource('permissions', {
    key: 'blog-member-post-tags-read',
    data: {
      policy: ref('policies.blog-member'),
      collection: 'blog_posts_tags',
      action: 'read',
      permissions: { blog_posts_id: memberContent },
      fields: ['*'],
    },
  }),
  resource('permissions', {
    key: 'blog-member-post-gallery-read',
    data: {
      policy: ref('policies.blog-member'),
      collection: 'blog_posts_files',
      action: 'read',
      permissions: { blog_posts_id: memberContent },
      fields: ['*'],
    },
  }),
  resource('permissions', {
    key: 'blog-member-downloads-read',
    data: { policy: ref('policies.blog-member'), collection: 'blog_downloads', action: 'read', permissions: memberContent, fields: ['*'] },
  }),
  resource('permissions', {
    key: 'blog-member-files-read',
    data: {
      policy: ref('policies.blog-member'),
      collection: 'directus_files',
      action: 'read',
      permissions: { folder: { _in: [ref('folders.blog-media'), ref('folders.blog-downloads')] } },
      fields: ['id', 'title', 'description', 'type', 'filename_download', 'filesize', 'width', 'height', 'duration', 'folder'],
    },
  }),
  resource('permissions', {
    key: 'blog-member-comments-read',
    data: {
      policy: ref('policies.blog-member'),
      collection: 'blog_comments',
      action: 'read',
      permissions: { _or: [published, { user_author: { _eq: '$CURRENT_USER' } }] },
      fields: ['*'],
    },
  }),
  resource('permissions', {
    key: 'blog-member-comments-create',
    data: {
      policy: ref('policies.blog-member'),
      collection: 'blog_comments',
      action: 'create',
      permissions: {},
      validation: { user_author: { _eq: '$CURRENT_USER' } },
      presets: { user_author: '$CURRENT_USER', status: 'draft', is_pinned: false },
      fields: ['content', 'post', 'parent'],
    },
  }),
  resource('permissions', {
    key: 'blog-member-comments-update',
    data: {
      policy: ref('policies.blog-member'),
      collection: 'blog_comments',
      action: 'update',
      permissions: { user_author: { _eq: '$CURRENT_USER' } },
      validation: { user_author: { _eq: '$CURRENT_USER' } },
      fields: ['content'],
    },
  }),
  resource('permissions', {
    key: 'blog-member-comments-delete',
    data: {
      policy: ref('policies.blog-member'),
      collection: 'blog_comments',
      action: 'delete',
      permissions: { user_author: { _eq: '$CURRENT_USER' } },
      fields: ['id'],
    },
  }),
  resource('permissions', {
    key: 'blog-member-profiles-read',
    data: {
      policy: ref('policies.blog-member'),
      collection: 'blog_member_profiles',
      action: 'read',
      permissions: { user_account: { _eq: '$CURRENT_USER' } },
      fields: ['*'],
    },
  }),
  resource('permissions', {
    key: 'blog-member-profiles-create',
    data: {
      policy: ref('policies.blog-member'),
      collection: 'blog_member_profiles',
      action: 'create',
      permissions: {},
      validation: { user_account: { _eq: '$CURRENT_USER' } },
      presets: { user_account: '$CURRENT_USER', status: 'draft', membership_status: 'active' },
      fields: ['display_name', 'biography', 'website', 'preferences'],
    },
  }),
  resource('permissions', {
    key: 'blog-member-profiles-update',
    data: {
      policy: ref('policies.blog-member'),
      collection: 'blog_member_profiles',
      action: 'update',
      permissions: { user_account: { _eq: '$CURRENT_USER' } },
      validation: { user_account: { _eq: '$CURRENT_USER' } },
      fields: ['display_name', 'biography', 'website', 'preferences'],
    },
  }),
]
