import { Ajv } from 'ajv'
import { translationResourceSchema } from './schemas.js'
import type { ResourceDefinition } from './types.js'

const validate = new Ajv({ allErrors: true, strict: false }).compile(translationResourceSchema)

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
