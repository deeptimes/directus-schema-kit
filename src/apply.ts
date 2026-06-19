import { DskError } from './errors.js'
import type { ApplyItem, ApplyResult, FieldDefinition, Manifest, Plan, PlanOperation } from './types.js'

export interface SchemaWriter {
  createCollection(definition: Manifest['collections'][number], primaryField?: FieldDefinition): Promise<void>
  updateCollection(collection: string, meta: Record<string, unknown>): Promise<void>
  createField(collection: string, definition: FieldDefinition): Promise<void>
  updateField(collection: string, field: string, patch: { meta?: Record<string, unknown>; schema?: Record<string, unknown> }): Promise<void>
  createRelation(definition: Manifest['relations'][number]): Promise<void>
}

export async function executeApply(options: {
  manifest: Manifest
  plan: Plan
  writer: SchemaWriter
  dryRun?: boolean
}): Promise<ApplyResult> {
  if (options.plan.manifestDigest !== options.manifest.source.digest) {
    throw new DskError('Plan 与 Manifest 摘要不一致', 'VALIDATION_ERROR', ['请重新生成 Plan'])
  }
  const dryRun = options.dryRun ?? false
  const blocked = options.plan.operations.filter((item) => item.action === 'conflict' || item.action === 'dangerous')
  const executable = orderedOperations(options.manifest, options.plan)
  const pending = executable.map(toApplyItem)
  const base = {
    applyVersion: 1 as const,
    manifestDigest: options.manifest.source.digest,
    dryRun,
    skippedUnchanged: options.plan.summary.unchanged,
  }
  if (blocked.length > 0) {
    return { ...base, status: 'blocked', completed: [], failed: null, notExecuted: pending, blocked }
  }
  if (dryRun) {
    return { ...base, status: 'success', completed: [], failed: null, notExecuted: pending, blocked: [] }
  }

  const completed: ApplyItem[] = []
  const createdCollections = new Set<string>()
  for (let index = 0; index < executable.length; index++) {
    const operation = executable[index]
    if (!operation) continue
    const item = toApplyItem(operation)
    try {
      const detail = await executeOperation(options.manifest, operation, options.writer, createdCollections)
      completed.push({ ...item, ...(detail ? { detail } : {}) })
    } catch (error) {
      return {
        ...base,
        status: 'failed',
        completed,
        failed: { ...item, message: formatError(error) },
        notExecuted: executable.slice(index + 1).map(toApplyItem),
        blocked: [],
      }
    }
  }
  return { ...base, status: 'success', completed, failed: null, notExecuted: [], blocked: [] }
}

function orderedOperations(manifest: Manifest, plan: Plan): PlanOperation[] {
  const executable = plan.operations.filter((item) => item.executable)
  const order = new Map<string, number>()
  orderedCollections(manifest).forEach((item, index) => order.set(`collection:${item.collection}`, index))
  manifest.fields.forEach((item, index) => order.set(`field:${item.collection}.${item.field}`, 20_000 + index))
  manifest.relations.forEach((item, index) => order.set(`relation:${item.collection}.${item.field}`, 30_000 + index))
  return [...executable].sort((left, right) => (order.get(`${left.resourceType}:${left.resource}`) ?? 99_999) - (order.get(`${right.resourceType}:${right.resource}`) ?? 99_999))
}

function orderedCollections(manifest: Manifest): Manifest['collections'] {
  const groups = new Map(manifest.collections.filter((item) => item.schema === null).map((item) => [item.collection, item]))
  const ordered: Manifest['collections'] = []
  const visited = new Set<string>()
  const visiting = new Set<string>()
  const visit = (name: string): void => {
    if (visited.has(name)) return
    if (visiting.has(name)) throw new Error(`集合分组存在循环依赖: ${name}`)
    const group = groups.get(name)
    if (!group) return
    visiting.add(name)
    const parent = typeof group.meta.group === 'string' ? group.meta.group : null
    if (parent && groups.has(parent)) visit(parent)
    visiting.delete(name)
    visited.add(name)
    ordered.push(group)
  }
  for (const name of groups.keys()) visit(name)
  ordered.push(...manifest.collections.filter((item) => item.schema !== null))
  return ordered
}

async function executeOperation(manifest: Manifest, operation: PlanOperation, writer: SchemaWriter, createdCollections: Set<string>): Promise<string | undefined> {
  if (operation.resourceType === 'collection') {
    const target = required(manifest.collections.find((item) => item.collection === operation.resource), operation)
    if (operation.action === 'create') {
      const primary = manifest.fields.find((item) => item.collection === target.collection && item.schema?.is_primary_key)
      await writer.createCollection(target, primary)
      createdCollections.add(target.collection)
    } else {
      await writer.updateCollection(target.collection, changedObject(operation, 'meta', target.meta))
    }
    return undefined
  }
  if (operation.resourceType === 'field') {
    const target = required(manifest.fields.find((item) => `${item.collection}.${item.field}` === operation.resource), operation)
    if (operation.action === 'create') {
      if (target.schema?.is_primary_key && createdCollections.has(target.collection)) return '已随集合创建'
      await writer.createField(target.collection, target)
    } else {
      const meta = changedObject(operation, 'meta', asRecord(target.meta))
      const schema = changedObject(operation, 'schema', asRecord(target.schema))
      await writer.updateField(target.collection, target.field, {
        ...(Object.keys(meta).length ? { meta } : {}),
        ...(Object.keys(schema).length ? { schema } : {}),
      })
    }
    return undefined
  }
  const target = required(manifest.relations.find((item) => `${item.collection}.${item.field}` === operation.resource), operation)
  await writer.createRelation(target)
  return undefined
}

function changedObject(operation: PlanOperation, prefix: string, target: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const change of operation.changes) {
    if (!change.path.startsWith(`${prefix}.`)) continue
    const key = change.path.slice(prefix.length + 1)
    result[key] = target[key]
  }
  return result
}

function required<T>(value: T | undefined, operation: PlanOperation): T {
  if (value === undefined) throw new Error(`Manifest 中找不到 ${operation.resourceType} ${operation.resource}`)
  return value
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function toApplyItem(operation: PlanOperation): ApplyItem {
  return { resourceType: operation.resourceType, resource: operation.resource, action: operation.action as 'create' | 'update' }
}

function formatError(error: unknown): string {
  if (error instanceof DskError) return [error.message, ...error.details].join(': ')
  return error instanceof Error ? error.message : String(error)
}
