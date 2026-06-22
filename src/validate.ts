import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { Ajv } from 'ajv'
import { glob } from 'tinyglobby'
import { formatAjvErrors } from './config.js'
import { DskError } from './errors.js'
import { calculateSourceDigest, sourceFiles } from './manifest.js'
import { manifestJsonSchema, seedJsonSchema } from './schemas.js'
import type { DskConfig, Manifest } from './types.js'

export function validateManifest(manifest: Manifest, config: DskConfig): string[] {
  const errors: string[] = []
  const ajv = new Ajv({ allErrors: true, strict: false })
  const validate = ajv.compile(manifestJsonSchema)
  if (!validate(manifest)) errors.push(...formatAjvErrors(validate.errors).map((item) => `manifest${item}`))

  collectDefinitionDuplicates(manifest.collections, (item) => item.collection, '集合', errors)
  collectDefinitionDuplicates(manifest.fields, (item) => `${item.collection}.${item.field}`, '字段', errors)
  collectDefinitionDuplicates(manifest.relations, (item) => `${item.collection}.${item.field}`, '关系', errors)
  for (const [type, definitions] of Object.entries(manifest.resources)) {
    collectDefinitionDuplicates(definitions, (item) => item.key, `${type} 资源`, errors)
  }
  validateResourceReferences(manifest, config, errors)

  const collections = new Set(manifest.collections.map((item) => item.collection))
  for (const collection of manifest.collections.filter((item) => item.schema !== null)) {
    const primaryKeys = manifest.fields.filter((item) => item.collection === collection.collection && item.schema?.is_primary_key)
    if (primaryKeys.length !== 1) errors.push(`集合 ${collection.collection} 必须且只能有一个主键，当前为 ${primaryKeys.length} 个`)
  }
  for (const relation of manifest.relations) {
    if (!collections.has(relation.collection)) errors.push(`关系 ${relation.collection}.${relation.field} 的来源集合不存在`)
    const relationField = manifest.fields.find((item) => item.collection === relation.collection && item.field === relation.field)
    if (!relationField) errors.push(`关系 ${relation.collection}.${relation.field} 缺少来源字段`)
    if (relation.related_collection !== null && !collections.has(relation.related_collection) && !relation.related_collection.startsWith('directus_')) {
      errors.push(`关系 ${relation.collection}.${relation.field} 的目标集合 ${relation.related_collection} 不存在`)
    }
    validateRelation(manifest, relation, errors)
  }
  if (config.validation?.requireChineseTranslations) {
    for (const item of manifest.fields) {
      if (!item.meta.translations?.some((translation) => translation.language === 'zh-CN' && translation.translation.trim())) {
        errors.push(`字段 ${item.collection}.${item.field} 缺少 zh-CN 翻译`)
      }
    }
  }
  return errors
}

function validateRelation(manifest: Manifest, relation: Manifest['relations'][number], errors: string[]): void {
  const name = `${relation.collection}.${relation.field}`
  const meta = relation.meta ?? {}
  if (meta.many_collection !== relation.collection || meta.many_field !== relation.field) {
    errors.push(`关系 ${name} 的 meta.many_collection/many_field 与来源字段不一致`)
  }
  if (relation.related_collection === null) {
    if (!meta.one_collection_field) errors.push(`M2A 关系 ${name} 缺少 meta.one_collection_field`)
    if (!meta.one_allowed_collections?.length) errors.push(`M2A 关系 ${name} 缺少 meta.one_allowed_collections`)
    if (meta.one_collection_field && !hasField(manifest, relation.collection, meta.one_collection_field)) {
      errors.push(`M2A 关系 ${name} 的 collection discriminator 字段不存在: ${relation.collection}.${meta.one_collection_field}`)
    }
  } else if (meta.one_collection !== relation.related_collection) {
    errors.push(`关系 ${name} 的 meta.one_collection 与 related_collection 不一致`)
  }
  if (meta.one_field) {
    const oneCollection = relation.related_collection ?? meta.one_collection
    const alias = oneCollection ? manifest.fields.find((item) => item.collection === oneCollection && item.field === meta.one_field) : undefined
    if (!alias || alias.type !== 'alias' || alias.schema !== null) errors.push(`关系 ${name} 引用的 alias 字段无效: ${oneCollection ?? 'null'}.${meta.one_field}`)
  }
  if (meta.junction_field && !hasField(manifest, relation.collection, meta.junction_field)) {
    errors.push(`关系 ${name} 的 junction_field 不存在: ${relation.collection}.${meta.junction_field}`)
  }
  if (meta.junction_field) {
    const reciprocal = manifest.relations.find((item) => item.collection === relation.collection && item.field === meta.junction_field)
    if (!reciprocal) {
      errors.push(`关系 ${name} 的 junction relation 不存在: ${relation.collection}.${meta.junction_field}`)
    } else if (reciprocal.meta?.junction_field !== relation.field) {
      errors.push(`关系 ${name} 与 ${reciprocal.collection}.${reciprocal.field} 的 junction_field 必须互相引用`)
    }
  }
  if (meta.sort_field && !hasField(manifest, relation.collection, meta.sort_field)) {
    errors.push(`关系 ${name} 的 sort_field 不存在: ${relation.collection}.${meta.sort_field}`)
  }
}

function hasField(manifest: Manifest, collection: string, field: string): boolean {
  return manifest.fields.some((item) => item.collection === collection && item.field === field)
}

function validateResourceReferences(manifest: Manifest, config: DskConfig, errors: string[]): void {
  const definitions = Object.values(manifest.resources).flat()
  const keys = new Set(definitions.map((item) => `${item.type}.${item.key}`))
  const dependencies = new Map<string, string[]>()
  const allowedEnvironment = new Set(config.env?.allowedVariables ?? [])
  for (const definition of definitions) {
    const key = `${definition.type}.${definition.key}`
    const references = collectMarkers(definition.data)
    dependencies.set(key, references.refs)
    for (const reference of references.refs) if (!keys.has(reference)) errors.push(`系统资源 ${key} 引用了不存在的资源 ${reference}`)
    for (const name of references.env) if (!allowedEnvironment.has(name)) errors.push(`系统资源 ${key} 使用了未授权环境变量 ${name}`)
  }
  const visited = new Set<string>()
  const visiting = new Set<string>()
  const visit = (key: string): void => {
    if (visited.has(key)) return
    if (visiting.has(key)) {
      errors.push(`系统资源存在循环引用: ${key}`)
      return
    }
    visiting.add(key)
    for (const dependency of dependencies.get(key) ?? []) if (keys.has(dependency)) visit(dependency)
    visiting.delete(key)
    visited.add(key)
  }
  for (const key of keys) visit(key)
}

function collectMarkers(value: unknown): { refs: string[]; env: string[] } {
  const result = { refs: [] as string[], env: [] as string[] }
  const visit = (item: unknown): void => {
    if (Array.isArray(item)) return item.forEach(visit)
    if (!item || typeof item !== 'object') return
    const record = item as Record<string, unknown>
    if (typeof record.$ref === 'string') result.refs.push(record.$ref)
    else if (typeof record.$env === 'string') result.env.push(record.$env)
    else Object.values(record).forEach(visit)
  }
  visit(value)
  return result
}

export async function validateWorkspace(options: {
  config: DskConfig
  configDirectory: string
  projectRoot: string
}): Promise<{ manifest: Manifest; seedFiles: number }> {
  const manifestPath = path.resolve(options.configDirectory, options.config.paths.manifest)
  if (!existsSync(manifestPath)) throw new DskError(`Manifest 不存在: ${manifestPath}`, 'VALIDATION_ERROR', ['请先运行 dsk build'])
  let manifest: Manifest
  try {
    const parsed: unknown = JSON.parse(readFileSync(manifestPath, 'utf8'))
    const version = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>).manifestVersion : undefined
    if (version !== 3) {
      throw new DskError(`不支持的 Manifest 版本: ${String(version)}`, 'VALIDATION_ERROR', ['当前仅支持无模块结构的 Manifest V3；请运行 dsk build 重新生成'])
    }
    manifest = parsed as Manifest
  } catch (error) {
    if (error instanceof DskError) throw error
    throw new DskError(`Manifest 不是有效 JSON: ${manifestPath}`, 'VALIDATION_ERROR', [error instanceof Error ? error.message : String(error)])
  }

  const errors = validateManifest(manifest, options.config)
  const files = await sourceFiles(options.config, options.configDirectory)
  const digest = calculateSourceDigest(files, options.projectRoot)
  if (manifest.source?.digest !== digest) errors.push('Manifest 已过期，DSL 源码与上次 build 不一致；请运行 dsk build')

  const seedFiles = await glob(options.config.paths.seeds, { cwd: options.configDirectory, absolute: true, onlyFiles: true })
  const ajv = new Ajv({ allErrors: true, strict: false })
  const validateSeed = ajv.compile(seedJsonSchema)
  for (const file of seedFiles.sort()) {
    try {
      const value: unknown = JSON.parse(readFileSync(file, 'utf8'))
      if (!validateSeed(value)) {
        errors.push(...formatAjvErrors(validateSeed.errors).map((item) => `${path.relative(options.projectRoot, file)}${item}`))
      }
    } catch (error) {
      errors.push(`${path.relative(options.projectRoot, file)}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  if (errors.length > 0) throw new DskError('工作区校验失败', 'VALIDATION_ERROR', errors)
  return { manifest, seedFiles: seedFiles.length }
}

function collectDefinitionDuplicates<T extends { source?: string }>(items: T[], key: (item: T) => string, label: string, errors: string[]): void {
  const sources = new Map<string, string[]>()
  for (const item of items) {
    const value = key(item)
    const current = sources.get(value) ?? []
    current.push(item.source ?? 'unknown')
    sources.set(value, current)
  }
  for (const [value, definitions] of sources) {
    if (definitions.length > 1) errors.push(`${label}重复定义: ${value}（${definitions.join('、')}）`)
  }
}
