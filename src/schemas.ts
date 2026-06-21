import type { JSONSchemaType } from 'ajv'
import type { Manifest } from './types.js'

// Manifest 的深层 Directus meta/data 保持开放，结构约束由语义校验补充。
export const manifestJsonSchema: JSONSchemaType<Manifest> = {
  type: 'object', additionalProperties: false,
  required: ['manifestVersion', 'generator', 'source', 'modules', 'collections', 'fields', 'relations', 'resources'],
  properties: {
    manifestVersion: { type: 'number', enum: [1, 2] },
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
    modules: { type: 'array', items: { type: 'object', required: [], additionalProperties: true } },
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
