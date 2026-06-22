import { DskError } from './errors.js'
import type { CollectionDefinition, DirectusState, FieldDefinition, RelationDefinition } from './types.js'

interface DirectusResponse<T> { data: T }

export class DirectusReader {
  constructor(
    private readonly url: string,
    private readonly token?: string,
    private readonly timeoutMs = 10_000,
    private readonly fetcher: typeof fetch = globalThis.fetch,
  ) {}

  async readState(): Promise<DirectusState> {
    const [collections, fields, relations] = await Promise.all([
      this.get<DirectusState['collections']>('/collections'),
      this.get<DirectusState['fields']>('/fields'),
      this.get<DirectusState['relations']>('/relations'),
    ])
    return { collections, fields, relations }
  }

  async listItems(collection: string, options: { fields?: string[]; limit?: number; offset?: number; filter?: Record<string, unknown> } = {}): Promise<Array<Record<string, unknown>>> {
    const params = new URLSearchParams()
    params.set('fields', (options.fields ?? ['*']).join(','))
    params.set('limit', String(options.limit ?? 100))
    params.set('offset', String(options.offset ?? 0))
    for (const [field, value] of Object.entries(options.filter ?? {})) {
      if (value === null) params.set(`filter[${field}][_null]`, 'true')
      else params.set(`filter[${field}][_eq]`, String(value))
    }
    return this.get<Array<Record<string, unknown>>>(`/items/${encodeURIComponent(collection)}?${params}`)
  }

  async listSystemResource(endpoint: string): Promise<Array<Record<string, unknown>>> {
    return this.get<Array<Record<string, unknown>>>(`/${endpoint}?limit=-1`)
  }

  private async get<T>(pathname: string): Promise<T> {
    let response: Response
    try {
      response = await this.fetcher(`${this.url}${pathname}`, {
        method: 'GET',
        headers: this.token ? { Authorization: `Bearer ${this.token}` } : {},
        signal: AbortSignal.timeout(this.timeoutMs),
      })
    } catch (error) {
      throw new DskError(`读取 Directus ${pathname} 失败`, 'CONNECTION_ERROR', [error instanceof Error ? error.message : String(error)])
    }
    if (!response.ok) {
      const message = await safeResponseMessage(response)
      throw new DskError(`读取 Directus ${pathname} 失败: HTTP ${response.status}`, 'CONNECTION_ERROR', message ? [message] : [])
    }
    const payload = await response.json() as DirectusResponse<T>
    if (!payload || !Array.isArray(payload.data)) throw new DskError(`Directus ${pathname} 返回了无效数据`, 'CONNECTION_ERROR')
    return payload.data
  }
}

export class DirectusWriter {
  constructor(
    private readonly url: string,
    private readonly token?: string,
    private readonly timeoutMs = 15_000,
    private readonly maxAttempts = 3,
    private readonly fetcher: typeof fetch = globalThis.fetch,
    private readonly sleeper: (milliseconds: number) => Promise<void> = sleep,
  ) {}

  createCollection(definition: CollectionDefinition, primaryField?: FieldDefinition): Promise<void> {
    return this.request('/collections', 'POST', {
      collection: definition.collection,
      meta: definition.meta,
      schema: definition.schema,
      fields: primaryField ? [stripField(primaryField)] : [],
    })
  }

  updateCollection(collection: string, meta: Record<string, unknown>): Promise<void> {
    return this.request(`/collections/${encodeURIComponent(collection)}`, 'PATCH', { meta })
  }

  createField(collection: string, definition: FieldDefinition): Promise<void> {
    return this.request(`/fields/${encodeURIComponent(collection)}`, 'POST', stripField(definition))
  }

  updateField(collection: string, field: string, patch: { meta?: Record<string, unknown>; schema?: Record<string, unknown> }): Promise<void> {
    return this.request(`/fields/${encodeURIComponent(collection)}/${encodeURIComponent(field)}`, 'PATCH', patch)
  }

  createRelation(definition: RelationDefinition): Promise<void> {
    const { source: _source, ...payload } = definition
    return this.request('/relations', 'POST', payload)
  }

  updateRelation(collection: string, field: string, patch: { meta?: Record<string, unknown> }): Promise<void> {
    return this.request(`/relations/${encodeURIComponent(collection)}/${encodeURIComponent(field)}`, 'PATCH', patch)
  }

  createItem(collection: string, data: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>(`/items/${encodeURIComponent(collection)}`, 'POST', data)
  }

  updateItem(collection: string, id: string | number, data: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>(`/items/${encodeURIComponent(collection)}/${encodeURIComponent(String(id))}`, 'PATCH', data)
  }

  createSystemResource(endpoint: string, data: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>(`/${endpoint}`, 'POST', data)
  }

  updateSystemResource(endpoint: string, id: string | number, data: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>(`/${endpoint}/${encodeURIComponent(String(id))}`, 'PATCH', data)
  }

  deleteSystemResource(endpoint: string, id: string | number): Promise<void> {
    return this.request<void>(`/${endpoint}/${encodeURIComponent(String(id))}`, 'DELETE')
  }

  deleteField(collection: string, field: string): Promise<void> {
    return this.request<void>(`/fields/${encodeURIComponent(collection)}/${encodeURIComponent(field)}`, 'DELETE')
  }

  deleteCollection(collection: string): Promise<void> {
    return this.request<void>(`/collections/${encodeURIComponent(collection)}`, 'DELETE')
  }

  private async request<T = void>(pathname: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown): Promise<T> {
    let lastError: unknown
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      try {
        const response = await this.fetcher(`${this.url}${pathname}`, {
          method,
          headers: { 'Content-Type': 'application/json', ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}) },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          signal: AbortSignal.timeout(this.timeoutMs),
        })
        if (response.ok) {
          if (response.status === 204) return undefined as T
          const payload = await response.json() as { data: T }
          return payload.data
        }
        const message = await safeResponseMessage(response)
        const error = new Error(`${method} ${pathname}: HTTP ${response.status}${message ? ` - ${redact(message, this.token)}` : ''}`)
        if (method === 'DELETE' || !isRetryableStatus(response.status) || attempt === this.maxAttempts) throw error
        await this.sleeper(retryDelay(response, attempt))
      } catch (error) {
        lastError = error
        if (!isRetryableNetworkError(error) || attempt === this.maxAttempts) {
          throw new DskError(`写入 Directus 失败: ${method} ${pathname}`, 'CONNECTION_ERROR', [redact(error instanceof Error ? error.message : String(error), this.token)])
        }
        await this.sleeper(250 * 2 ** (attempt - 1))
      }
    }
    throw new DskError(`写入 Directus 失败: ${method} ${pathname}`, 'CONNECTION_ERROR', [redact(String(lastError), this.token)])
  }
}

async function safeResponseMessage(response: Response): Promise<string | null> {
  try {
    const payload = await response.json() as { errors?: Array<{ message?: string }> }
    return payload.errors?.[0]?.message?.slice(0, 300) ?? null
  } catch {
    return null
  }
}

function stripField(definition: FieldDefinition): Record<string, unknown> {
  return { field: definition.field, type: definition.type, meta: definition.meta, schema: definition.schema }
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504
}

function isRetryableNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return error.name === 'AbortError' || error.name === 'TimeoutError' || error instanceof TypeError
}

function retryDelay(response: Response, attempt: number): number {
  const header = response.headers.get('retry-after')
  const retryAfter = header === null ? Number.NaN : Number(header)
  if (Number.isFinite(retryAfter) && retryAfter >= 0) return Math.min(5_000, Math.ceil(retryAfter * 1_000))
  return 250 * 2 ** (attempt - 1)
}

function redact(value: string, token?: string): string {
  return token ? value.split(token).join('[REDACTED]') : value
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}
