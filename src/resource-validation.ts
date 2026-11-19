import { Ajv } from 'ajv'
import { settingsResourceSchema, translationResourceSchema } from './schemas.js'
import type { ResourceDefinition } from './types.js'

const validate = new Ajv({ allErrors: true, strict: false }).compile(translationResourceSchema)
const validateSettingsSchema = new Ajv({ allErrors: true, strict: false }).compile(settingsResourceSchema)

export function validateFolders(definitions: ResourceDefinition[]): string[] {
  if (!Array.isArray(definitions)) return ['folders 必须是资源数组']
  const errors: string[] = []
  for (const definition of definitions) {
    const source = `${definition?.source ?? 'unknown'}: folders.${definition?.key ?? 'unknown'}`
    if (!definition || typeof definition !== 'object' || definition.type !== 'folders' || typeof definition.key !== 'string' || !definition.key.trim()) {
      errors.push(`${source}: folders 资源结构无效`)
      continue
    }
    const data = definition.data
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      errors.push(`${source}: folders.data 必须是对象`)
      continue
    }
    for (const property of Object.keys(data)) {
      if (!['name', 'parent', 'type'].includes(property)) errors.push(`${source}: 不支持的 folder 字段 ${property}`)
    }
    if (typeof data.name !== 'string' || !data.name.trim()) {
      errors.push(`${source}: folders.name 必须是非空字符串`)
    }
    if (data.parent !== null && typeof data.parent !== 'string' && !(typeof data.parent === 'object' && data.parent !== null && '$ref' in data.parent)) {
      errors.push(`${source}: folders.parent 必须是 null、字符串或 ref()`)
    }
    if (data.type !== undefined && data.type !== 'files' && data.type !== 'flows') {
      errors.push(`${source}: folders.type 只能是 files 或 flows`)
    }
  }
  return errors
}

export function validateSettings(definitions: ResourceDefinition[] | undefined): string[] {
  if (definitions === undefined) return []
  if (!Array.isArray(definitions)) return ['settings 必须是资源数组']
  const errors: string[] = []
  if (definitions.length > 1) errors.push('settings 只能声明一条资源')
  const identifiers = new Map<string, string>()
  for (const definition of definitions) {
    const source = `${definition?.source ?? 'unknown'}: settings.${definition?.key ?? 'unknown'}`
    if (!validateSettingsSchema(definition)) {
      errors.push(...(validateSettingsSchema.errors ?? []).map((error) => `${source}${error.instancePath}: ${error.message}${error.params.additionalProperty ? ` (${String(error.params.additionalProperty)})` : ''}`))
      continue
    }
    const idSource = identifiers.get(definition.key)
    if (idSource) errors.push(`settings 资源标识重复: ${source}、${idSource}`)
    identifiers.set(definition.key, source)
  }
  return errors
}

export function validateTranslations(definitions: ResourceDefinition[]): string[] {
  if (!Array.isArray(definitions)) return ['translations 必须是资源数组']
  const errors: string[] = []
  const keys = new Map<string, string>()
  const identifiers = new Map<string, string>()
  for (const definition of definitions) {
    const source = `${definition?.source ?? 'unknown'}: translations.${definition?.key ?? 'unknown'}`
    if (!validate(definition)) {
      errors.push(...(validate.errors ?? []).map((error) => `${source}${error.instancePath}: ${error.message}${error.params.additionalProperty ? ` (${String(error.params.additionalProperty)})` : ''}`))
      continue
    }
    const idSource = identifiers.get(definition.key)
    if (idSource) errors.push(`translations 资源标识重复: ${source}、${idSource}`)
    identifiers.set(definition.key, source)
    const key = JSON.stringify([definition.data.key, definition.data.language])
    const previous = keys.get(key)
    if (previous) errors.push(`translations 自然键重复 ${key}: ${previous}、${source}`)
    keys.set(key, source)
  }
  return errors
}
