import type { ClearOperation, ClearResult, DirectusState, Manifest } from './types.js'

export interface ClearWriter {
  deleteField(collection: string, field: string): Promise<void>
  deleteCollection(collection: string): Promise<void>
}

export function createClearPlan(manifest: Manifest, state: DirectusState, moduleId: string): ClearOperation[] {
  const module = manifest.modules.find((item) => item.id === moduleId)
  if (!module) throw new Error(`Manifest 中不存在模块: ${moduleId}`)
  const declared = manifest.collections.filter((item) => item.module === moduleId)
  const groups = new Set(declared.filter((item) => item.schema === null).map((item) => item.collection))
  const targets = new Set([...declared.map((item) => item.collection), ...module.cleanupCollections])
  for (const collection of targets) {
    if (collection.startsWith('directus_')) throw new Error(`禁止清理系统集合: ${collection}`)
  }
  const existing = new Set(state.collections.map((item) => item.collection))
  const activeTargets = new Set([...targets].filter((item) => existing.has(item)))
  const fields = unique(state.relations
    .filter((item) => activeTargets.has(item.collection) || (item.related_collection !== null && activeTargets.has(item.related_collection)))
    .filter((item) => existing.has(item.collection))
    .map((item) => `${item.collection}.${item.field}`))
    .map((resource) => ({ resourceType: 'field' as const, resource }))
  const regular = [...activeTargets].filter((item) => !groups.has(item))
  const collections = [...deleteOrder(regular, state.relations), ...[...activeTargets].filter((item) => groups.has(item))]
    .map((resource) => ({ resourceType: 'collection' as const, resource }))
  return [...fields, ...collections]
}

export async function executeClear(options: {
  manifest: Manifest
  state: DirectusState
  module: string
  writer: ClearWriter
  confirm?: boolean
  scope?: string
  authorize?: (operations: readonly ClearOperation[]) => Promise<boolean>
  enabled?: boolean
}): Promise<ClearResult> {
  const operations = createClearPlan(options.manifest, options.state, options.module)
  const base = { clearVersion: 1 as const, module: options.module, operations, completed: [], failures: [] }
  if (options.enabled === false) return { ...base, dryRun: true, status: 'blocked', reason: '项目配置已禁用 clear' }
  if (options.authorize) {
    const authorized = await options.authorize(operations)
    if (!authorized) return { ...base, dryRun: true, status: 'planned', reason: '用户取消，未执行删除' }
  } else {
    if (!options.confirm) return { ...base, dryRun: true, status: 'planned' }
    if (options.scope !== options.module) return { ...base, dryRun: true, status: 'blocked', reason: '--scope 必须与目标模块完全一致' }
  }

  const completed: ClearOperation[] = []
  const failures: ClearResult['failures'] = []
  for (const operation of operations) {
    try {
      if (operation.resourceType === 'field') {
        const separator = operation.resource.lastIndexOf('.')
        await options.writer.deleteField(operation.resource.slice(0, separator), operation.resource.slice(separator + 1))
      } else await options.writer.deleteCollection(operation.resource)
      completed.push(operation)
    } catch (error) {
      failures.push({ ...operation, message: error instanceof Error ? error.message : String(error) })
    }
  }
  return { ...base, dryRun: false, status: failures.length ? 'failed' : 'success', completed, failures }
}

export function deleteOrder(collections: string[], relations: DirectusState['relations']): string[] {
  const targets = new Set(collections)
  const children = new Map(collections.map((item) => [item, new Set<string>()]))
  for (const relation of relations) {
    if (relation.related_collection !== null && targets.has(relation.collection) && targets.has(relation.related_collection) && relation.collection !== relation.related_collection) {
      children.get(relation.related_collection)?.add(relation.collection)
    }
  }
  const result: string[] = []
  const visited = new Set<string>()
  const visit = (name: string): void => {
    if (visited.has(name)) return
    visited.add(name)
    for (const child of children.get(name) ?? []) visit(child)
    result.push(name)
  }
  for (const name of collections) visit(name)
  return result
}

function unique(values: string[]): string[] {
  return [...new Set(values)]
}
