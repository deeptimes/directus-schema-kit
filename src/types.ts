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
export type FieldType =
  | 'alias' | 'bigInteger' | 'binary' | 'boolean' | 'csv' | 'date' | 'dateTime'
  | 'decimal' | 'float' | 'geometry' | 'geometry.Point' | 'geometry.LineString'
  | 'geometry.Polygon' | 'geometry.MultiPoint' | 'geometry.MultiLineString'
  | 'geometry.MultiPolygon' | 'hash' | 'integer' | 'json' | 'string' | 'text'
  | 'time' | 'timestamp' | 'uuid'
export type FieldWidth = 'full' | 'half' | 'half-left' | 'half-right' | 'fill'
export type OnDelete = 'NO ACTION' | 'CASCADE' | 'SET NULL' | 'SET DEFAULT' | 'RESTRICT'

export interface Translation {
  language: string
  translation: string
}

export interface FieldMeta {
  group?: string | null
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
  conditions?: Array<Record<string, DeclarativeValue>> | null
  validation?: Record<string, DeclarativeValue> | null
  validation_message?: string | null
  searchable?: boolean
  clear_hidden_value_on_save?: boolean
}

export interface FieldSchema {
  name?: string
  table?: string
  data_type?: string
  default_value?: DeclarativeValue
  is_nullable?: boolean
  is_unique?: boolean
  is_primary_key?: boolean
  has_auto_increment?: boolean
  max_length?: number | null
  numeric_precision?: number | null
  numeric_scale?: number | null
  foreign_key_schema?: string | null
  foreign_key_table?: string | null
  foreign_key_column?: string | null
  is_generated?: boolean
  generation_expression?: string | null
}

export interface RelationMeta {
  many_collection?: string
  many_field?: string
  one_collection?: string | null
  one_field?: string | null
  one_collection_field?: string | null
  one_allowed_collections?: string[] | null
  junction_field?: string | null
  sort_field?: string | null
  one_deselect_action?: 'nullify' | 'delete'
  system?: boolean
  [key: string]: DeclarativeValue | undefined
}

export interface RelationSchema {
  constraint_name?: string
  table?: string
  column?: string
  foreign_key_schema?: string | null
  foreign_key_table?: string
  foreign_key_column?: string
  on_delete?: OnDelete
  on_update?: OnDelete
}

export interface RelationDefinition {
  collection: string
  field: string
  related_collection: string | null
  schema: RelationSchema | null
  meta?: RelationMeta
  source?: string
}

export interface FieldDefinition {
  field: string
  type: FieldType
  meta: FieldMeta
  schema: FieldSchema | null
  relation?: Omit<RelationDefinition, 'collection' | 'field' | 'source'>
}

export interface RelationFieldOptions {
  label?: string
  order?: number
  width?: FieldWidth
  required?: boolean
  hidden?: boolean
  readonly?: boolean
  note?: string | null
  interface?: string | null
  options?: Record<string, DeclarativeValue> | null
  display?: string | null
  displayOptions?: Record<string, DeclarativeValue> | null
  displayTemplate?: string
}

export interface JunctionOptions {
  collection?: string
  primaryKey?: PrimaryKeyType
  sourceField?: string
  targetField?: string
  sortField?: string | false
  onDelete?: OnDelete
}

interface RelationBlueprintBase {
  kind: 'relation-blueprint'
  type: 'm2o' | 'o2m' | 'm2m' | 'm2a' | 'translations' | 'file' | 'image' | 'files'
  collection: string
  field: string
  fieldOptions?: RelationFieldOptions
  meta?: RelationMeta
}

export interface M2ORelationBlueprint extends RelationBlueprintBase {
  type: 'm2o'
  relatedCollection: string
  foreignKeyType?: Exclude<FieldType, 'alias'>
  onDelete?: OnDelete
}

export interface FileRelationBlueprint extends RelationBlueprintBase {
  type: 'file' | 'image'
  relatedCollection: 'directus_files'
  foreignKeyType?: Exclude<FieldType, 'alias'>
  onDelete?: OnDelete
  allowedMimeTypes?: string[]
}

export interface O2MRelationBlueprint extends RelationBlueprintBase {
  type: 'o2m'
  relatedCollection: string
  relatedField: string
  onDelete?: OnDelete
}

export interface JunctionRelationBlueprint extends RelationBlueprintBase {
  type: 'm2m'
  relatedCollection: string
  junction?: JunctionOptions
}

export interface FilesRelationBlueprint extends RelationBlueprintBase {
  type: 'files'
  relatedCollection: 'directus_files'
  allowedMimeTypes?: string[]
  junction?: JunctionOptions
}

export interface TranslationsRelationBlueprint extends RelationBlueprintBase {
  type: 'translations'
  translationsCollection?: string
  languagesCollection?: string
  languageField?: string
  junction?: JunctionOptions
}

export interface M2ARelationBlueprint extends RelationBlueprintBase {
  type: 'm2a'
  allowedCollections: string[]
  collectionField?: string
  junction?: JunctionOptions
}

export type RelationBlueprint = M2ORelationBlueprint | FileRelationBlueprint | O2MRelationBlueprint | JunctionRelationBlueprint | FilesRelationBlueprint | TranslationsRelationBlueprint | M2ARelationBlueprint

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
  source?: string
}

export interface CollectionGroupDefinition extends CollectionDefinition {
  schema: null
}

export type ResourceType = 'folders' | 'roles' | 'policies' | 'access' | 'permissions' | 'presets'

export interface ResourceDefinition {
  type: ResourceType
  key: string
  data: Record<string, DeclarativeValue>
  source?: string
  delete?: boolean
}

export interface SchemaDefinition {
  collections?: CollectionDefinition[]
  groups?: CollectionGroupDefinition[]
  relations?: RelationBlueprint[]
  resources?: ResourceDefinition[]
}

export interface Manifest {
  manifestVersion: 3
  generator: { name: string; version: string }
  source: { algorithm: 'sha256'; digest: string; files: string[] }
  collections: CollectionDefinition[]
  fields: Array<FieldDefinition & { collection: string; source: string }>
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
  source: string
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
  relations: Array<Record<string, unknown> & { collection: string; field: string; related_collection: string | null }>
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
  dryRun: boolean
  status: 'planned' | 'success' | 'blocked' | 'failed'
  operations: ClearOperation[]
  completed: ClearOperation[]
  failures: Array<ClearOperation & { message: string }>
  reason?: string
}

export interface DoctorCheck {
  name: string
  status: 'pass' | 'warn' | 'fail'
  message: string
}

export interface DoctorResult {
  doctorVersion: 1
  ok: boolean
  project: {
    root: string
    directusVersion: string
    packageManager: 'pnpm' | 'npm' | 'yarn' | 'bun' | 'unknown'
  }
  environment: {
    file: string
    exists: boolean
    configuredVariables: string[]
    missingVariables: string[]
  }
  workspace: {
    config: string
    manifest: string | null
  }
  checks: DoctorCheck[]
}
