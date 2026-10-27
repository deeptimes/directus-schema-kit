import { DskError } from './errors.js'
import type { Manifest } from './types.js'

export function orderedCollections(collections: Manifest['collections']): Manifest['collections'] {
  const definitions = new Map(collections.map((item) => [item.collection, item]))
  const ordered: Manifest['collections'] = []
  const visited = new Set<string>()
  const visiting: string[] = []
  const visit = (name: string): void => {
    if (visited.has(name)) return
    if (visiting.includes(name)) {
      throw new DskError(`集合分组存在循环依赖: ${[...visiting, name].join(' -> ')}`, 'VALIDATION_ERROR')
    }
    const collection = definitions.get(name)!
    visiting.push(name)
    const parent = collection.meta.group
    if (parent !== null && parent !== undefined) {
      if (typeof parent !== 'string' || !parent) {
        throw new DskError(`集合 ${name} 的 meta.group 必须是非空集合名或 null`, 'VALIDATION_ERROR')
      }
      if (!definitions.has(parent)) {
        throw new DskError(`集合 ${name} 的父集合 ${parent} 不存在于 Manifest 中`, 'VALIDATION_ERROR')
      }
      visit(parent)
    }
    visiting.pop()
    visited.add(name)
    ordered.push(collection)
  }
  for (const collection of collections) visit(collection.collection)
  return ordered
}
