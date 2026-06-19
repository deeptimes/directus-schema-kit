export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }

export interface EnvReference {
  $env: string
}

export interface ResourceReference {
  $ref: string
}

export type DeclarativeValue = JsonPrimitive | EnvReference | ResourceReference | DeclarativeValue[] | { [key: string]: DeclarativeValue }

export type PrimaryKeyType = 'uuid' | 'integer'
export type FieldType = 'string' | 'text' | 'integer' | 'bigInteger' | 'float' | 'decimal' | 'boolean' | 'date' | 'dateTime' | 'uuid' | 'json' | 'alias'
export type FieldWidth = 'full' | 'half' | 'half-left' | 'half-right' | 'fill'
export type OnDelete = 'NO ACTION' | 'CASCADE' | 'SET NULL' | 'SET DEFAULT' | 'RESTRICT'

export interface Translation {
  language: string
  translation: string
}

export interface FieldMeta {
  interface?: string | null
  options?: Record<string, DeclarativeValue> | null
  display?: string | null
  display_options?: Record<string, DeclarativeValue> | null
  special?: string[] | null
  note?: string | null
  hidden?: boolean
  readonly?: boolean
  required?: boolean
  sort?: number | null
  width?: FieldWidth
  translations?: Translation[]
}

export interface FieldSchema {
  default_value?: DeclarativeValue
  is_nullable?: boolean
  is_unique?: boolean
  is_primary_key?: boolean
  has_auto_increment?: boolean
  max_length?: number | null
  numeric_precision?: number | null
  numeric_scale?: number | null
}

export interface RelationDefinition {
  collection: string
  field: string
  related_collection: string
  schema: {
    on_delete?: OnDelete
  }
  meta?: Record<string, DeclarativeValue>
  module?: string
}

export interface FieldDefinition {
  field: string
  type: FieldType
  meta: FieldMeta
  schema: FieldSchema | null
  relation?: Omit<RelationDefinition, 'collection' | 'field' | 'module'>
}

export interface CollectionOptions {
  name: string
  label: string
  icon?: string
  note?: string | null
  displayTemplate?: string | null
  group?: string | null
  order?: number | null
  primaryKey?: PrimaryKeyType
  archive?: boolean
  defaultStatus?: string
  accountability?: 'all' | 'activity' | null
  fields?: FieldDefinition[]
}

export interface CollectionDefinition {
  collection: string
  meta: Record<string, DeclarativeValue>
  schema: Record<string, DeclarativeValue> | null
  fields: FieldDefinition[]
  module?: string
}

export interface CollectionGroupDefinition extends CollectionDefinition {
  schema: null
}

export type ResourceType = 'folders' | 'roles' | 'policies' | 'access' | 'permissions' | 'flows' | 'dashboards' | 'presets'

export interface ResourceDefinition {
  type: ResourceType
  key: string
  data: Record<string, DeclarativeValue>
  module?: string
  delete?: boolean
}

export interface ModuleDefinition {
  id: string
  version?: string
  dependsOn?: string[]
  collections?: CollectionDefinition[]
  groups?: CollectionGroupDefinition[]
  resources?: ResourceDefinition[]
  cleanupCollections?: string[]
}

export interface ManifestModule {
  id: string
  version?: string
  dependsOn: string[]
  cleanupCollections: string[]
  sources: string[]
}

export interface Manifest {
  manifestVersion: 1
  generator: { name: string; version: string }
  source: { algorithm: 'sha256'; digest: string; files: string[] }
  modules: ManifestModule[]
  collections: CollectionDefinition[]
  fields: Array<FieldDefinition & { collection: string; module: string }>
  relations: RelationDefinition[]
  resources: Record<ResourceType, ResourceDefinition[]>
}

export interface DskConfig {
  schemaVersion: 1
  paths: {
    schemaSource: string
    resourceSource: string
    seeds: string
    manifest: string
  }
  env?: {
    file?: string
    allowedVariables?: string[]
  }
  validation?: {
    requireChineseTranslations?: boolean
  }
  safety?: {
    clearEnabled?: boolean
  }
}

export type PlanAction = 'create' | 'update' | 'unchanged' | 'conflict' | 'dangerous'
export type PlanRisk = 'none' | 'low' | 'medium' | 'high'
export type PlanResourceType = 'collection' | 'field' | 'relation'

export interface PlanChange {
  path: string
  current: unknown
  target: unknown
}

export interface PlanOperation {
  module: string
  resourceType: PlanResourceType
  resource: string
  action: PlanAction
  risk: PlanRisk
  executable: boolean
  changes: PlanChange[]
  reason?: string
}

export interface Plan {
  planVersion: 1
  manifestDigest: string
  target: { url: string }
  operations: PlanOperation[]
  summary: Record<PlanAction, number>
}

export interface DirectusState {
  collections: Array<Record<string, unknown> & { collection: string }>
  fields: Array<Record<string, unknown> & { collection: string; field: string; type: string }>
  relations: Array<Record<string, unknown> & { collection: string; field: string; related_collection: string }>
}

export interface ApplyItem {
  resourceType: PlanResourceType
  resource: string
  action: 'create' | 'update'
  detail?: string
}

export interface ApplyFailure extends ApplyItem {
  message: string
}

export interface ApplyResult {
  applyVersion: 1
  manifestDigest: string
  dryRun: boolean
  status: 'success' | 'blocked' | 'failed'
  completed: ApplyItem[]
  failed: ApplyFailure | null
  notExecuted: ApplyItem[]
  blocked: PlanOperation[]
  skippedUnchanged: number
}

export interface SeedReferenceDefinition {
  collection: string
  field?: string
  from?: string
  scope?: string[]
  nullable?: boolean
  keepSource?: boolean
}

export interface SeedBatch {
  schemaVersion: 1
  collection: string
  upsertBy: string[]
  defaults?: Record<string, unknown>
  refs?: Record<string, SeedReferenceDefinition>
  items: Array<Record<string, unknown>>
  file: string
}

export interface SeedOperation {
  collection: string
  key: string
  action: 'create' | 'update' | 'unchanged'
  data: Record<string, unknown>
  id?: string | number
}

export interface SeedResult {
  seedVersion: 1
  mode: 'dry-run' | 'plan' | 'apply'
  status: 'success' | 'failed'
  batches: number
  items: number
  summary: { create: number; update: number; unchanged: number }
  operations: SeedOperation[]
  failure?: { collection: string; key: string; message: string }
}

export interface ResourceSyncOperation {
  type: ResourceType
  key: string
  action: 'create' | 'update' | 'unchanged' | 'delete' | 'conflict'
  dangerous: boolean
  id?: string | number
  reason?: string
}

export interface ResourceSyncResult {
  resourceSyncVersion: 1
  dryRun: boolean
  status: 'success' | 'blocked' | 'failed'
  operations: ResourceSyncOperation[]
  completed: ResourceSyncOperation[]
  failure?: { type: ResourceType; key: string; message: string }
}

export interface ClearOperation {
  resourceType: 'field' | 'collection'
  resource: string
}

export interface ClearResult {
  clearVersion: 1
  module: string
  dryRun: boolean
  status: 'planned' | 'success' | 'blocked' | 'failed'
  operations: ClearOperation[]
  completed: ClearOperation[]
  failures: Array<ClearOperation & { message: string }>
  reason?: string
}
