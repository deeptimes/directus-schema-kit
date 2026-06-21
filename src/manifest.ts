import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createJiti } from 'jiti'
import { glob } from 'tinyglobby'
import { DskError } from './errors.js'
import { expandRelationBlueprint } from './dsl/expand.js'
import type { CollectionDefinition, DskConfig, Manifest, ModuleDefinition, ResourceDefinition, ResourceType } from './types.js'

const resourceTypes: ResourceType[] = ['folders', 'roles', 'policies', 'access', 'permissions', 'presets']

export async function sourceFiles(config: DskConfig, configDirectory: string): Promise<string[]> {
  const patterns = [config.paths.schemaSource, config.paths.resourceSource]
  const files = await glob(patterns, { cwd: configDirectory, absolute: true, onlyFiles: true, followSymbolicLinks: false })
  return [...new Set(files.map((file) => path.resolve(file)))].sort((a, b) => a.localeCompare(b, 'en'))
}

export function calculateSourceDigest(files: string[], projectRoot: string): string {
  const hash = createHash('sha256')
  for (const file of files) {
    const relative = normalizePath(path.relative(projectRoot, file))
    hash.update(relative)
    hash.update('\0')
    hash.update(readFileSync(file))
    hash.update('\0')
  }
  return hash.digest('hex')
}

export async function compileManifest(options: {
  config: DskConfig
  configDirectory: string
  projectRoot: string
  packageVersion: string
}): Promise<Manifest> {
  const files = await sourceFiles(options.config, options.configDirectory)
  if (files.length === 0) {
    throw new DskError('没有找到 Schema DSL 或 Resource DSL 文件', 'BUILD_ERROR', ['请检查 .dsk/config.json 中的 paths 配置'])
  }

  const jiti = createJiti(import.meta.url, { interopDefault: true, moduleCache: false })
  const modules = new Map<string, ModuleDefinition & { sources: string[] }>()

  for (const file of files) {
    let exported: unknown
    try {
      exported = await jiti.import(file, { default: true })
    } catch (error) {
      throw new DskError(`加载 DSL 失败: ${normalizePath(path.relative(options.projectRoot, file))}`, 'BUILD_ERROR', [error instanceof Error ? error.message : String(error)])
    }
    const defaultModuleId = path.basename(file, path.extname(file))
    for (const definition of normalizeDefinitions(exported, defaultModuleId)) {
      const relative = normalizePath(path.relative(options.projectRoot, file))
      const existing = modules.get(definition.id)
      if (existing) {
        existing.collections = [...(existing.collections ?? []), ...(definition.collections ?? [])]
        existing.groups = [...(existing.groups ?? []), ...(definition.groups ?? [])]
        existing.relations = [...(existing.relations ?? []), ...(definition.relations ?? [])]
        existing.resources = [...(existing.resources ?? []), ...(definition.resources ?? [])]
        existing.cleanupCollections = [...(existing.cleanupCollections ?? []), ...(definition.cleanupCollections ?? [])]
        existing.sources.push(relative)
      } else {
        modules.set(definition.id, { ...definition, sources: [relative] })
      }
    }
  }

  const collections: Manifest['collections'] = []
  const fields: Manifest['fields'] = []
  const relations: Manifest['relations'] = []
  const resources: Manifest['resources'] = {
    folders: [], roles: [], policies: [], access: [], permissions: [], presets: [],
  }

  for (const module of [...modules.values()].sort((a, b) => a.id.localeCompare(b.id, 'en'))) {
    for (const definition of [...(module.groups ?? []), ...(module.collections ?? [])]) {
      const normalizedCollection = { ...definition, module: module.id, fields: [] }
      collections.push(normalizedCollection)
      for (const sourceField of definition.fields) {
        const { relation, ...plainField } = sourceField
        fields.push({ ...plainField, collection: definition.collection, module: module.id })
        if (relation) {
          relations.push({
            collection: definition.collection, field: sourceField.field, ...relation,
            meta: { many_collection: definition.collection, many_field: sourceField.field, ...relation.meta }, module: module.id,
          })
        }
      }
    }
    for (const blueprint of module.relations ?? []) {
      const expanded = expandRelationBlueprint(blueprint)
      collections.push(...expanded.collections.map((item) => ({ ...item, fields: [], module: module.id })))
      fields.push(...expanded.fields.map((item) => ({ ...item, module: module.id })))
      relations.push(...expanded.relations.map((item) => ({ ...item, module: module.id })))
    }
    for (const definition of module.resources ?? []) {
      resources[definition.type].push({ ...definition, module: module.id })
    }
  }

  const relativeFiles = files.map((file) => normalizePath(path.relative(options.projectRoot, file)))
  return sortDeep({
    manifestVersion: 2,
    generator: { name: '@deeptimes/directus-schema-kit', version: options.packageVersion },
    source: { algorithm: 'sha256', digest: calculateSourceDigest(files, options.projectRoot), files: relativeFiles },
    modules: [...modules.values()].map((module) => ({
      id: module.id,
      ...(module.version ? { version: module.version } : {}),
      dependsOn: [...(module.dependsOn ?? [])].sort(),
      cleanupCollections: [...new Set(module.cleanupCollections ?? [])].sort(),
      sources: [...new Set(module.sources)].sort(),
    })),
    collections,
    fields,
    relations: relations.map(completeRelation),
    resources,
  })
}

function completeRelation(relation: Manifest['relations'][number]): Manifest['relations'][number] {
  return {
    ...relation,
    meta: {
      many_collection: relation.collection,
      many_field: relation.field,
      one_collection: relation.related_collection,
      one_field: null,
      one_collection_field: null,
      one_allowed_collections: null,
      junction_field: null,
      sort_field: null,
      one_deselect_action: relation.schema?.on_delete === 'CASCADE' ? 'delete' : 'nullify',
      ...relation.meta,
    },
  }
}

function normalizeDefinitions(value: unknown, defaultModuleId: string): ModuleDefinition[] {
  const values = Array.isArray(value) ? value : [value]
  const module: ModuleDefinition = { id: defaultModuleId, collections: [], groups: [], relations: [], resources: [] }
  const explicit: ModuleDefinition[] = []

  for (const item of values) {
    if (!item || typeof item !== 'object') throw new DskError(`模块 ${defaultModuleId} 的默认导出必须是 DSL 定义`, 'BUILD_ERROR')
    const candidate = item as Record<string, unknown>
    if (typeof candidate.id === 'string') explicit.push(item as ModuleDefinition)
    else if (typeof candidate.collection === 'string' && Array.isArray(candidate.fields)) {
      if (candidate.schema === null) module.groups?.push(item as CollectionDefinition & { schema: null })
      else module.collections?.push(item as CollectionDefinition)
    } else if (resourceTypes.includes(candidate.type as ResourceType) && typeof candidate.key === 'string') {
      module.resources?.push(item as ResourceDefinition)
    } else {
      throw new DskError(`模块 ${defaultModuleId} 包含无法识别的 DSL 定义`, 'BUILD_ERROR')
    }
  }
  if ((module.collections?.length ?? 0) + (module.groups?.length ?? 0) + (module.resources?.length ?? 0) > 0) explicit.push(module)
  return explicit
}

function sortDeep<T>(value: T): T {
  if (Array.isArray(value)) return value.map(sortDeep) as T
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b, 'en')).map(([key, item]) => [key, sortDeep(item)])) as T
  }
  return value
}

function normalizePath(value: string): string {
  return value.split(path.sep).join('/')
}
