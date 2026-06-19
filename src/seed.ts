import { readFileSync } from 'node:fs'
import path from 'node:path'
import { Ajv } from 'ajv'
import { glob } from 'tinyglobby'
import { formatAjvErrors } from './config.js'
import { DskError } from './errors.js'
import { seedJsonSchema } from './schemas.js'
import type { SeedBatch, SeedOperation, SeedResult } from './types.js'

export interface SeedReader {
  listItems(collection: string, options?: { fields?: string[]; limit?: number; offset?: number; filter?: Record<string, unknown> }): Promise<Array<Record<string, unknown>>>
}

export interface SeedWriter {
  createItem(collection: string, data: Record<string, unknown>): Promise<Record<string, unknown>>
  updateItem(collection: string, id: string | number, data: Record<string, unknown>): Promise<Record<string, unknown>>
}

export async function loadSeedBatches(pattern: string, baseDirectory: string): Promise<SeedBatch[]> {
  const files = await glob(pattern, { cwd: baseDirectory, absolute: true, onlyFiles: true })
  const ajv = new Ajv({ allErrors: true, strict: false })
  const validate = ajv.compile(seedJsonSchema)
  const batches: SeedBatch[] = []
  const errors: string[] = []
  for (const file of files.sort((a, b) => a.localeCompare(b, 'en'))) {
    try {
      const value: unknown = JSON.parse(readFileSync(file, 'utf8'))
      if (!validate(value)) {
        errors.push(...formatAjvErrors(validate.errors).map((item) => `${file}${item}`))
        continue
      }
      const batch = { ...(value as Omit<SeedBatch, 'file'>), file: normalizePath(path.relative(baseDirectory, file)) }
      errors.push(...validateBatch(batch))
      batches.push(batch)
    } catch (error) {
      errors.push(`${file}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  if (errors.length) throw new DskError('Seed 校验失败', 'VALIDATION_ERROR', errors)
  return batches
}

export function validateBatch(batch: SeedBatch): string[] {
  const errors: string[] = []
  batch.items.forEach((item, index) => {
    for (const field of batch.upsertBy) {
      const value = item[field] ?? batch.defaults?.[field]
      if (value === undefined || value === null) errors.push(`${batch.file}/items/${index}: 缺少自然键 ${field}`)
    }
    for (const [target, reference] of Object.entries(batch.refs ?? {})) {
      const source = reference.from ?? target
      const value = item[source] ?? batch.defaults?.[source]
      if (value === null && !reference.nullable) errors.push(`${batch.file}/items/${index}: 引用 ${target} 不允许 null`)
      for (const scope of reference.scope ?? []) {
        if ((item[scope] ?? batch.defaults?.[scope]) === undefined) errors.push(`${batch.file}/items/${index}: 引用 ${target} 缺少 scope ${scope}`)
      }
    }
  })
  return errors
}

export async function runSeeds(options: {
  batches: SeedBatch[]
  mode: 'dry-run' | 'plan' | 'apply'
  reader?: SeedReader
  writer?: SeedWriter
}): Promise<SeedResult> {
  const summary = { create: 0, update: 0, unchanged: 0 }
  const operations: SeedOperation[] = []
  const total = options.batches.reduce((count, batch) => count + batch.items.length, 0)
  if (options.mode === 'dry-run') return { seedVersion: 1, mode: 'dry-run', status: 'success', batches: options.batches.length, items: total, summary, operations }
  if (!options.reader) throw new DskError('Seed plan 缺少 reader', 'CONFIG_ERROR')
  if (options.mode === 'apply' && !options.writer) throw new DskError('Seed apply 缺少 writer', 'CONFIG_ERROR')

  const cache = new Map<string, Record<string, unknown> | null>()
  for (const batch of options.batches) {
    const existing = await loadAll(options.reader, batch.collection)
    const index = new Map(existing.map((item) => [itemKey(batch.upsertBy, item), item]))
    for (const source of batch.items) {
      const initial = { ...(batch.defaults ?? {}), ...source }
      const key = itemKey(batch.upsertBy, initial)
      try {
        const data = await resolveReferences(batch, initial, options.reader, cache)
        const current = index.get(key)
        const action = !current ? 'create' : hasChanges(current, data) ? 'update' : 'unchanged'
        const operation: SeedOperation = { collection: batch.collection, key, action, data, ...(current?.id !== undefined ? { id: current.id as string | number } : {}) }
        operations.push(operation)
        summary[action]++
        if (options.mode === 'apply' && action !== 'unchanged') {
          const saved = action === 'create'
            ? await options.writer!.createItem(batch.collection, data)
            : await options.writer!.updateItem(batch.collection, operation.id!, data)
          const registered = { ...data, id: saved.id ?? operation.id }
          index.set(key, registered)
          registerCache(batch.collection, registered, cache)
        } else if (current) registerCache(batch.collection, current, cache)
      } catch (error) {
        return {
          seedVersion: 1, mode: options.mode, status: 'failed', batches: options.batches.length, items: total, summary, operations,
          failure: { collection: batch.collection, key, message: error instanceof Error ? error.message : String(error) },
        }
      }
    }
  }
  return { seedVersion: 1, mode: options.mode, status: 'success', batches: options.batches.length, items: total, summary, operations }
}

async function resolveReferences(batch: SeedBatch, source: Record<string, unknown>, reader: SeedReader, cache: Map<string, Record<string, unknown> | null>): Promise<Record<string, unknown>> {
  const result = { ...source }
  for (const [target, reference] of Object.entries(batch.refs ?? {})) {
    const from = reference.from ?? target
    const value = result[from]
    if (value === undefined || value === '') continue
    if (from !== target && !reference.keepSource) delete result[from]
    if (value === null) {
      if (!reference.nullable) throw new Error(`引用 ${batch.collection}.${target} 不允许 null`)
      result[target] = null
      continue
    }
    const filter: Record<string, unknown> = { [reference.field ?? 'slug']: value }
    for (const scope of reference.scope ?? []) filter[scope] = result[scope]
    const cacheKey = lookupKey(reference.collection, filter)
    let found = cache.get(cacheKey)
    if (found === undefined) {
      found = (await reader.listItems(reference.collection, { fields: ['id'], limit: 1, filter }))[0] ?? null
      cache.set(cacheKey, found)
    }
    if (!found?.id) throw new Error(`引用不存在: ${batch.collection}.${target} -> ${reference.collection} ${JSON.stringify(filter)}`)
    result[target] = found.id
  }
  return result
}

async function loadAll(reader: SeedReader, collection: string): Promise<Array<Record<string, unknown>>> {
  const result: Array<Record<string, unknown>> = []
  for (let offset = 0; ; offset += 100) {
    const page = await reader.listItems(collection, { fields: ['*'], limit: 100, offset })
    result.push(...page)
    if (page.length < 100) return result
  }
}

function itemKey(fields: string[], item: Record<string, unknown>): string {
  return fields.map((field) => {
    const value = item[field]
    if (value === undefined || value === null) throw new Error(`缺少自然键 ${field}`)
    return String(value)
  }).join('\u0000')
}

function hasChanges(current: Record<string, unknown>, target: Record<string, unknown>): boolean {
  return Object.entries(target).some(([key, value]) => JSON.stringify(current[key]) !== JSON.stringify(value))
}

function registerCache(collection: string, item: Record<string, unknown>, cache: Map<string, Record<string, unknown> | null>): void {
  for (const [field, value] of Object.entries(item)) {
    if (value !== null && typeof value !== 'object') cache.set(lookupKey(collection, { [field]: value }), item)
  }
}

function lookupKey(collection: string, filter: Record<string, unknown>): string {
  return `${collection}?${Object.entries(filter).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${String(value)}`).join('&')}`
}

function normalizePath(value: string): string {
  return value.split(path.sep).join('/')
}
