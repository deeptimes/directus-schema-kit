export const translationResourceSchema = {
  type: 'object', additionalProperties: false, required: ['type', 'key', 'data'],
  properties: {
    type: { const: 'translations' }, key: { type: 'string', minLength: 1, pattern: '\\S' },
    source: { type: 'string' }, delete: { type: 'boolean' },
    data: {
      type: 'object', additionalProperties: false, required: ['key', 'language'],
      properties: {
        key: { type: 'string', minLength: 1, maxLength: 255, pattern: '\\S' },
        language: { type: 'string', minLength: 1, maxLength: 255, pattern: '\\S' },
        value: { type: 'string' },
      },
    },
  },
  if: { properties: { delete: { const: true } }, required: ['delete'] },
  then: {}, else: { properties: { data: { required: ['value'] } } },
} as const

export const fieldConditionsSchema = {
  type: ['array', 'null'],
  items: {
    type: 'object', additionalProperties: false, required: ['name', 'rule'],
    properties: {
      name: { type: 'string', minLength: 1 }, rule: { type: 'object' },
      hidden: { type: 'boolean' }, required: { type: 'boolean' }, readonly: { type: 'boolean' },
      clear_hidden_value_on_save: { type: 'boolean' }, options: { type: 'object' },
    },
  },
} as const

// Manifest 的深层 Directus meta/data 保持开放，结构约束由语义校验补充。
export const manifestJsonSchema = {
  type: 'object', additionalProperties: false,
  required: ['manifestVersion', 'generator', 'source', 'collections', 'fields', 'relations', 'resources'],
  properties: {
    manifestVersion: { type: 'number', enum: [1] },
    generator: {
      type: 'object', additionalProperties: false, required: ['name', 'version'],
      properties: { name: { type: 'string' }, version: { type: 'string' } },
    },
    source: {
      type: 'object', additionalProperties: false, required: ['algorithm', 'digest', 'files'],
      properties: {
        algorithm: { type: 'string', const: 'sha256' },
        digest: { type: 'string', pattern: '^[a-f0-9]{64}$' },
        files: { type: 'array', items: { type: 'string' } },
      },
    },
    collections: { type: 'array', items: { type: 'object', required: [], additionalProperties: true } },
    fields: { type: 'array', items: { type: 'object', required: [], additionalProperties: true } },
    relations: { type: 'array', items: { type: 'object', required: [], additionalProperties: true } },
    resources: {
      type: 'object', additionalProperties: false,
      required: ['folders', 'roles', 'policies', 'access', 'permissions', 'presets'],
      properties: {
        folders: { type: 'array', items: { type: 'object', required: [], additionalProperties: true } },
        roles: { type: 'array', items: { type: 'object', required: [], additionalProperties: true } },
        policies: { type: 'array', items: { type: 'object', required: [], additionalProperties: true } },
        access: { type: 'array', items: { type: 'object', required: [], additionalProperties: true } },
        permissions: { type: 'array', items: { type: 'object', required: [], additionalProperties: true } },
        translations: { type: 'array', items: translationResourceSchema },
        presets: { type: 'array', items: { type: 'object', required: [], additionalProperties: true } },
      },
    },
  },
}

export const seedJsonSchema = {
  $id: 'https://deeptimes.dev/dsk/seed.schema.json',
  type: 'object', additionalProperties: false,
  required: ['schemaVersion', 'collection', 'upsertBy', 'items'],
  properties: {
    schemaVersion: { const: 1 },
    collection: { type: 'string', minLength: 1 },
    upsertBy: { type: 'array', minItems: 1, uniqueItems: true, items: { type: 'string', minLength: 1 } },
    defaults: { type: 'object' },
    refs: {
      type: 'object', additionalProperties: {
        type: 'object', additionalProperties: false, required: ['collection'],
        properties: {
          collection: { type: 'string', minLength: 1 }, field: { type: 'string', minLength: 1 },
          from: { type: 'string', minLength: 1 }, scope: { type: 'array', items: { type: 'string', minLength: 1 } },
          nullable: { type: 'boolean' }, keepSource: { type: 'boolean' },
        },
      },
    },
    items: { type: 'array', items: { type: 'object' } },
  },
} as const
