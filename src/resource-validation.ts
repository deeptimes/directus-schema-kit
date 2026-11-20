import { Ajv } from 'ajv'
import { settingsResourceSchema, translationResourceSchema } from './schemas.js'
import type { ResourceDefinition, ResourceDefinitions } from './types.js'

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

export function validatePresets(definitions: ResourceDefinition[]): string[] {
  if (!Array.isArray(definitions)) return ['presets 必须是资源数组']
  const errors: string[] = []
  const keys = new Map<string, string>()
  for (const definition of definitions) {
    const source = `${definition?.source ?? 'unknown'}: presets.${definition?.key ?? 'unknown'}`
    if (!definition || typeof definition !== 'object' || definition.type !== 'presets' || typeof definition.key !== 'string' || !definition.key.trim()) {
      errors.push(`${source}: presets 资源结构无效`)
      continue
    }
    const data = definition.data
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      errors.push(`${source}: presets.data 必须是对象`)
      continue
    }
    for (const property of Object.keys(data)) {
      if (!['collection', 'layout', 'icon', 'color', 'user', 'role', 'bookmark', 'layout_query', 'layout_options', 'refresh_interval', 'search', 'filter'].includes(property)) {
        errors.push(`${source}: 不支持的 preset 字段 ${property}`)
      }
    }
    if (typeof data.collection !== 'string' || !data.collection.trim()) errors.push(`${source}: presets.collection 必须是非空字符串`)
    if (data.bookmark !== undefined && data.bookmark !== null && (typeof data.bookmark !== 'string' || !data.bookmark.trim())) {
      errors.push(`${source}: presets.bookmark 必须是非空字符串或 null`)
    }
    if (data.layout !== undefined && (typeof data.layout !== 'string' || !data.layout.trim())) errors.push(`${source}: presets.layout 必须是非空字符串`)
    if (data.user !== undefined && data.user !== null && !isReferenceValue(data.user)) errors.push(`${source}: presets.user 必须是 null 或引用`)
    if (data.role !== undefined && data.role !== null && !isReferenceValue(data.role)) errors.push(`${source}: presets.role 必须是 null 或引用`)
    if (data.user !== undefined && data.user !== null && data.role !== undefined && data.role !== null) {
      errors.push(`${source}: presets.user 和 presets.role 不能同时非 null`)
    }
    for (const property of ['layout_query', 'layout_options']) {
      if (data[property] !== undefined && data[property] !== null && (typeof data[property] !== 'object' || Array.isArray(data[property]))) {
        errors.push(`${source}: presets.${property} 必须是对象或 null`)
      }
    }
    const businessKey = JSON.stringify([data.collection, data.bookmark ?? null, data.role ?? null, data.user ?? null])
    const previous = keys.get(businessKey)
    if (previous) errors.push(`presets 自然键重复 ${businessKey}: ${previous}、${source}`)
    keys.set(businessKey, source)
  }
  return errors
}

function isReferenceValue(value: unknown): boolean {
  return typeof value === 'string'
    || (typeof value === 'object' && value !== null && ('$ref' in value || '$env' in value || '$system' in value))
}

export function validatePermissionChain(definitions: Pick<ResourceDefinitions, 'roles' | 'policies' | 'access' | 'permissions'>): string[] {
  const errors: string[] = []
  const roleNames = new Map<string, string>()
  const policyNames = new Map<string, string>()
  const accessKeys = new Map<string, string>()
  const permissionKeys = new Map<string, string>()

  for (const definition of definitions.roles) {
    const source = `${definition?.source ?? 'unknown'}: roles.${definition?.key ?? 'unknown'}`
    if (!definition || typeof definition !== 'object' || definition.type !== 'roles' || typeof definition.key !== 'string' || !definition.key.trim()) {
      errors.push(`${source}: roles 资源结构无效`)
      continue
    }
    const data = definition.data
    if (!data || typeof data !== 'object' || Array.isArray(data)) { errors.push(`${source}: roles.data 必须是对象`); continue }
    for (const property of Object.keys(data)) if (!['name', 'icon', 'description', 'parent'].includes(property)) errors.push(`${source}: 不支持的 role 字段 ${property}`)
    if (typeof data.name !== 'string' || !data.name.trim()) errors.push(`${source}: roles.name 必须是非空字符串`)
    if (data.icon !== undefined && data.icon !== null && typeof data.icon !== 'string') errors.push(`${source}: roles.icon 必须是字符串或 null`)
    if (data.description !== undefined && data.description !== null && typeof data.description !== 'string') errors.push(`${source}: roles.description 必须是字符串或 null`)
    if (data.parent !== undefined && data.parent !== null && !isReferenceValue(data.parent)) errors.push(`${source}: roles.parent 必须是 null 或引用`)
    const businessKey = JSON.stringify(data.name)
    const previous = roleNames.get(businessKey)
    if (previous) errors.push(`roles name 重复 ${businessKey}: ${previous}、${source}`)
    roleNames.set(businessKey, source)
  }

  for (const definition of definitions.policies) {
    const source = `${definition?.source ?? 'unknown'}: policies.${definition?.key ?? 'unknown'}`
    if (!definition || typeof definition !== 'object' || definition.type !== 'policies' || typeof definition.key !== 'string' || !definition.key.trim()) {
      errors.push(`${source}: policies 资源结构无效`)
      continue
    }
    const data = definition.data
    if (!data || typeof data !== 'object' || Array.isArray(data)) { errors.push(`${source}: policies.data 必须是对象`); continue }
    for (const property of Object.keys(data)) {
      if (!['name', 'icon', 'description', 'ip_access', 'enforce_tfa', 'admin_access', 'app_access'].includes(property)) errors.push(`${source}: 不支持的 policy 字段 ${property}`)
    }
    if (typeof data.name !== 'string' || !data.name.trim()) errors.push(`${source}: policies.name 必须是非空字符串`)
    if (data.icon !== undefined && data.icon !== null && typeof data.icon !== 'string') errors.push(`${source}: policies.icon 必须是字符串或 null`)
    if (data.description !== undefined && data.description !== null && typeof data.description !== 'string') errors.push(`${source}: policies.description 必须是字符串或 null`)
    if (data.ip_access !== undefined && data.ip_access !== null && typeof data.ip_access !== 'string') errors.push(`${source}: policies.ip_access 必须是字符串或 null`)
    for (const property of ['enforce_tfa', 'admin_access', 'app_access']) {
      if (data[property] !== undefined && typeof data[property] !== 'boolean') errors.push(`${source}: policies.${property} 必须是布尔值`)
    }
    const businessKey = JSON.stringify(data.name)
    const previous = policyNames.get(businessKey)
    if (previous) errors.push(`policies name 重复 ${businessKey}: ${previous}、${source}`)
    policyNames.set(businessKey, source)
  }

  for (const definition of definitions.access) {
    const source = `${definition?.source ?? 'unknown'}: access.${definition?.key ?? 'unknown'}`
    if (!definition || typeof definition !== 'object' || definition.type !== 'access' || typeof definition.key !== 'string' || !definition.key.trim()) {
      errors.push(`${source}: access 资源结构无效`)
      continue
    }
    const data = definition.data
    if (!data || typeof data !== 'object' || Array.isArray(data)) { errors.push(`${source}: access.data 必须是对象`); continue }
    for (const property of Object.keys(data)) if (!['role', 'user', 'policy', 'sort'].includes(property)) errors.push(`${source}: 不支持的 access 字段 ${property}`)
    if (data.policy === null || data.policy === undefined || !isReferenceValue(data.policy)) errors.push(`${source}: access.policy 必须是 policy 引用`)
    for (const property of ['role', 'user']) {
      if (data[property] !== undefined && data[property] !== null && !isReferenceValue(data[property])) errors.push(`${source}: access.${property} 必须是 null 或引用`)
    }
    if (data.sort !== undefined && data.sort !== null && typeof data.sort !== 'number') errors.push(`${source}: access.sort 必须是数字或 null`)
    const businessKey = JSON.stringify([data.role ?? null, data.policy ?? null, data.user ?? null])
    const previous = accessKeys.get(businessKey)
    if (previous) errors.push(`access 自然键重复 ${businessKey}: ${previous}、${source}`)
    accessKeys.set(businessKey, source)
  }

  for (const definition of definitions.permissions) {
    const source = `${definition?.source ?? 'unknown'}: permissions.${definition?.key ?? 'unknown'}`
    if (!definition || typeof definition !== 'object' || definition.type !== 'permissions' || typeof definition.key !== 'string' || !definition.key.trim()) {
      errors.push(`${source}: permissions 资源结构无效`)
      continue
    }
    const data = definition.data
    if (!data || typeof data !== 'object' || Array.isArray(data)) { errors.push(`${source}: permissions.data 必须是对象`); continue }
    for (const property of Object.keys(data)) {
      if (!['policy', 'collection', 'action', 'permissions', 'validation', 'presets', 'fields'].includes(property)) errors.push(`${source}: 不支持的 permission 字段 ${property}`)
    }
    if (data.policy === null || data.policy === undefined || !isReferenceValue(data.policy)) errors.push(`${source}: permissions.policy 必须是 policy 引用`)
    if (typeof data.collection !== 'string' || !data.collection.trim()) errors.push(`${source}: permissions.collection 必须是非空字符串`)
    const action = String(data.action)
    if (!['read', 'create', 'update', 'delete', 'share'].includes(action)) errors.push(`${source}: permissions.action 必须是 read / create / update / delete / share`)
    for (const property of ['permissions', 'validation', 'presets']) {
      if (data[property] !== undefined && data[property] !== null && (typeof data[property] !== 'object' || Array.isArray(data[property]))) errors.push(`${source}: permissions.${property} 必须是对象或 null`)
    }
    if (data.fields !== undefined && data.fields !== null) {
      if (!(Array.isArray(data.fields) && data.fields.every((item) => typeof item === 'string')) && typeof data.fields !== 'string') errors.push(`${source}: permissions.fields 必须是字符串数组或字符串`)
    }
    const businessKey = JSON.stringify([data.policy ?? null, data.collection ?? null, action])
    const previous = permissionKeys.get(businessKey)
    if (previous) errors.push(`permissions 自然键重复 ${businessKey}: ${previous}、${source}`)
    permissionKeys.set(businessKey, source)
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
