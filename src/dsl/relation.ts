import type {
  JunctionOptions, JunctionRelationBlueprint, M2ARelationBlueprint, M2ORelationBlueprint,
  O2MRelationBlueprint, RelationFieldOptions, RelationMeta, TranslationsRelationBlueprint,
} from '../types.js'

interface M2OOptions {
  collection: string
  field: string
  relatedCollection: string
  type?: M2ORelationBlueprint['foreignKeyType']
  onDelete?: M2ORelationBlueprint['onDelete']
  fieldOptions?: RelationFieldOptions
  meta?: RelationMeta
}

interface O2MOptions {
  collection: string
  field: string
  relatedCollection: string
  relatedField: string
  onDelete?: O2MRelationBlueprint['onDelete']
  fieldOptions?: RelationFieldOptions
  meta?: RelationMeta
}

interface M2MOptions {
  collection: string
  field: string
  relatedCollection: string
  junction?: JunctionOptions
  fieldOptions?: RelationFieldOptions
  meta?: RelationMeta
}

interface TranslationsOptions {
  collection: string
  field?: string
  translationsCollection?: string
  languagesCollection?: string
  languageField?: string
  junction?: JunctionOptions
  fieldOptions?: RelationFieldOptions
  meta?: RelationMeta
}

interface M2AOptions {
  collection: string
  field: string
  allowedCollections: string[]
  collectionField?: string
  junction?: JunctionOptions
  fieldOptions?: RelationFieldOptions
  meta?: RelationMeta
}

function m2o(type: M2ORelationBlueprint['type'], options: M2OOptions): M2ORelationBlueprint {
  return compact({
    kind: 'relation-blueprint', type, collection: options.collection, field: options.field,
    relatedCollection: options.relatedCollection, foreignKeyType: options.type,
    onDelete: options.onDelete, fieldOptions: options.fieldOptions, meta: options.meta,
  }) as M2ORelationBlueprint
}

export const relation = {
  m2o(options: M2OOptions): M2ORelationBlueprint { return m2o('m2o', options) },
  file(options: Omit<M2OOptions, 'relatedCollection'>): M2ORelationBlueprint {
    return m2o('file', { ...options, relatedCollection: 'directus_files' })
  },
  image(options: Omit<M2OOptions, 'relatedCollection'>): M2ORelationBlueprint {
    return m2o('image', { ...options, relatedCollection: 'directus_files' })
  },
  o2m(options: O2MOptions): O2MRelationBlueprint {
    return compact({ kind: 'relation-blueprint', type: 'o2m', ...options }) as O2MRelationBlueprint
  },
  m2m(options: M2MOptions): JunctionRelationBlueprint {
    return compact({ kind: 'relation-blueprint', type: 'm2m', ...options }) as JunctionRelationBlueprint
  },
  files(options: Omit<M2MOptions, 'relatedCollection'>): JunctionRelationBlueprint {
    return compact({ kind: 'relation-blueprint', type: 'files', ...options, relatedCollection: 'directus_files' }) as JunctionRelationBlueprint
  },
  translations(options: TranslationsOptions): TranslationsRelationBlueprint {
    return compact({ kind: 'relation-blueprint', type: 'translations', field: 'translations', ...options }) as TranslationsRelationBlueprint
  },
  m2a(options: M2AOptions): M2ARelationBlueprint {
    return compact({ kind: 'relation-blueprint', type: 'm2a', ...options, allowedCollections: [...options.allowedCollections] }) as M2ARelationBlueprint
  },
}

function compact<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T
}
