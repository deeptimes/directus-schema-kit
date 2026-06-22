import { field } from './field.js'
import { collection } from './schema.js'
import type { CollectionDefinition, FieldDefinition, FileRelationBlueprint, FilesRelationBlueprint, JunctionRelationBlueprint, RelationBlueprint, RelationDefinition, RelationFieldOptions } from '../types.js'

export interface ExpandedRelationBlueprint {
  collections: CollectionDefinition[]
  fields: Array<FieldDefinition & { collection: string }>
  relations: RelationDefinition[]
}

export function expandRelationBlueprint(blueprint: RelationBlueprint): ExpandedRelationBlueprint {
  if (blueprint.type === 'm2o') return expandM2O(blueprint)
  if (blueprint.type === 'file' || blueprint.type === 'image') return expandFile(blueprint)
  if (blueprint.type === 'o2m') return expandO2M(blueprint)
  if (blueprint.type === 'files') return expandFiles(blueprint)
  if (blueprint.type === 'm2a') return expandM2A(blueprint)
  if (blueprint.type === 'translations') return expandTranslations(blueprint)
  return expandJunction(blueprint as JunctionRelationBlueprint)
}

function expandM2O(blueprint: Extract<RelationBlueprint, { type: 'm2o' }>): ExpandedRelationBlueprint {
  const options = blueprint.fieldOptions ?? {}
  const definition = field.m2o(blueprint.field, {
    collection: blueprint.relatedCollection,
    type: blueprint.foreignKeyType ?? 'uuid',
    onDelete: blueprint.onDelete ?? 'SET NULL',
    ...toFieldOptions(options),
    interface: options.interface ?? 'select-dropdown-m2o',
  })
  const { relation: _legacy, ...plain } = definition
  return {
    collections: [],
    fields: [{ ...plain, collection: blueprint.collection }],
    relations: [{
      collection: blueprint.collection,
      field: blueprint.field,
      related_collection: blueprint.relatedCollection,
      schema: { on_delete: blueprint.onDelete ?? 'SET NULL' },
      meta: {
        many_collection: blueprint.collection, many_field: blueprint.field,
        one_collection: blueprint.relatedCollection, one_field: null,
        one_deselect_action: blueprint.onDelete === 'CASCADE' ? 'delete' : 'nullify',
        ...blueprint.meta,
      },
    }],
  }
}

const directusImageMimeTypes = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/avif', 'image/tiff',
]

function expandFile(blueprint: FileRelationBlueprint): ExpandedRelationBlueprint {
  const options = blueprint.fieldOptions ?? {}
  const allowedMimeTypes = blueprint.allowedMimeTypes ?? (blueprint.type === 'image' ? directusImageMimeTypes : undefined)
  const interfaceOptions = {
    ...(options.options ?? {}),
    ...(allowedMimeTypes ? { allowedMimeTypes: [...allowedMimeTypes] } : {}),
  }
  const definition = field.m2o(blueprint.field, {
    collection: 'directus_files',
    type: blueprint.foreignKeyType ?? 'uuid',
    onDelete: blueprint.onDelete ?? 'SET NULL',
    ...toFieldOptions(options),
    interface: options.interface ?? (blueprint.type === 'image' ? 'file-image' : 'file'),
    options: Object.keys(interfaceOptions).length > 0 ? interfaceOptions : null,
  })
  const { relation: _legacy, ...plain } = definition
  plain.meta = {
    ...plain.meta,
    display: options.display !== undefined ? options.display : blueprint.type === 'image' ? 'image' : 'file',
    special: ['file'],
  }
  return {
    collections: [],
    fields: [{ ...plain, collection: blueprint.collection }],
    relations: [{
      collection: blueprint.collection,
      field: blueprint.field,
      related_collection: 'directus_files',
      schema: { on_delete: blueprint.onDelete ?? 'SET NULL' },
      meta: {
        many_collection: blueprint.collection,
        many_field: blueprint.field,
        one_collection: 'directus_files',
        one_field: null,
        one_deselect_action: blueprint.onDelete === 'CASCADE' ? 'delete' : 'nullify',
        ...blueprint.meta,
      },
    }],
  }
}

function expandO2M(blueprint: Extract<RelationBlueprint, { type: 'o2m' }>): ExpandedRelationBlueprint {
  const many = expandM2O({
    kind: 'relation-blueprint', type: 'm2o', collection: blueprint.relatedCollection,
    field: blueprint.relatedField, relatedCollection: blueprint.collection,
    onDelete: blueprint.onDelete ?? 'SET NULL',
  })
  const alias = aliasField(blueprint.field, blueprint.fieldOptions, 'list-o2m', ['o2m'])
  const relation = required(many.relations[0])
  relation.meta = { ...relation.meta, one_field: blueprint.field, ...blueprint.meta }
  return { collections: [], fields: [...many.fields, { ...alias, collection: blueprint.collection }], relations: [relation] }
}

function expandJunction(blueprint: Extract<RelationBlueprint, { type: 'm2m' }>): ExpandedRelationBlueprint {
  const junction = blueprint.junction ?? {}
  const junctionCollection = junction.collection ?? `${blueprint.collection}_${blueprint.field}`
  const sourceField = junction.sourceField ?? `${blueprint.collection}_id`
  const targetField = junction.targetField ?? `${blueprint.relatedCollection}_id`
  const sortField = junction.sortField === false ? null : junction.sortField ?? 'sort'
  const generated = collection({ name: junctionCollection, label: junctionCollection, primaryKey: junction.primaryKey ?? 'uuid' })
  hideGeneratedJunction(generated, blueprint.collection)
  const alias = aliasField(blueprint.field, blueprint.fieldOptions, 'list-m2m', ['m2m'])
  const source = relationField(junctionCollection, sourceField, blueprint.collection, junction.onDelete ?? 'CASCADE')
  const target = relationField(junctionCollection, targetField, blueprint.relatedCollection, junction.onDelete ?? 'CASCADE')
  source.relation.meta = {
    ...source.relation.meta, one_field: blueprint.field, junction_field: targetField,
    ...(sortField ? { sort_field: sortField } : {}), ...blueprint.meta,
  }
  target.relation.meta = { ...target.relation.meta, junction_field: sourceField }
  return {
    collections: [generated],
    fields: [
      ...generated.fields.map((item) => ({ ...item, collection: junctionCollection })),
      { ...alias, collection: blueprint.collection }, source.field, target.field,
      ...(sortField ? [{ ...field.integer(sortField, { hidden: true }), collection: junctionCollection }] : []),
    ],
    relations: [source.relation, target.relation],
  }
}

function expandFiles(blueprint: FilesRelationBlueprint): ExpandedRelationBlueprint {
  const junction = blueprint.junction ?? {}
  const junctionCollection = junction.collection ?? `${blueprint.collection}_files`
  const sourceField = junction.sourceField ?? `${blueprint.collection}_id`
  const targetField = junction.targetField ?? 'directus_files_id'
  const sortField = junction.sortField === false ? null : junction.sortField ?? 'sort'
  const onDelete = junction.onDelete ?? 'SET NULL'
  const generated = collection({ name: junctionCollection, label: junctionCollection, primaryKey: junction.primaryKey ?? 'integer' })
  hideGeneratedJunction(generated, blueprint.collection)
  const primary = generated.fields[0]
  if (primary && (junction.primaryKey ?? 'integer') === 'integer') {
    primary.meta = {
      ...primary.meta,
      interface: null,
      readonly: false,
      required: false,
      width: 'full',
    }
    primary.schema = {
      ...primary.schema,
      is_unique: false,
    }
  }

  const options = blueprint.fieldOptions ?? {}
  const alias: FieldDefinition = {
    field: blueprint.field,
    type: 'alias',
    schema: null,
    meta: {
      interface: options.interface ?? 'files',
      options: {
        template: null,
        ...(options.options ?? {}),
        ...(blueprint.allowedMimeTypes ? { allowedMimeTypes: [...blueprint.allowedMimeTypes] } : {}),
      },
      display: options.display ?? 'related-values',
      display_options: {
        template: `{{${targetField}.$thumbnail}}{{${targetField}.title}}`,
        ...(options.displayOptions ?? {}),
      },
      special: ['files'],
      note: options.note ?? null,
      hidden: options.hidden ?? false,
      readonly: options.readonly ?? false,
      required: false,
      ...(options.order !== undefined ? { sort: options.order } : {}),
      width: options.width ?? 'full',
      translations: options.label ? [{ language: 'zh-CN', translation: options.label }] : [{ language: 'en-US', translation: blueprint.field }],
    },
  }
  const source = hiddenJunctionRelationField(junctionCollection, sourceField, blueprint.collection, onDelete)
  const target = hiddenJunctionRelationField(junctionCollection, targetField, 'directus_files', onDelete)
  source.relation.meta = {
    ...source.relation.meta,
    one_field: blueprint.field,
    junction_field: targetField,
    ...(sortField ? { sort_field: sortField } : {}),
    ...blueprint.meta,
  }
  target.relation.meta = { ...target.relation.meta, junction_field: sourceField }
  const sort = sortField ? field.integer(sortField, { hidden: true }) : null
  if (sort) {
    sort.meta = {
      ...sort.meta,
      interface: null,
      width: 'full',
    }
  }

  return {
    collections: [generated],
    fields: [
      ...generated.fields.map((item) => ({ ...item, collection: junctionCollection })),
      { ...alias, collection: blueprint.collection },
      source.field,
      target.field,
      ...(sort && sortField ? [{ ...sort, collection: junctionCollection }] : []),
    ],
    relations: [source.relation, target.relation],
  }
}

function expandTranslations(blueprint: Extract<RelationBlueprint, { type: 'translations' }>): ExpandedRelationBlueprint {
  const relatedCollection = blueprint.translationsCollection ?? `${blueprint.collection}_translations`
  const languageCollection = blueprint.languagesCollection ?? 'languages'
  const junction = { ...blueprint.junction, collection: relatedCollection, targetField: blueprint.languageField ?? blueprint.junction?.targetField ?? 'languages_id' }
  const expanded = expandJunction(compact({
    kind: 'relation-blueprint', type: 'm2m', collection: blueprint.collection, field: blueprint.field,
    relatedCollection: languageCollection, junction, fieldOptions: blueprint.fieldOptions, meta: blueprint.meta,
  }) as JunctionRelationBlueprint)
  const alias = expanded.fields.find((item) => item.collection === blueprint.collection && item.field === blueprint.field)
  if (alias) alias.meta = { ...alias.meta, interface: blueprint.fieldOptions?.interface ?? 'translations', special: ['translations'] }
  return expanded
}

function expandM2A(blueprint: Extract<RelationBlueprint, { type: 'm2a' }>): ExpandedRelationBlueprint {
  const junction = blueprint.junction ?? {}
  const junctionCollection = junction.collection ?? `${blueprint.collection}_${blueprint.field}`
  const sourceField = junction.sourceField ?? `${blueprint.collection}_id`
  const itemField = junction.targetField ?? 'item'
  const collectionField = blueprint.collectionField ?? 'collection'
  const sortField = junction.sortField === false ? null : junction.sortField ?? 'sort'
  const generated = collection({ name: junctionCollection, label: junctionCollection, primaryKey: junction.primaryKey ?? 'uuid' })
  hideGeneratedJunction(generated, blueprint.collection)
  const source = relationField(junctionCollection, sourceField, blueprint.collection, junction.onDelete ?? 'CASCADE')
  source.relation.meta = {
    ...source.relation.meta, one_field: blueprint.field, junction_field: itemField,
    ...(sortField ? { sort_field: sortField } : {}), ...blueprint.meta,
  }
  const alias = aliasField(blueprint.field, blueprint.fieldOptions, 'list-m2a', ['m2a'])
  const discriminator = field.string(collectionField, { required: true, hidden: true })
  const item = field.string(itemField, { required: true, interface: 'select-dropdown-m2o', special: ['m2o'] })
  const polymorphic: RelationDefinition = {
    collection: junctionCollection, field: itemField, related_collection: null, schema: null,
    meta: {
      many_collection: junctionCollection, many_field: itemField, one_collection: null, one_field: null,
      one_collection_field: collectionField, one_allowed_collections: [...blueprint.allowedCollections],
      junction_field: sourceField, one_deselect_action: 'nullify',
    },
  }
  return {
    collections: [generated],
    fields: [
      ...generated.fields.map((value) => ({ ...value, collection: junctionCollection })),
      { ...alias, collection: blueprint.collection }, source.field,
      { ...discriminator, collection: junctionCollection }, { ...item, collection: junctionCollection },
      ...(sortField ? [{ ...field.integer(sortField, { hidden: true }), collection: junctionCollection }] : []),
    ],
    relations: [source.relation, polymorphic],
  }
}

function aliasField(name: string, options: RelationFieldOptions = {}, interfaceName: string, special: string[]): FieldDefinition {
  return {
    field: name, type: 'alias', schema: null,
    meta: compact({
      interface: options.interface ?? interfaceName, options: options.options,
      display: options.display, display_options: options.displayOptions,
      special, note: options.note, hidden: options.hidden ?? false, readonly: options.readonly ?? false,
      required: false, sort: options.order, width: options.width ?? 'full',
      translations: options.label ? [{ language: 'zh-CN', translation: options.label }] : [{ language: 'en-US', translation: name }],
    }) as FieldDefinition['meta'],
  }
}

function hideGeneratedJunction(collectionDefinition: CollectionDefinition, parentCollection: string): void {
  collectionDefinition.meta = {
    ...collectionDefinition.meta,
    accountability: 'all',
    archive_app_filter: true,
    hidden: true,
    icon: 'import_export',
    group: parentCollection,
    translations: null,
  }
}

function relationField(collectionName: string, name: string, relatedCollection: string, onDelete: 'NO ACTION' | 'CASCADE' | 'SET NULL' | 'SET DEFAULT' | 'RESTRICT'): {
  field: FieldDefinition & { collection: string }
  relation: RelationDefinition
} {
  const definition = field.m2o(name, { collection: relatedCollection, onDelete })
  const { relation: _legacy, ...plain } = definition
  return {
    field: { ...plain, collection: collectionName },
    relation: {
      collection: collectionName, field: name, related_collection: relatedCollection, schema: { on_delete: onDelete },
      meta: { many_collection: collectionName, many_field: name, one_collection: relatedCollection, one_field: null, one_deselect_action: onDelete === 'CASCADE' ? 'delete' as const : 'nullify' as const },
    },
  }
}

function hiddenJunctionRelationField(collectionName: string, name: string, relatedCollection: string, onDelete: 'NO ACTION' | 'CASCADE' | 'SET NULL' | 'SET DEFAULT' | 'RESTRICT'): {
  field: FieldDefinition & { collection: string }
  relation: RelationDefinition
} {
  const result = relationField(collectionName, name, relatedCollection, onDelete)
  result.field.meta = {
    ...result.field.meta,
    interface: null,
    display: null,
    display_options: null,
    special: null,
    hidden: true,
    width: 'full',
  }
  return result
}

function toFieldOptions(options: RelationFieldOptions) {
  return {
    ...(options.label ? { label: options.label } : {}), ...(options.order !== undefined ? { order: options.order } : {}),
    ...(options.width ? { width: options.width } : {}), ...(options.required !== undefined ? { required: options.required } : {}),
    ...(options.hidden !== undefined ? { hidden: options.hidden } : {}), ...(options.readonly !== undefined ? { readonly: options.readonly } : {}),
    ...(options.note !== undefined ? { note: options.note } : {}), ...(options.interface !== undefined ? { interface: options.interface } : {}),
    ...(options.options !== undefined ? { options: options.options } : {}), ...(options.display !== undefined ? { display: options.display } : {}),
    ...(options.displayOptions !== undefined ? { displayOptions: options.displayOptions } : {}),
    ...(options.displayTemplate ? { displayTemplate: options.displayTemplate } : {}),
  }
}

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('关系 blueprint 展开失败')
  return value
}

function compact<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T
}
