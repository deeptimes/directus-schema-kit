import type { DirectusState, Manifest, Plan, PlanAction, PlanChange, PlanOperation } from './types.js'

const safeCollectionMeta = [
  'icon', 'note', 'display_template', 'hidden', 'singleton', 'accountability', 'archive_field',
  'archive_app_filter', 'archive_value', 'unarchive_value', 'sort_field', 'group', 'sort', 'collapse',
  'color', 'translations',
] as const
const safeFieldMeta = ['interface', 'options', 'display', 'display_options', 'note', 'hidden', 'readonly', 'required', 'sort', 'width', 'translations'] as const
const dangerousFieldSchema = ['is_nullable', 'is_unique', 'is_primary_key', 'has_auto_increment', 'max_length', 'numeric_precision', 'numeric_scale'] as const

export function createPlan(manifest: Manifest, state: DirectusState, targetUrl: string, moduleFilter?: string): Plan {
  const operations: PlanOperation[] = []
  const collections = new Map(state.collections.map((item) => [item.collection, item]))
  const fields = new Map(state.fields.map((item) => [`${item.collection}.${item.field}`, item]))
  const relations = new Map(state.relations.map((item) => [`${item.collection}.${item.field}`, item]))
  const targetRelations = new Map(manifest.relations.map((item) => [`${item.collection}.${item.field}`, item]))

  for (const target of manifest.collections.filter((item) => !moduleFilter || item.module === moduleFilter)) {
    const current = collections.get(target.collection)
    if (!current) operations.push(operation(target.module ?? 'unknown', 'collection', target.collection, 'create', [], '集合不存在'))
    else {
      const changes = compareProperties(asRecord(current.meta), target.meta, safeCollectionMeta, 'meta')
      const conflicts = compareUnsupported(asRecord(current.meta), target.meta, safeCollectionMeta, 'meta')
      operations.push(operation(target.module ?? 'unknown', 'collection', target.collection,
        conflicts.length ? 'conflict' : changes.length ? 'update' : 'unchanged', [...changes, ...conflicts],
        conflicts.length ? '集合包含未列入安全更新白名单的差异' : undefined))
    }
  }

  for (const target of manifest.fields.filter((item) => !moduleFilter || item.module === moduleFilter)) {
    const resource = `${target.collection}.${target.field}`
    const current = fields.get(resource)
    if (!current) {
      operations.push(operation(target.module, 'field', resource, 'create', [], '字段不存在'))
      continue
    }
    const dangerous: PlanChange[] = []
    if (!equivalentFieldType(current.type, target.type, targetRelations.has(resource))) {
      dangerous.push({ path: 'type', current: current.type, target: target.type })
    }
    dangerous.push(...compareProperties(asRecord(current.schema), asRecord(target.schema), dangerousFieldSchema, 'schema'))
    const currentMeta = asRecord(current.meta)
    if (Object.hasOwn(target.meta, 'special') && !equal(currentMeta.special, target.meta.special)) {
      dangerous.push({ path: 'meta.special', current: currentMeta.special, target: target.meta.special })
    }
    const safe = compareProperties(currentMeta, asRecord(target.meta), safeFieldMeta, 'meta')
    const defaultChanges = compareProperties(asRecord(current.schema), asRecord(target.schema), ['default_value'] as const, 'schema')
    const metaConflicts = compareUnsupported(currentMeta, asRecord(target.meta), [...safeFieldMeta, 'special'] as const, 'meta')
    const schemaConflicts = compareUnsupported(asRecord(current.schema), asRecord(target.schema), [...dangerousFieldSchema, 'default_value'] as const, 'schema')
    const conflicts = [...metaConflicts, ...schemaConflicts]
    const all = [...dangerous, ...safe, ...defaultChanges, ...conflicts]
    const action = dangerous.length ? 'dangerous' : conflicts.length ? 'conflict' : all.length ? 'update' : 'unchanged'
    operations.push(operation(target.module, 'field', resource, action, all,
      dangerous.length ? '字段类型或数据库约束变化需要显式迁移' : conflicts.length ? '字段包含未列入安全更新白名单的差异' : undefined))
  }

  for (const target of manifest.relations.filter((item) => !moduleFilter || item.module === moduleFilter)) {
    const resource = `${target.collection}.${target.field}`
    const current = relations.get(resource)
    if (!current) {
      operations.push(operation(target.module ?? 'unknown', 'relation', resource, 'create', [], '关系不存在'))
      continue
    }
    const changes: PlanChange[] = []
    if (!equal(current.related_collection, target.related_collection)) {
      changes.push({ path: 'related_collection', current: current.related_collection, target: target.related_collection })
    }
    changes.push(...compareProperties(asRecord(current.schema), target.schema, ['on_delete'] as const, 'schema'))
    const conflicts = [
      ...compareUnsupported(asRecord(current.schema), target.schema, ['on_delete'] as const, 'schema'),
      ...compareUnsupported(asRecord(current.meta), asRecord(target.meta), [] as const, 'meta'),
    ]
    operations.push(operation(target.module ?? 'unknown', 'relation', resource, changes.length ? 'dangerous' : conflicts.length ? 'conflict' : 'unchanged', [...changes, ...conflicts],
      changes.length ? '关系目标或删除策略变化需要显式迁移' : conflicts.length ? '关系包含未支持自动更新的差异' : undefined))
  }

  const summary: Record<PlanAction, number> = { create: 0, update: 0, unchanged: 0, conflict: 0, dangerous: 0 }
  for (const item of operations) summary[item.action]++
  return { planVersion: 1, manifestDigest: manifest.source.digest, target: { url: new URL(targetUrl).origin }, operations, summary }
}

function operation(module: string, resourceType: PlanOperation['resourceType'], resource: string, action: PlanAction, changes: PlanChange[], reason?: string): PlanOperation {
  const risk = action === 'dangerous' ? 'high' : action === 'conflict' ? 'medium' : action === 'create' || action === 'update' ? 'low' : 'none'
  return { module, resourceType, resource, action, risk, executable: action === 'create' || action === 'update', changes, ...(reason ? { reason } : {}) }
}

function compareProperties<const T extends readonly string[]>(current: Record<string, unknown>, target: Record<string, unknown>, keys: T, prefix: string): PlanChange[] {
  const changes: PlanChange[] = []
  for (const key of keys) {
    if (Object.hasOwn(target, key) && !equal(current[key], target[key])) changes.push({ path: `${prefix}.${key}`, current: current[key], target: target[key] })
  }
  return changes
}

function compareUnsupported(current: Record<string, unknown>, target: Record<string, unknown>, allowed: readonly string[], prefix: string): PlanChange[] {
  const allowedKeys = new Set(allowed)
  return Object.keys(target)
    .filter((key) => !allowedKeys.has(key) && !equal(current[key], target[key]))
    .sort()
    .map((key) => ({ path: `${prefix}.${key}`, current: current[key], target: target[key] }))
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function equal(left: unknown, right: unknown): boolean {
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right))
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]))
  return value
}

function equivalentFieldType(current: unknown, target: unknown, relation: boolean): boolean {
  if (equal(current, target)) return true
  return relation && current === 'string' && target === 'uuid'
}
