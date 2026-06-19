import type { DeclarativeValue, FieldDefinition, FieldMeta, FieldSchema, FieldType, FieldWidth, OnDelete, Translation } from '../types.js'

interface CommonFieldOptions {
  label?: string
  translations?: Translation[]
  order?: number
  width?: FieldWidth
  required?: boolean
  unique?: boolean
  hidden?: boolean
  readonly?: boolean
  note?: string | null
  interface?: string | null
  options?: Record<string, DeclarativeValue> | null
  display?: string | null
  displayOptions?: Record<string, DeclarativeValue> | null
  defaultValue?: DeclarativeValue
  special?: string[] | null
}

interface StringFieldOptions extends CommonFieldOptions { maxLength?: number }
interface NumberFieldOptions extends CommonFieldOptions { precision?: number; scale?: number }
interface M2OFieldOptions extends CommonFieldOptions {
  collection: string
  type?: Exclude<FieldType, 'alias'>
  onDelete?: OnDelete
  displayTemplate?: string
}

const statusChoices = [
  { text: '草稿', value: 'draft', color: '#FFC23B' },
  { text: '已发布', value: 'published', color: '#6644FF' },
  { text: '已归档', value: 'archived', color: '#E35169' },
]

function meta(fieldName: string, options: CommonFieldOptions, defaults: Partial<FieldMeta> = {}): FieldMeta {
  const translations = options.translations ?? (options.label ? [{ language: 'zh-CN', translation: options.label }] : undefined)
  return compact({
    interface: options.interface ?? defaults.interface,
    options: options.options ?? defaults.options,
    display: options.display ?? defaults.display,
    display_options: options.displayOptions ?? defaults.display_options,
    special: options.special ?? defaults.special,
    note: options.note,
    hidden: options.hidden ?? defaults.hidden ?? false,
    readonly: options.readonly ?? defaults.readonly ?? false,
    required: options.required ?? false,
    sort: options.order,
    width: options.width ?? defaults.width ?? 'full',
    translations: translations ?? [{ language: 'en-US', translation: fieldName }],
  }) as FieldMeta
}

function schema(options: CommonFieldOptions, extra: FieldSchema = {}): FieldSchema {
  return compact({
    default_value: options.defaultValue ?? null,
    is_nullable: !(options.required ?? false),
    is_unique: options.unique ?? false,
    ...extra,
  })
}

function scalar(type: FieldType, name: string, options: CommonFieldOptions = {}, extra: FieldSchema = {}): FieldDefinition {
  return { field: name, type, meta: meta(name, options, { interface: 'input' }), schema: schema(options, extra) }
}

export const field = {
  string(name: string, options: StringFieldOptions = {}): FieldDefinition {
    return scalar('string', name, options, { max_length: options.maxLength ?? 255 })
  },
  text(name: string, options: CommonFieldOptions = {}): FieldDefinition {
    return { field: name, type: 'text', meta: meta(name, options, { interface: 'input-multiline' }), schema: schema(options) }
  },
  integer(name: string, options: NumberFieldOptions = {}): FieldDefinition {
    return scalar('integer', name, options)
  },
  decimal(name: string, options: NumberFieldOptions = {}): FieldDefinition {
    return scalar('decimal', name, options, { numeric_precision: options.precision ?? 10, numeric_scale: options.scale ?? 2 })
  },
  boolean(name: string, options: CommonFieldOptions = {}): FieldDefinition {
    return { field: name, type: 'boolean', meta: meta(name, options, { interface: 'boolean' }), schema: schema(options) }
  },
  dateTime(name: string, options: CommonFieldOptions = {}): FieldDefinition {
    return { field: name, type: 'dateTime', meta: meta(name, options, { interface: 'datetime' }), schema: schema(options) }
  },
  json(name: string, options: CommonFieldOptions = {}): FieldDefinition {
    return { field: name, type: 'json', meta: meta(name, options, { interface: 'input-code' }), schema: schema(options) }
  },
  status(options: CommonFieldOptions = {}): FieldDefinition {
    return field.string('status', {
      label: '状态', width: 'half', required: true, defaultValue: 'draft',
      interface: 'select-dropdown', options: { choices: statusChoices }, display: 'labels', ...options,
    })
  },
  sort(options: CommonFieldOptions = {}): FieldDefinition {
    return field.integer('sort', { label: '排序', width: 'half', hidden: true, ...options })
  },
  m2o(name: string, options: M2OFieldOptions): FieldDefinition {
    const { collection, type = 'uuid', onDelete = 'SET NULL', displayTemplate, ...fieldOptions } = options
    return {
      field: name,
      type,
      meta: meta(name, { interface: 'select-dropdown-m2o', ...fieldOptions }, {
        special: ['m2o'],
        display: 'related-values',
        ...(displayTemplate ? { display_options: { template: displayTemplate } } : {}),
      }),
      schema: schema(fieldOptions),
      relation: { related_collection: collection, schema: { on_delete: onDelete } },
    }
  },
  audit(): FieldDefinition[] {
    return [
      field.m2o('user_created', { label: '创建用户', collection: 'directus_users', readonly: true, hidden: true, onDelete: 'SET NULL' }),
      { ...field.dateTime('date_created', { label: '创建时间', readonly: true, hidden: true }), meta: { ...field.dateTime('date_created').meta, special: ['date-created'] } },
      field.m2o('user_updated', { label: '更新用户', collection: 'directus_users', readonly: true, hidden: true, onDelete: 'SET NULL' }),
      { ...field.dateTime('date_updated', { label: '更新时间', readonly: true, hidden: true }), meta: { ...field.dateTime('date_updated').meta, special: ['date-updated'] } },
    ]
  },
}

function compact<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T
}
