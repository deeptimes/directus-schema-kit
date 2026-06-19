import { ref, resource } from '@deeptimes/directus-schema-kit'

export default [
  resource('folders', {
    key: 'course-assets',
    data: { name: '课程资源', parent: null },
  }),
  resource('folders', {
    key: 'course-covers',
    data: { name: '课程封面', parent: ref('folders.course-assets') },
  }),
  resource('folders', {
    key: 'lesson-attachments',
    data: { name: '课时附件', parent: ref('folders.course-assets') },
  }),
]
