import { validateTranslations } from './resource-validation.js'
import { DskError } from './errors.js'
import type { DeclarativeValue, ResourceDefinition, ResourceDefinitions, ResourceSyncOperation, ResourceSyncResult, ResourceType, SystemResourceKey } from './types.js'

const order: ResourceType[] = ['folders', 'roles', 'policies', 'access', 'permissions', 'presets', 'translations']
const endpoints: Record<ResourceType, string> = {
  folders: 'folders', roles: 'roles', policies: 'policies', access: 'access', permissions: 'permissions', presets: 'presets', translations: 'translations',
}

export interface ResourceReader {
  listSystemResource(endpoint: string): Promise<Array<Record<string, unknown>>>
  getCustomPermissionRulesEnabled?(): Promise<boolean>
}
export interface ResourceWriter {
  createSystemResource(endpoint: string, data: Record<string, unknown>): Promise<Record<string, unknown>>
  updateSystemResource(endpoint: string, id: string | number, data: Record<string, unknown>): Promise<Record<string, unknown>>
  deleteSystemResource(endpoint: string, id: string | number): Promise<void>
}

export async function syncResources(options: {
  definitions: ResourceDefinitions
  reader: ResourceReader
  writer?: ResourceWriter
  environment?: Record<string, string>
  dryRun?: boolean
  confirmDestructive?: boolean
}): Promise<ResourceSyncResult> {
  const errors = validateTranslations(options.definitions.translations === undefined ? [] : options.definitions.translations)
  if (errors.length) throw new DskError('Translation Strings 校验失败', 'VALIDATION_ERROR', errors)
  const dryRun = options.dryRun ?? false
  const customRules = options.definitions.permissions.some((definition) => {
    if (definition.delete) return false
    const { fields, permissions, validation, presets } = definition.data
    return !Array.isArray(fields) || !fields.includes('*')
      || [permissions, validation, presets].some((value) => value !== null && typeof value === 'object' && Object.keys(value).length > 0)
  })
  if (customRules && options.reader.getCustomPermissionRulesEnabled && !await options.reader.getCustomPermissionRulesEnabled()) {
    throw new DskError('Directus 未启用 custom_permission_rules_enabled，无法同步自定义权限规则', 'CONFIG_ERROR', [
      '请配置包含该能力的有效 Directus license；DSK 不会移除过滤条件、字段限制、validation 或 presets 来绕过限制',
    ])
  }
  const current = Object.fromEntries(await Promise.all(order.map(async (type) => {
    // 未声明翻译时不新增端点权限要求，兼容已有资源工作流。
    const rows = type === 'translations' && !options.definitions.translations?.length
      ? [] : await options.reader.listSystemResource(endpoints[type])
    return [type, rows]
  }))) as Record<ResourceType, Array<Record<string, unknown>>>
  const idByRef = new Map<string, string | number>()
  const systemIds = resolveSystemReferences(options.definitions, current)
  const operations: ResourceSyncOperation[] = []

  for (const definition of orderedDefinitions(options.definitions)) {
      const type = definition.type
      const resolved = resolveValue(definition.data, idByRef, systemIds, options.environment ?? {}, true) as Record<string, unknown>
      const matches = current[type].filter((item) => matchesDefinition(type, item, resolved))
      if (matches.length > 1) {
        operations.push({ type, key: definition.key, action: 'conflict', dangerous: false, reason: '稳定业务键匹配到多条记录' })
        continue
      }
      const found = matches[0]
      const id = found?.id as string | number | undefined
      if (id !== undefined) idByRef.set(`${type}.${definition.key}`, id)
      if (definition.delete) {
        operations.push({ type, key: definition.key, action: found ? 'delete' : 'unchanged', dangerous: Boolean(found), ...(id !== undefined ? { id } : {}) })
      } else if (!found) {
        operations.push({ type, key: definition.key, action: 'create', dangerous: false, ...(type === 'translations' ? { changes: Object.entries(resolved).map(([path, target]) => ({ path, current: undefined, target })) } : {}) })
      } else {
        const changes = type === 'translations'
          ? Object.entries(resolved).filter(([key, value]) => !same(found[key], value)).map(([path, target]) => ({ path, current: found[path], target }))
          : undefined
        operations.push({ type, key: definition.key, action: differs(found, resolved) ? 'update' : 'unchanged', dangerous: false, id: id!, ...(changes ? { changes } : {}) })
      }
  }
  const deletes = operations.filter((item) => item.action === 'delete').reverse()
  operations.splice(0, operations.length, ...operations.filter((item) => item.action !== 'delete'), ...deletes)

  if (operations.some((item) => item.action === 'conflict') || operations.some((item) => item.action === 'delete') && !options.confirmDestructive) {
    return { resourceSyncVersion: 1, dryRun, status: 'blocked', operations, completed: [] }
  }
  if (dryRun) return { resourceSyncVersion: 1, dryRun: true, status: 'success', operations, completed: [] }
  if (!options.writer) throw new DskError('Resource apply 缺少 writer', 'CONFIG_ERROR')

  const completed: ResourceSyncOperation[] = []
  for (const operation of operations) {
    if (operation.action === 'unchanged') continue
    const definition = options.definitions[operation.type]!.find((item) => item.key === operation.key)!
    try {
      const data = resolveValue(definition.data, idByRef, systemIds, options.environment ?? {}) as Record<string, unknown>
      if (operation.action === 'create') {
        const saved = await options.writer.createSystemResource(endpoints[operation.type], data)
        if (saved.id !== undefined) idByRef.set(`${operation.type}.${operation.key}`, saved.id as string | number)
      } else if (operation.action === 'update') {
        await options.writer.updateSystemResource(endpoints[operation.type], operation.id!, operation.type === 'translations'
          ? Object.fromEntries((operation.changes ?? []).map((change) => [change.path, data[change.path]]))
          : data)
      } else if (operation.action === 'delete') {
        await options.writer.deleteSystemResource(endpoints[operation.type], operation.id!)
      }
      completed.push(operation)
    } catch (error) {
      return {
        resourceSyncVersion: 1, dryRun: false, status: 'failed', operations, completed,
        failure: { type: operation.type, key: operation.key, message: formatError(error) },
        notExecuted: operations.slice(operations.indexOf(operation) + 1).filter((item) => item.action !== 'unchanged'),
      }
    }
  }
  return { resourceSyncVersion: 1, dryRun: false, status: 'success', operations, completed }
}

export function matchResourceDefinitions(
  definitions: ResourceDefinitions,
  current: Partial<Record<ResourceType, Array<Record<string, unknown>>>>,
  environment: Record<string, string>,
): Map<string, Set<string | number>> {
  const ids = new Map<string, string | number>()
  const systems = resolveSystemReferences(definitions, current)
  const matched = new Map<string, Set<string | number>>()
  for (const definition of orderedDefinitions(definitions)) {
    const target = resolveValue(definition.data, ids, systems, environment, true) as Record<string, unknown>
    const rows = (current[definition.type] ?? []).filter((row) => matchesDefinition(definition.type, row, target))
    if (rows.length > 1) throw new DskError(`资源业务键匹配不唯一: ${definition.type}.${definition.key}`, 'VALIDATION_ERROR')
    const id = rows[0]?.id
    if (typeof id !== 'string' && typeof id !== 'number') continue
    ids.set(`${definition.type}.${definition.key}`, id)
    if (!matched.has(definition.type)) matched.set(definition.type, new Set())
    matched.get(definition.type)!.add(id)
  }
  return matched
}

function orderedDefinitions(definitions: ResourceDefinitions): ResourceDefinition[] {
  const all = order.flatMap((type) => definitions[type] ?? [])
  const byKey = new Map(all.map((item) => [`${item.type}.${item.key}`, item]))
  const result: ResourceDefinition[] = []
  const visited = new Set<string>()
  const visiting = new Set<string>()
  const visit = (definition: ResourceDefinition): void => {
    const key = `${definition.type}.${definition.key}`
    if (visited.has(key)) return
    if (visiting.has(key)) throw new DskError(`系统资源存在循环引用: ${key}`, 'VALIDATION_ERROR')
    visiting.add(key)
    for (const reference of collectReferences(definition.data)) {
      const dependency = byKey.get(reference)
      if (dependency) visit(dependency)
    }
    visiting.delete(key)
    visited.add(key)
    result.push(definition)
  }
  for (const definition of all) visit(definition)
  return result
}

function matchesDefinition(type: ResourceType, item: Record<string, unknown>, target: Record<string, unknown>): boolean {
  const keys: Record<ResourceType, string[]> = {
    folders: ['name', 'parent'], roles: ['name'], policies: ['name'], access: ['role', 'policy', 'user'], permissions: ['policy', 'collection', 'action'],
    translations: ['key', 'language'],
    presets: ['bookmark', 'collection', 'role', 'user'],
  }
  const selected = keys[type].filter((key) => Object.hasOwn(target, key))
  if (selected.length === 0) throw new DskError(`${type} 资源缺少稳定业务键`, 'VALIDATION_ERROR')
  return selected.every((key) => same(item[key], target[key]))
}

function differs(current: Record<string, unknown>, target: Record<string, unknown>): boolean {
  return Object.entries(target).some(([key, value]) => !same(current[key], value))
}

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function resolveValue(value: DeclarativeValue | Record<string, DeclarativeValue>, ids: Map<string, string | number>, systemIds: Map<SystemResourceKey, string | number>, environment: Record<string, string>, allowUnresolved = false): unknown {
  if (Array.isArray(value)) return value.map((item) => resolveValue(item, ids, systemIds, environment, allowUnresolved))
  if (value && typeof value === 'object') {
    if ('$ref' in value && typeof value.$ref === 'string') {
      const id = ids.get(value.$ref)
      if (id === undefined) {
        if (allowUnresolved) return `__dsk_unresolved__:${value.$ref}`
        throw new DskError(`资源引用尚未解析: ${value.$ref}`, 'VALIDATION_ERROR')
      }
      return id
    }
    if ('$env' in value && typeof value.$env === 'string') {
      const result = environment[value.$env]
      if (result === undefined) throw new DskError(`环境变量不存在: ${value.$env}`, 'VALIDATION_ERROR')
      return result
    }
    if ('$system' in value && typeof value.$system === 'string') {
      const id = systemIds.get(value.$system as SystemResourceKey)
      if (id === undefined) throw new DskError(`系统资源引用尚未解析: ${value.$system}`, 'VALIDATION_ERROR')
      return id
    }
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveValue(item as DeclarativeValue, ids, systemIds, environment, allowUnresolved)]))
  }
  return value
}

function resolveSystemReferences(definitions: ResourceDefinitions, current: Partial<Record<ResourceType, Array<Record<string, unknown>>>>): Map<SystemResourceKey, string | number> {
  const requested = new Set(Object.values(definitions).flatMap((items) => items.flatMap((item) => collectSystemReferences(item.data))))
  const result = new Map<SystemResourceKey, string | number>()
  for (const key of requested) {
    if (key !== 'policies.public') throw new DskError(`不支持的系统资源引用: ${key}`, 'VALIDATION_ERROR')
    const matches = (current.policies ?? []).filter((item) => item.name === '$t:public_label' && item.id !== undefined)
    if (matches.length !== 1) {
      throw new DskError(`无法唯一解析系统资源 ${key}`, 'VALIDATION_ERROR', [`匹配到 ${matches.length} 个 Directus Public policy`])
    }
    result.set(key, matches[0]!.id as string | number)
  }
  return result
}

function collectSystemReferences(value: unknown): SystemResourceKey[] {
  if (Array.isArray(value)) return value.flatMap(collectSystemReferences)
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    if (typeof record.$system === 'string') return [record.$system as SystemResourceKey]
    return Object.values(record).flatMap(collectSystemReferences)
  }
  return []
}

function collectReferences(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(collectReferences)
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    if (typeof record.$ref === 'string') return [record.$ref]
    return Object.values(record).flatMap(collectReferences)
  }
  return []
}

function formatError(error: unknown): string {
  if (error instanceof DskError) return [error.message, ...error.details].join(': ')
  return error instanceof Error ? error.message : String(error)
}
