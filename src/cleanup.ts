import { createHash } from 'node:crypto'
import { deleteOrder } from './clear.js'
import { matchResourceDefinitions } from './resources.js'
import type { DirectusState, Manifest, ResourceType } from './types.js'

type Row = Record<string, unknown>
type Id = string | number
export type CleanupMode = 'data' | 'full'
export type CleanupEndpoint = ResourceType | 'users' | 'files'
export interface CleanupSnapshot {
  currentUser: string
  settings: Row
  state: DirectusState
  items: Record<string, Row[]>
  resources: Record<CleanupEndpoint, Row[]>
  references: Array<{ collection: string; field: string; id: Id; value: unknown; relatedCollection: string }>
}
export interface CleanupOperation {
  kind: 'item' | 'detach' | 'field' | 'collection' | 'resource'
  resource: string
  origin: 'declared' | 'undeclared'
  id?: Id
  field?: string
  count?: number
  fields?: string[]
  relations?: string[]
}
export interface CleanupPlan {
  cleanupVersion: 1
  mode: CleanupMode
  digest: string
  operations: CleanupOperation[]
  protected: Array<{ resource: string; id: Id }>
  blockers: string[]
}
export interface CleanupResult extends CleanupPlan {
  dryRun: boolean
  status: 'planned' | 'blocked' | 'failed' | 'success'
  completed: CleanupOperation[]
  verified: boolean
  failure?: { message: string; operation?: CleanupOperation }
  reason?: string
}
export interface CleanupWriter {
  deleteItem(collection: string, id: Id): Promise<void>
  updateItem(collection: string, id: Id, data: Row): Promise<Row>
  deleteField(collection: string, field: string): Promise<void>
  deleteCollection(collection: string): Promise<void>
  deleteSystemResource(endpoint: string, id: Id): Promise<void>
}
interface PlanOptions {
  mode: CleanupMode
  manifest: Manifest
  snapshot: CleanupSnapshot
  preserveUserIds?: string[]
  environment?: Record<string, string>
}

export function createCleanupPlan(options: PlanOptions): CleanupPlan {
  const { mode, manifest, snapshot } = options
  const blockers: string[] = []
  const operations: CleanupOperation[] = []
  const protectedRows: CleanupPlan['protected'] = []
  const custom = snapshot.state.collections.filter((row) => !row.collection.startsWith('directus_'))
  const targets = new Set(custom.map((row) => row.collection))
  const declared = new Set(manifest.collections.map((row) => row.collection))
  const origin = (collection: string): CleanupOperation['origin'] => declared.has(collection) ? 'declared' : 'undeclared'
  const retainedUsers = new Set([snapshot.currentUser, ...options.preserveUserIds ?? []])
  const retainedRoles = new Set<Id>()
  const retainedPolicies = new Set<Id>()
  const retainedAccess = new Set<Id>()
  const { users, roles, policies, access } = snapshot.resources
  for (const userId of retainedUsers) {
    const user = users.find((row) => row.id === userId)
    if (!user || user.status !== 'active') blockers.push(`保留的管理员 ${userId} 不存在或未激活`)
    let role = user?.role
    const visited = new Set<Id>()
    while (isId(role)) {
      if (visited.has(role)) { blockers.push(`管理员角色继承存在循环: ${role}`); break }
      visited.add(role)
      retainedRoles.add(role)
      const found = roles.find((row) => row.id === role)
      if (!found) { blockers.push(`管理员角色不存在: ${role}`); break }
      role = found.parent
    }
    const grants = access.filter((row) => row.user === userId || (isId(row.role) && visited.has(row.role)))
    let admin = false
    for (const grant of grants) {
      if (isId(grant.id)) retainedAccess.add(grant.id)
      if (isId(grant.policy)) retainedPolicies.add(grant.policy)
      const policy = policies.find((row) => row.id === grant.policy)
      if (!policy) blockers.push(`管理员授权引用不存在的 policy: ${String(grant.policy)}`)
      if (policy?.admin_access === true) admin = true
    }
    if (!admin) blockers.push(`保留用户 ${userId} 没有有效管理员授权`)
  }
  const publicPolicies = policies.filter((row) => row.name === '$t:public_label')
  if (publicPolicies.length !== 1 || !isId(publicPolicies[0]?.id)) blockers.push('无法唯一识别系统 Public policy')
  else {
    retainedPolicies.add(publicPolicies[0].id)
    for (const grant of access) {
      if (grant.role == null && grant.user == null && grant.policy === publicPolicies[0].id && isId(grant.id)) retainedAccess.add(grant.id)
    }
  }
  protectedRows.push({ resource: 'settings', id: 'singleton' })
  for (const id of retainedUsers) protectedRows.push({ resource: 'users', id })
  for (const id of retainedRoles) protectedRows.push({ resource: 'roles', id })
  for (const id of retainedPolicies) protectedRows.push({ resource: 'policies', id })
  for (const id of retainedAccess) protectedRows.push({ resource: 'access', id })

  for (const collection of custom) {
    if (collection.schema === null) continue
    if (!primaryKey(snapshot.state, collection.collection)) blockers.push(`无法识别集合主键: ${collection.collection}`)
    if (!Array.isArray(snapshot.items[collection.collection])) blockers.push(`未完整读取集合数据: ${collection.collection}`)
  }
  if (mode === 'data') {
    planDataDeletion(snapshot, targets, origin, operations, blockers)
  } else {
    let matched: Map<string, Set<Id>> = new Map()
    try { matched = matchResourceDefinitions(manifest.resources, snapshot.resources, options.environment ?? {}) }
    catch (error) { blockers.push(error instanceof Error ? error.message : String(error)) }
    const keep = (endpoint: CleanupEndpoint, row: Row): boolean => {
      const id = row.id
      if (!isId(id)) { blockers.push(`${endpoint} 返回了无效主键`); return true }
      if (endpoint === 'users') return retainedUsers.has(String(id))
      if (endpoint === 'roles') return retainedRoles.has(id)
      if (endpoint === 'policies') return retainedPolicies.has(id)
      if (endpoint === 'access') return retainedAccess.has(id)
      if (endpoint === 'permissions' && isId(row.policy) && retainedPolicies.has(row.policy) && !targets.has(String(row.collection))) return true
      return false
    }
    // 按依赖拆除；保留的账号和授权记录不发送 PATCH 或 DELETE。
    const addResourceDeletes = (endpoints: CleanupEndpoint[]): void => {
      for (const endpoint of endpoints) {
        let rows = snapshot.resources[endpoint].filter((row) => !keep(endpoint, row))
        if (endpoint === 'roles') rows = orderHierarchy(rows, blockers, endpoint)
        for (const row of rows) operations.push({ kind: 'resource', resource: endpoint, id: row.id as Id, origin: matched.get(endpoint)?.has(row.id as Id) ? 'declared' : 'undeclared' })
      }
    }
    addResourceDeletes(['presets', 'permissions'])
    const primaryRelations = snapshot.state.relations.filter((row) => targets.has(row.collection) && row.field === primaryKey(snapshot.state, row.collection))
    for (const name of targets) {
      const path = new Set<string>()
      let current: string | null = name
      while (current && targets.has(current)) {
        if (path.has(current)) { blockers.push(`主键外键存在无法安全解除的循环: ${current}`); break }
        path.add(current)
        current = primaryRelations.find((row) => row.collection === current)?.related_collection ?? null
      }
    }
    const fields = new Set(snapshot.state.relations.filter((row) => targets.has(row.collection) && row.field !== primaryKey(snapshot.state, row.collection)).map((row) => `${row.collection}.${row.field}`))
    for (const resource of [...fields].sort()) {
      const separator = resource.lastIndexOf('.')
      operations.push({ kind: 'field', resource: resource.slice(0, separator), field: resource.slice(separator + 1), origin: origin(resource.slice(0, separator)) })
    }
    const physical = custom.filter((row) => row.schema !== null).map((row) => row.collection).sort()
    const groups = custom.filter((row) => row.schema === null).map((row) => ({ id: row.collection, parent: asRow(row.meta).group }))
    for (const name of [...deleteOrder(physical, primaryRelations), ...orderHierarchy(groups, blockers, 'collection group').map((row) => String(row.id))]) {
      operations.push({
        kind: 'collection', resource: name, origin: origin(name), count: snapshot.items[name]?.length ?? 0,
        fields: snapshot.state.fields.filter((row) => row.collection === name).map((row) => row.field).sort(),
        relations: snapshot.state.relations.filter((row) => row.collection === name || row.related_collection === name).map((row) => `${row.collection}.${row.field}`).sort(),
      })
    }
    addResourceDeletes(['access', 'users', 'roles', 'policies'])
    for (const endpoint of ['files', 'folders'] as const) {
      const rows = endpoint === 'folders' ? orderHierarchy(snapshot.resources.folders, blockers, 'folders') : snapshot.resources.files
      for (const row of rows) {
        if (!isId(row.id)) { blockers.push(`${endpoint} 返回了无效主键`); continue }
        operations.push({ kind: 'resource', resource: endpoint, id: row.id, origin: matched.get(endpoint)?.has(row.id) ? 'declared' : 'undeclared' })
      }
    }
    for (const relation of snapshot.state.relations) {
      if (relation.collection.startsWith('directus_') && (targets.has(relation.related_collection ?? '') || (asRow(relation.meta).one_allowed_collections as string[] | undefined)?.some((name) => targets.has(name)))) blockers.push(`保留系统结构 ${relation.collection}.${relation.field} 引用待删集合 ${relation.related_collection}`)
    }
  }
  checkRetainedReferences(snapshot, operations, blockers)
  return { cleanupVersion: 1, mode, digest: fingerprint(snapshot), operations, protected: protectedRows, blockers: [...new Set(blockers)] }
}

export async function executeCleanup(options: Omit<PlanOptions, 'snapshot'> & {
  readSnapshot: () => Promise<CleanupSnapshot>
  writer: CleanupWriter
  dryRun?: boolean
  confirm?: boolean
  authorize?: (plan: CleanupPlan) => Promise<boolean>
  enabled?: boolean
}): Promise<CleanupResult> {
  const before = await options.readSnapshot()
  const plan = createCleanupPlan({ ...options, snapshot: before })
  const result: CleanupResult = { ...plan, dryRun: true, status: 'planned', completed: [], verified: false }
  if (options.enabled === false) result.blockers.push('项目配置已禁用清理')
  if (result.blockers.length) return { ...result, status: 'blocked' }
  if (options.dryRun) return result
  if (options.authorize) {
    if (!await options.authorize(structuredClone(plan))) return { ...result, reason: '用户取消，未执行删除' }
  } else if (!options.confirm) return result
  const fresh = await options.readSnapshot()
  const freshPlan = createCleanupPlan({ ...options, snapshot: fresh })
  if (freshPlan.digest !== plan.digest || freshPlan.blockers.length) return { ...result, status: 'blocked', blockers: [...freshPlan.blockers, '实例在计划生成后发生变化，请重新预览并确认'] }
  result.dryRun = false
  for (const operation of plan.operations) {
    try {
      switch (operation.kind) {
        case 'item': await options.writer.deleteItem(operation.resource, operation.id!); break
        case 'detach': await options.writer.updateItem(operation.resource, operation.id!, { [operation.field!]: null }); break
        case 'field': await options.writer.deleteField(operation.resource, operation.field!); break
        case 'collection': await options.writer.deleteCollection(operation.resource); break
        case 'resource': await options.writer.deleteSystemResource(operation.resource, operation.id!); break
      }
      result.completed.push(operation)
    } catch (error) {
      return { ...result, status: 'failed', failure: { operation, message: error instanceof Error ? error.message : String(error) } }
    }
  }
  try {
    const after = await options.readSnapshot()
    const afterPlan = createCleanupPlan({ ...options, snapshot: after })
    const protectionChanged = plan.protected.some(({ resource, id }) => resource === 'settings'
      ? fingerprint(before.settings) !== fingerprint(after.settings)
      : fingerprint(before.resources[resource as CleanupEndpoint].find((row) => row.id === id)) !== fingerprint(after.resources[resource as CleanupEndpoint].find((row) => row.id === id)))
    const dataConfigurationChanged = options.mode === 'data' && (fingerprint(before.state) !== fingerprint(after.state) || fingerprint(before.resources) !== fingerprint(after.resources))
    if (protectionChanged || dataConfigurationChanged || afterPlan.blockers.length || afterPlan.operations.length) {
      return { ...result, status: 'failed', failure: { message: '清理后验证失败：保留配置或管理员授权变化，或仍有待清理项；请检查实例后重新预览' } }
    }
    return { ...result, status: 'success', verified: true }
  } catch (error) {
    return { ...result, status: 'failed', failure: { message: `清理后验证失败: ${error instanceof Error ? error.message : String(error)}` } }
  }
}

function planDataDeletion(snapshot: CleanupSnapshot, targets: Set<string>, origin: (name: string) => CleanupOperation['origin'], operations: CleanupOperation[], blockers: string[]): void {
  const nodes = new Map<string, CleanupOperation>()
  const dependencies = new Map<string, Set<string>>()
  const key = (collection: string, id: unknown): string => JSON.stringify([collection, id])
  for (const collection of [...targets].sort()) {
    const pk = primaryKey(snapshot.state, collection)
    for (const row of snapshot.items[collection] ?? []) {
      const id = pk ? row[pk] : undefined
      if (!isId(id)) { blockers.push(`无法识别记录主键: ${collection}`); continue }
      const node = key(collection, id)
      nodes.set(node, { kind: 'item', resource: collection, id, origin: origin(collection) })
      dependencies.set(node, new Set())
    }
  }
  for (const relation of snapshot.state.relations) {
    if (!targets.has(relation.collection)) continue
    const pk = primaryKey(snapshot.state, relation.collection)
    const field = snapshot.state.fields.find((row) => row.collection === relation.collection && row.field === relation.field)
    const nullable = asRow(field?.schema).is_nullable === true
    const foreignColumn = asRow(relation.schema).foreign_key_column
    if (relation.related_collection && targets.has(relation.related_collection) && foreignColumn && foreignColumn !== primaryKey(snapshot.state, relation.related_collection)) {
      blockers.push(`无法安全规划非主键外键: ${relation.collection}.${relation.field}`)
      continue
    }
    for (const row of snapshot.items[relation.collection] ?? []) {
      const discriminator = asRow(relation.meta).one_collection_field
      const related = relation.related_collection ?? (typeof discriminator === 'string' && typeof row[discriminator] === 'string' ? row[discriminator] as string : null)
      if (!related || !targets.has(related) || !pk || row[relation.field] == null) continue
      const source = key(relation.collection, row[pk])
      const target = key(related, row[relation.field])
      if (!nodes.has(target) || source === target) continue
      if (nullable) operations.push({ kind: 'detach', resource: relation.collection, id: row[pk] as Id, field: relation.field, origin: origin(relation.collection) })
      else dependencies.get(target)?.add(source)
    }
  }
  const visited = new Set<string>()
  const visiting = new Set<string>()
  const visit = (node: string): void => {
    if (visited.has(node)) return
    if (visiting.has(node)) { blockers.push('业务记录存在不可置空的循环引用，无法安全清空；请先解除引用或使用 reset 删除结构'); return }
    visiting.add(node)
    for (const child of dependencies.get(node) ?? []) visit(child)
    visiting.delete(node)
    visited.add(node)
    operations.push(nodes.get(node)!)
  }
  for (const node of nodes.keys()) visit(node)
}

function checkRetainedReferences(snapshot: CleanupSnapshot, operations: CleanupOperation[], blockers: string[]): void {
  const deleted = new Set(operations.filter((op) => op.kind === 'resource').map((op) => JSON.stringify([`directus_${op.resource}`, op.id])))
  const removedCollections = new Set(operations.filter((op) => op.kind === 'collection').map((op) => op.resource))
  const deletedItems = new Set(operations.filter((op) => op.kind === 'item').map((op) => JSON.stringify([op.resource, op.id])))
  for (const reference of snapshot.references) {
    if (removedCollections.has(reference.collection) || deleted.has(JSON.stringify([reference.collection, reference.id]))) continue
    if (deleted.has(JSON.stringify([reference.relatedCollection, reference.value])) || deletedItems.has(JSON.stringify([reference.relatedCollection, reference.value]))) blockers.push(`保留资源 ${reference.collection}.${reference.field} (${reference.id}) 引用待删资源 ${String(reference.value)}`)
  }
  // 即使实例未返回系统内置关系，也不能漏掉 settings 和管理员常见的文件引用。
  for (const [field, value] of Object.entries(snapshot.settings)) {
    if (deleted.has(JSON.stringify(['directus_files', value])) || deleted.has(JSON.stringify(['directus_folders', value]))) blockers.push(`directus_settings.${field} 引用待删资源 ${String(value)}`)
  }
  for (const row of snapshot.resources.users) {
    if (deleted.has(JSON.stringify(['directus_users', row.id]))) continue
    for (const [field, value] of Object.entries(row)) {
      if (['roles', 'policies', 'files', 'folders'].some((type) => deleted.has(JSON.stringify([`directus_${type}`, value])))) blockers.push(`保留用户 ${String(row.id)}.${field} 引用待删资源 ${String(value)}`)
    }
  }
}

function orderHierarchy(rows: Row[], blockers: string[], resource: string): Row[] {
  const ordered: Row[] = []
  const visited = new Set<unknown>()
  const visiting = new Set<unknown>()
  const visit = (row: Row): void => {
    if (visited.has(row.id)) return
    if (visiting.has(row.id)) { blockers.push(`${resource} 存在循环引用: ${String(row.id)}`); return }
    visiting.add(row.id)
    for (const child of rows.filter((item) => item.parent === row.id)) visit(child)
    visiting.delete(row.id)
    visited.add(row.id)
    ordered.push(row)
  }
  for (const row of rows) visit(row)
  return ordered
}

export function primaryKey(state: DirectusState, collection: string): string | undefined {
  const fields = state.fields.filter((row) => row.collection === collection && asRow(row.schema).is_primary_key === true)
  return fields.length === 1 ? fields[0]!.field : undefined
}

function isId(value: unknown): value is Id { return typeof value === 'string' || typeof value === 'number' }
function asRow(value: unknown): Row { return value && typeof value === 'object' ? value as Row : {} }
function fingerprint(value: unknown): string {
  const canonical = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(canonical)
    if (input && typeof input === 'object') return Object.fromEntries(Object.entries(input).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]))
    return input
  }
  return createHash('sha256').update(JSON.stringify(canonical(value)) ?? 'undefined').digest('hex')
}
