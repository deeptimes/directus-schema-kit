import { Ajv } from 'ajv'
import { fieldConditionsSchema } from './schemas.js'

const validate = new Ajv({ allErrors: true, strict: false }).compile(fieldConditionsSchema)
const scalar = (value: unknown): boolean => value === null || ['string', 'number', 'boolean'].includes(typeof value)
const textOperators = new Set([
  '_contains', '_ncontains', '_icontains', '_nicontains', '_starts_with', '_nstarts_with', '_istarts_with',
  '_nistarts_with', '_ends_with', '_nends_with', '_iends_with', '_niends_with', '_regex',
])
const booleanOperators = new Set(['_null', '_nnull', '_empty', '_nempty', '_submitted'])
const comparisonOperators = new Set(['_lt', '_lte', '_gt', '_gte'])
const geometryOperators = new Set(['_intersects', '_nintersects', '_intersects_bbox', '_nintersects_bbox'])

export function validateConditions(value: unknown, source: string): string[] {
  const errors: string[] = []
  if (!validate(value)) {
    errors.push(...(validate.errors ?? []).map((error) => `${source}${error.instancePath}: ${error.message}${error.params.additionalProperty ? ` (${String(error.params.additionalProperty)})` : ''}`))
    return errors
  }
  if (Array.isArray(value)) value.forEach((condition: { rule: unknown }, index) => validateFilter(condition.rule, `${source}/${index}/rule`, errors))
  return errors
}

// 只校验 Directus Filter 结构，不执行规则，也不推断业务可达性。
function validateFilter(value: unknown, source: string, errors: string[], field = false): void {
  if (!isObject(value)) { errors.push(`${source}: Filter 必须是对象`); return }
  for (const [key, operand] of Object.entries(value)) {
    const location = `${source}/${key}`
    if (!key.startsWith('_')) {
      validateFilter(operand, location, errors, true)
    } else if (key === '_and' || key === '_or') {
      if (!Array.isArray(operand)) errors.push(`${location}: 逻辑条件必须是数组`)
      else operand.forEach((item, index) => validateFilter(item, `${location}/${index}`, errors))
    } else if (!field) {
      errors.push(`${location}: 比较操作符必须位于字段内`)
    } else if (key === '_some' || key === '_none') {
      validateFilter(operand, location, errors)
    } else if (key === '_eq' || key === '_neq') {
      if (!scalar(operand)) errors.push(`${location}: 必须是标量或 null`)
    } else if (comparisonOperators.has(key)) {
      if (typeof operand !== 'string' && typeof operand !== 'number') errors.push(`${location}: 必须是字符串或数字`)
    } else if (textOperators.has(key)) {
      if (typeof operand !== 'string') errors.push(`${location}: 必须是字符串`)
    } else if (booleanOperators.has(key)) {
      if (typeof operand !== 'boolean') errors.push(`${location}: 必须是布尔值`)
    } else if (['_in', '_nin', '_between', '_nbetween'].includes(key)) {
      if (!Array.isArray(operand) || !operand.every(scalar) || (key.includes('between') && operand.length !== 2)) {
        errors.push(`${location}: 必须是${key.includes('between') ? '包含两个值的' : ''}标量数组`)
      }
    } else if (key === '_json') {
      validateFilter(operand, location, errors)
    } else if (geometryOperators.has(key)) {
      if (typeof operand !== 'string' && !isObject(operand)) errors.push(`${location}: 必须是 GeoJSON 字符串或对象`)
    } else {
      errors.push(`${location}: 不支持的 Directus Filter 操作符`)
    }
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
