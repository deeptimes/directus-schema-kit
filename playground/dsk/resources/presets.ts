import { preset } from '@deeptimes/directus-schema-kit'

export default [
  preset.tabular({
    collection: 'blog_categories',
    icon: 'folder',
    color: '#2ECDA7',
    fields: ['status', 'name', 'slug', 'description', 'image', 'sort', 'date_updated'],
  }),
  preset.tabular({
    collection: 'blog_tags',
    icon: 'sell',
    color: '#3399FF',
    fields: ['status', 'name', 'slug', 'description', 'color', 'sort', 'date_updated'],
  }),
  preset.tabular({
    collection: 'blog_posts',
    icon: 'article',
    color: '#6644FF',
    fields: ['status', 'title', 'slug', 'summary', 'access_level', 'category', 'user_author', 'cover', 'date_published', 'is_featured', 'reading_minutes', 'date_updated'],
  }),
  preset.tabular({
    collection: 'blog_downloads',
    icon: 'download',
    color: '#FFB020',
    fields: ['status', 'title', 'slug', 'description', 'access_level', 'post', 'file', 'date_available_from', 'date_available_until', 'download_count'],
  }),
  preset.tabular({
    collection: 'blog_member_profiles',
    icon: 'badge',
    color: '#E35169',
    fields: ['status', 'display_name', 'user_account', 'membership_status', 'date_membership_expires', 'website', 'date_updated'],
  }),
  preset.tabular({
    collection: 'blog_comments',
    icon: 'comment',
    color: '#A2B5CD',
    fields: ['status', 'content', 'post', 'user_author', 'parent', 'is_pinned', 'date_created'],
  }),
]
