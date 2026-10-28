import { primaryKey, type CleanupEndpoint, type CleanupMode, type CleanupSnapshot } from './cleanup.js'
import type { DirectusReader } from './directus.js'
import { DskError } from './errors.js'

const resourceEndpoints: CleanupEndpoint[] = ['users', 'roles', 'policies', 'access', 'permissions', 'presets', 'files', 'folders']
const systemEndpoints: Record<string, string> = {
  directus_users: 'users', directus_roles: 'roles', directus_policies: 'policies', directus_access: 'access',
  directus_permissions: 'permissions', directus_presets: 'presets', directus_files: 'files', directus_folders: 'folders',
  directus_deployments: 'deployments', directus_shares: 'shares', directus_flows: 'flows', directus_operations: 'operations', directus_dashboards: 'dashboards',
  directus_panels: 'panels', directus_notifications: 'notifications', directus_activity: 'activity',
  directus_revisions: 'revisions', directus_versions: 'versions', directus_comments: 'comments',
}

export async function readCleanupSnapshot(reader: DirectusReader, mode: CleanupMode = 'full'): Promise<CleanupSnapshot> {
  const [state, me] = await Promise.all([reader.readState(), reader.readObject('users/me', 'id')])
  const persistedFields = (collection: string): string => state.fields.filter((row) => row.collection === collection && row.schema != null).map((row) => row.field).join(',') || '*'
  const settings = await reader.readObject('settings', persistedFields('directus_settings'))
  if (typeof me.id !== 'string') throw new DskError('清理需要已认证的管理员账号', 'CONNECTION_ERROR')
  const resources = Object.fromEntries(await Promise.all(resourceEndpoints.map(async (endpoint) => [endpoint, endpoint === 'permissions' ? await reader.listStoredPermissions() : await reader.listAll(endpoint, 'id', persistedFields(`directus_${endpoint}`))]))) as CleanupSnapshot['resources']
  const custom = new Set(state.collections.filter((row) => !row.collection.startsWith('directus_')).map((row) => row.collection))
  const items: CleanupSnapshot['items'] = {}
  for (const collection of state.collections) {
    if (!custom.has(collection.collection) || collection.schema === null) continue
    const pk = primaryKey(state, collection.collection)
    if (!pk) throw new DskError(`无法识别集合主键: ${collection.collection}`, 'VALIDATION_ERROR')
    const fields = new Set(persistedFields(collection.collection).split(','))
    fields.add(pk)
    for (const relation of state.relations.filter((row) => row.collection === collection.collection)) {
      fields.add(relation.field)
      const meta = relation.meta as { one_collection_field?: string } | null | undefined
      if (meta?.one_collection_field) fields.add(meta.one_collection_field)
    }
    items[collection.collection] = (collection.meta as { singleton?: boolean } | null | undefined)?.singleton
      ? await reader.readSingletonItems(collection.collection, pk, [...fields].join(','))
      : await reader.listAll(`items/${encodeURIComponent(collection.collection)}`, pk, [...fields].join(','))
  }
  const references: CleanupSnapshot['references'] = []
  const cached = new Map<string, Array<Record<string, unknown>>>([
    ['directus_settings', [settings]],
    ...resourceEndpoints.map((endpoint): [string, Array<Record<string, unknown>>] => [`directus_${endpoint}`, resources[endpoint]]),
  ])
  const targetSystems = new Set(['directus_roles', 'directus_policies', 'directus_files', 'directus_folders', 'directus_users'])
  for (const relation of state.relations) {
    // 审计日志和用户通知允许随用户生命周期由 Directus 处理；业务配置引用必须阻断。
    if (mode === 'data' && relation.related_collection?.startsWith('directus_')) continue
    if (relation.related_collection === 'directus_users' && ['directus_activity', 'directus_comments', 'directus_notifications', 'directus_sessions', 'directus_oauth_codes', 'directus_oauth_consents', 'directus_oauth_tokens'].includes(relation.collection)) continue
    const meta = relation.meta as { one_collection_field?: string; one_allowed_collections?: string[] } | null | undefined
    const polymorphic = meta?.one_allowed_collections?.some((name) => custom.has(name)) ?? false
    if (!relation.collection.startsWith('directus_') || (!custom.has(relation.related_collection ?? '') && !targetSystems.has(relation.related_collection ?? '') && !polymorphic)) continue
    if (['directus_deployment_projects', 'directus_deployment_runs'].includes(relation.collection)) {
      // 子项只有带同步副作用的嵌套 API；dry-run 不能调用。空父集可证明没有子项，否则明确阻断。
      let deployments = cached.get('directus_deployments')
      if (!deployments) { deployments = await reader.listAll('deployments', 'id', 'id,user_created'); cached.set('directus_deployments', deployments) }
      if (!deployments.length) continue
      throw new DskError(`无法无副作用地完整预检 ${relation.collection}；请先处理 deployment 配置及用户引用`, 'VALIDATION_ERROR')
    }
    let rows = cached.get(relation.collection)
    if (!rows) {
      const endpoint = systemEndpoints[relation.collection]
      if (!endpoint) throw new DskError(`无法预检系统引用源 ${relation.collection}.${relation.field}，拒绝清理`, 'VALIDATION_ERROR')
      rows = await reader.listAll(endpoint)
      cached.set(relation.collection, rows)
    }
    for (const row of rows) {
      const relatedCollection = relation.related_collection ?? (meta?.one_collection_field ? row[meta.one_collection_field] : null)
      if (typeof relatedCollection !== 'string') continue
      const value = row[relation.field]
      if (value == null) continue
      if ((typeof row.id !== 'string' && typeof row.id !== 'number') || (typeof value !== 'string' && typeof value !== 'number')) throw new DskError(`无法预检引用 ${relation.collection}.${relation.field}`, 'VALIDATION_ERROR')
      references.push({ collection: relation.collection, field: relation.field, id: row.id, value, relatedCollection })
    }
  }
  return { currentUser: me.id, state, settings, resources, items, references }
}
