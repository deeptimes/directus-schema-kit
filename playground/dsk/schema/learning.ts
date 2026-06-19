import { collection, collectionGroup, defineModule, field } from '@deeptimes/directus-schema-kit'

const group = 'course_learning'

export default defineModule({
  id: 'learning',
  version: '1.0.0',
  dependsOn: ['catalog', 'commerce'],
  groups: [
    collectionGroup({ name: group, label: '学习记录', icon: 'insights', order: 30 }),
  ],
  collections: [
    collection({
      name: 'lesson_progress',
      label: '课时进度',
      icon: 'timelapse',
      group,
      order: 10,
      archive: false,
      displayTemplate: '{{enrollment.student.email}} · {{lesson.title}}',
      fields: [
        field.m2o('enrollment', {
          label: '报名记录', collection: 'course_enrollments', required: true,
          onDelete: 'CASCADE', displayTemplate: '{{student.email}} · {{course.title}}',
        }),
        field.m2o('lesson', {
          label: '课时', collection: 'course_lessons', required: true,
          onDelete: 'CASCADE', displayTemplate: '{{title}}',
        }),
        field.integer('progress_seconds', { label: '已学秒数', required: true, defaultValue: 0, width: 'half' }),
        field.integer('last_position_seconds', { label: '上次播放位置', required: true, defaultValue: 0, width: 'half' }),
        field.boolean('completed', { label: '已完成', defaultValue: false, width: 'half' }),
        field.dateTime('completed_at', { label: '完成时间', width: 'half' }),
        field.json('client_context', { label: '客户端上下文', hidden: true }),
        ...field.audit(),
      ],
    }),
  ],
  cleanupCollections: ['lesson_progress'],
})
