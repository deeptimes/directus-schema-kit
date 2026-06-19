import { ref, resource, type DeclarativeValue } from '@deeptimes/directus-schema-kit'

const currentUser = '$CURRENT_USER'
const published = { status: { _eq: 'published' } }
const ownCourse = { instructor: { _eq: currentUser } }
const ownChapter = { course: ownCourse }
const ownLesson = { chapter: ownChapter }
const operatorCollections = [
  'course_categories', 'courses', 'course_chapters', 'course_lessons',
  'course_orders', 'course_enrollments', 'lesson_progress', 'course_reviews',
] as const
const writeActions = ['create', 'read', 'update', 'delete'] as const

function permission(
  key: string,
  policy: 'student' | 'instructor' | 'operator',
  collection: string,
  action: 'create' | 'read' | 'update' | 'delete',
  permissions: Record<string, DeclarativeValue> | null,
  fields: string[] = ['*'],
) {
  return resource('permissions', {
    key,
    data: {
      policy: ref(`policies.${policy}`), collection, action, permissions,
      validation: null, presets: null, fields,
    },
  })
}

export default [
  permission('student-categories-read', 'student', 'course_categories', 'read', published),
  permission('student-courses-read', 'student', 'courses', 'read', published),
  permission('student-chapters-read', 'student', 'course_chapters', 'read', { _and: [published, { course: published }] }),
  permission('student-lessons-read', 'student', 'course_lessons', 'read', { _and: [published, { chapter: { course: published } }] }),
  permission('student-enrollments-read', 'student', 'course_enrollments', 'read', { student: { _eq: currentUser } }),
  permission('student-progress-read', 'student', 'lesson_progress', 'read', { enrollment: { student: { _eq: currentUser } } }),
  permission('student-progress-create', 'student', 'lesson_progress', 'create', { enrollment: { student: { _eq: currentUser } } }),
  permission('student-progress-update', 'student', 'lesson_progress', 'update', { enrollment: { student: { _eq: currentUser } } }),
  permission('student-reviews-read', 'student', 'course_reviews', 'read', { _or: [{ is_visible: { _eq: true } }, { student: { _eq: currentUser } }] }),
  permission('student-reviews-create', 'student', 'course_reviews', 'create', { student: { _eq: currentUser } }),
  permission('student-reviews-update', 'student', 'course_reviews', 'update', { student: { _eq: currentUser } }),

  permission('instructor-courses-create', 'instructor', 'courses', 'create', ownCourse),
  permission('instructor-courses-read', 'instructor', 'courses', 'read', ownCourse),
  permission('instructor-courses-update', 'instructor', 'courses', 'update', ownCourse),
  permission('instructor-chapters-create', 'instructor', 'course_chapters', 'create', ownChapter),
  permission('instructor-chapters-read', 'instructor', 'course_chapters', 'read', ownChapter),
  permission('instructor-chapters-update', 'instructor', 'course_chapters', 'update', ownChapter),
  permission('instructor-lessons-create', 'instructor', 'course_lessons', 'create', ownLesson),
  permission('instructor-lessons-read', 'instructor', 'course_lessons', 'read', ownLesson),
  permission('instructor-lessons-update', 'instructor', 'course_lessons', 'update', ownLesson),
  permission('instructor-enrollments-read', 'instructor', 'course_enrollments', 'read', { course: ownCourse }),
  permission('instructor-reviews-read', 'instructor', 'course_reviews', 'read', { course: ownCourse }),

  ...operatorCollections.flatMap((collection) => writeActions.map((action) =>
    permission(`operator-${collection}-${action}`, 'operator', collection, action, null),
  )),
]
