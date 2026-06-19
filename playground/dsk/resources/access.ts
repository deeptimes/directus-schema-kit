import { ref, resource } from '@deeptimes/directus-schema-kit'

export default [
  resource('access', {
    key: 'student',
    data: { role: ref('roles.student'), policy: ref('policies.student'), user: null, sort: 10 },
  }),
  resource('access', {
    key: 'instructor',
    data: { role: ref('roles.instructor'), policy: ref('policies.instructor'), user: null, sort: 20 },
  }),
  resource('access', {
    key: 'operator',
    data: { role: ref('roles.operator'), policy: ref('policies.operator'), user: null, sort: 30 },
  }),
]
