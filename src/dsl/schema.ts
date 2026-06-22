import type { CollectionDefinition, CollectionGroupDefinition, CollectionOptions, FieldDefinition, ResourceDefinition, ResourceType, SchemaDefinition } from '../types.js'

export function collection(options: CollectionOptions): CollectionDefinition {
  const fields = options.fields ?? []
  const primary = primaryField(options.primaryKey ?? 'uuid')
  if (fields.some((item) => item.field === 'id')) {
    throw new Error(`集合 ${options.name} 不应手动声明 id 字段，请使用 primaryKey`)
  }
  const archive = options.archive ?? fields.some((item) => item.field === 'status')
  return {
    collection: options.name,
    meta: compact({
      collection: options.name,
      icon: options.icon ?? 'table_chart',
      note: options.note ?? null,
      display_template: options.displayTemplate ?? null,
      hidden: false,
      singleton: false,
      accountability: options.accountability ?? null,
      archive_field: archive ? 'status' : null,
      archive_app_filter: archive,
      archive_value: archive ? 'archived' : null,
      unarchive_value: archive ? (options.defaultStatus ?? 'draft') : null,
      sort_field: fields.some((item) => item.field === 'sort') ? 'sort' : null,
      group: options.group ?? null,
      sort: options.order ?? null,
      collapse: 'open',
      translations: [{ language: 'zh-CN', translation: options.label }],
    }),
    schema: {},
    fields: [primary, ...fields],
  }
}

export function collectionGroup(options: { name: string; label: string; icon?: string; group?: string; order?: number }): CollectionGroupDefinition {
  return {
    collection: options.name,
    schema: null,
    fields: [],
    meta: compact({
      collection: options.name,
      icon: options.icon ?? 'folder',
      group: options.group ?? null,
      sort: options.order ?? null,
      collapse: 'open',
      translations: [{ language: 'zh-CN', translation: options.label }],
    }),
  }
}

export function defineSchema(definition: SchemaDefinition): SchemaDefinition {
  return definition
}

export function resource(type: ResourceType, options: { key: string; data: ResourceDefinition['data']; delete?: boolean }): ResourceDefinition {
  return { type, key: options.key, data: options.data, ...(options.delete ? { delete: true } : {}) }
}

function primaryField(type: 'uuid' | 'integer'): FieldDefinition {
  if (type === 'integer') {
    return {
      field: 'id', type: 'integer',
      meta: { interface: 'input', hidden: true, readonly: true, required: true, sort: 1, width: 'half', translations: [{ language: 'en-US', translation: 'ID' }] },
      schema: { is_primary_key: true, is_nullable: false, is_unique: true, has_auto_increment: true },
    }
  }
  return {
    field: 'id', type: 'uuid',
    meta: { interface: 'input', special: ['uuid'], hidden: true, readonly: true, required: false, sort: 1, width: 'half', translations: [{ language: 'en-US', translation: 'ID' }] },
    schema: { is_primary_key: true, is_nullable: false, is_unique: true },
  }
}

function compact<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T
}
