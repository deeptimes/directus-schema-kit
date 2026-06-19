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

  collectDuplicates(manifest.modules.map((item) => item.id), '模块', errors)
  collectDuplicates(manifest.collections.map((item) => item.collection), '集合', errors)
  collectDuplicates(manifest.fields.map((item) => `${item.collection}.${item.field}`), '字段', errors)
  collectDuplicates(manifest.relations.map((item) => `${item.collection}.${item.field}`), '关系', errors)
  for (const [type, definitions] of Object.entries(manifest.resources)) {
    collectDuplicates(definitions.map((item) => item.key), `${type} 资源`, errors)
  }

  const collections = new Set(manifest.collections.map((item) => item.collection))
  for (const collection of manifest.collections.filter((item) => item.schema !== null)) {
    const primaryKeys = manifest.fields.filter((item) => item.collection === collection.collection && item.schema?.is_primary_key)
    if (primaryKeys.length !== 1) errors.push(`集合 ${collection.collection} 必须且只能有一个主键，当前为 ${primaryKeys.length} 个`)
  }
  for (const relation of manifest.relations) {
    if (!collections.has(relation.collection)) errors.push(`关系 ${relation.collection}.${relation.field} 的来源集合不存在`)
    if (!collections.has(relation.related_collection) && !relation.related_collection.startsWith('directus_')) {
      errors.push(`关系 ${relation.collection}.${relation.field} 的目标集合 ${relation.related_collection} 不存在`)
    }
  }
  if (config.validation?.requireChineseTranslations) {
    for (const item of manifest.fields) {
      if (!item.meta.translations?.some((translation) => translation.language === 'zh-CN' && translation.translation.trim())) {
        errors.push(`字段 ${item.collection}.${item.field} 缺少 zh-CN 翻译`)
      }
    }
  }
  for (const module of manifest.modules) {
    for (const name of module.cleanupCollections) {
      if (name.startsWith('directus_')) errors.push(`模块 ${module.id} 的 cleanupCollections 不得包含系统集合 ${name}`)
      if (!collections.has(name)) errors.push(`模块 ${module.id} 的 cleanupCollections 包含未声明集合 ${name}`)
    }
  }
  return errors
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
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest
  } catch (error) {
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

function collectDuplicates(values: string[], label: string, errors: string[]): void {
  const seen = new Set<string>()
  for (const value of values) {
    if (seen.has(value)) errors.push(`${label}重复定义: ${value}`)
    seen.add(value)
  }
}
