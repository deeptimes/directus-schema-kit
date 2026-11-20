import { settings } from '@deeptimes/directus-schema-kit'

/** v3 settings fixture：受控 scalar 字段 + 平台默认 UI 配置。 */
export default settings({
  project_name: 'DSK V3 Playground',
  project_descriptor: 'v3 settings fixture',
  default_language: 'zh-CN',
  custom_css: '#app, #main-content, body {.collection-note{opacity:100}}',
  module_bar: [
    { type: 'module', id: 'content', enabled: true },
    { type: 'module', id: 'visual', enabled: false },
    { type: 'module', id: 'users', enabled: true },
    { type: 'module', id: 'files', enabled: true },
    { type: 'module', id: 'insights', enabled: false },
    { type: 'module', id: 'flows', enabled: true },
    { type: 'module', id: 'deployments', enabled: false },
    { type: 'module', id: 'settings', enabled: true, locked: true },
  ],
})
