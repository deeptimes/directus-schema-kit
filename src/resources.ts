import { DskError } from './errors.js'
import type { DeclarativeValue, ResourceDefinition, ResourceSyncOperation, ResourceSyncResult, ResourceType } from './types.js'

const order: ResourceType[] = ['folders', 'roles', 'policies', 'access', 'permissions', 'flows', 'dashboards', 'presets']
const endpoints: Record<ResourceType, string> = {
  folders: 'folders', roles: 'roles', policies: 'policies', access: 'access', permissions: 'permissions', flows: 'flows', dashboards: 'dashboards', presets: 'presets',
}

export interface ResourceReader { listSystemResource(endpoint: string): Promise<Array<Record<string, unknown>>> }
export interface ResourceWriter {
  createSystemResource(endpoint: string, data: Record<string, unknown>): Promise<Record<string, unknown>>
  updateSystemResource(endpoint: string, id: string | number, data: Record<string, unknown>): Promise<Record<string, unknown>>
  deleteSystemResource(endpoint: string, id: string | number): Promise<void>
}

export async function syncResources(options: {
  definitions: Record<ResourceType, ResourceDefinition[]>
  reader: ResourceReader
  writer?: ResourceWriter
  environment?: Record<string, string>
  dryRun?: boolean
  confirmDestructive?: boolean
}): Promise<ResourceSyncResult> {
  const dryRun = options.dryRun ?? false
  const current = Object.fromEntries(await Promise.all(order.map(async (type) => [type, await options.reader.listSystemResource(endpoints[type])]))) as Record<ResourceType, Array<Record<string, unknown>>>
  const idByRef = new Map<string, string | number>()
  const operations: ResourceSyncOperation[] = []

  for (const definition of orderedDefinitions(options.definitions)) {
      const type = definition.type
      const resolved = resolveValue(definition.data, idByRef, options.environment ?? {}, true) as Record<string, unknown>
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
        operations.push({ type, key: definition.key, action: 'create', dangerous: false })
      } else {
        operations.push({ type, key: definition.key, action: differs(found, resolved) ? 'update' : 'unchanged', dangerous: false, id: id! })
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
    const definition = options.definitions[operation.type].find((item) => item.key === operation.key)!
    try {
      const data = resolveValue(definition.data, idByRef, options.environment ?? {}) as Record<string, unknown>
      if (operation.action === 'create') {
        const saved = await options.writer.createSystemResource(endpoints[operation.type], data)
        if (saved.id !== undefined) idByRef.set(`${operation.type}.${operation.key}`, saved.id as string | number)
      } else if (operation.action === 'update') {
        await options.writer.updateSystemResource(endpoints[operation.type], operation.id!, data)
      } else if (operation.action === 'delete') {
        await options.writer.deleteSystemResource(endpoints[operation.type], operation.id!)
      }
      completed.push(operation)
    } catch (error) {
      return {
        resourceSyncVersion: 1, dryRun: false, status: 'failed', operations, completed,
        failure: { type: operation.type, key: operation.key, message: formatError(error) },
      }
    }
  }
  return { resourceSyncVersion: 1, dryRun: false, status: 'success', operations, completed }
}

function orderedDefinitions(definitions: Record<ResourceType, ResourceDefinition[]>): ResourceDefinition[] {
  const all = order.flatMap((type) => definitions[type])
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
    flows: ['name'], dashboards: ['name'], presets: ['bookmark', 'collection', 'role', 'user'],
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

function resolveValue(value: DeclarativeValue | Record<string, DeclarativeValue>, ids: Map<string, string | number>, environment: Record<string, string>, allowUnresolved = false): unknown {
  if (Array.isArray(value)) return value.map((item) => resolveValue(item, ids, environment, allowUnresolved))
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
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveValue(item as DeclarativeValue, ids, environment, allowUnresolved)]))
  }
  return value
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
