import { DskError } from './errors.js'
import type { CollectionDefinition, DirectusState, FieldDefinition, RelationDefinition } from './types.js'

interface DirectusResponse<T> { data: T; meta?: { filter_count?: number } }

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

  async readObject(endpoint: string, fields = '*'): Promise<Record<string, unknown>> {
    const data = await this.getData<unknown>(`/${endpoint}?${new URLSearchParams({ fields })}`)
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new DskError(`Directus ${endpoint} 返回了无效对象`, 'CONNECTION_ERROR')
    return data as Record<string, unknown>
  }

  async listAll(endpoint: string, primaryKey = 'id', fields = '*'): Promise<Array<Record<string, unknown>>> {
    const rows: Array<Record<string, unknown>> = []
    const seen = new Set<string | number>()
    for (;;) {
      const query = new URLSearchParams({ limit: '100', offset: String(rows.length), sort: primaryKey, fields })
      const page = await this.get<Array<Record<string, unknown>>>(`/${endpoint}?${query}`)
      if (!page.length) return rows
      for (const row of page) {
        const id = row[primaryKey]
        if ((typeof id !== 'string' && typeof id !== 'number') || seen.has(id)) throw new DskError(`Directus ${endpoint} 分页不完整或主键重复，拒绝清理`, 'CONNECTION_ERROR')
        seen.add(id)
        rows.push(row)
      }
    }
  }

  async readSingletonItems(collection: string, primaryKey: string, fields: string): Promise<Array<Record<string, unknown>>> {
    const query = new URLSearchParams({ fields, meta: 'filter_count' })
    const payload = await this.getPayload<Record<string, unknown>>(`/items/${encodeURIComponent(collection)}?${query}`)
    if (payload.meta?.filter_count === 0) return []
    const row = payload.data
    if (payload.meta?.filter_count !== 1 || !row || Array.isArray(row) || (typeof row[primaryKey] !== 'string' && typeof row[primaryKey] !== 'number')) {
      throw new DskError(`singleton ${collection} 记录未完整返回，拒绝清理`, 'CONNECTION_ERROR')
    }
    return [row]
  }

  async listStoredPermissions(): Promise<Array<Record<string, unknown>>> {
    // Directus 会附加 system:true 且无主键的虚拟 App 权限；过滤后核对数据库总数，防止许可过滤静默遗漏。
    const params = new URLSearchParams({ limit: '-1', sort: 'id', 'filter[id][_nnull]': 'true', meta: 'filter_count' })
    const payload = await this.getPayload<Array<Record<string, unknown>>>(`/permissions?${params}`)
    const rows = Array.isArray(payload.data) ? payload.data.filter((row) => !(row.system === true && row.id === undefined)) : null
    if (!rows || payload.meta?.filter_count !== rows.length || rows.some((row) => !Number.isInteger(row.id)) || new Set(rows.map((row) => row.id)).size !== rows.length) {
      throw new DskError('权限记录未完整返回，无法安全清理；请检查 Directus 许可或 API 查询限制', 'CONNECTION_ERROR')
    }
    return rows
  }

  async getCustomPermissionRulesEnabled(): Promise<boolean> {
    const info = await this.getData<{ version?: string }>('/server/info')
    if (info.version?.startsWith('11.')) return true
    if (!info.version?.startsWith('12.')) throw new DskError('无法识别 Directus 服务版本', 'CONNECTION_ERROR')
    const license = await this.getData<{
      entitlements?: { custom_permission_rules_enabled?: { default?: boolean; override?: boolean } }
    }>('/license')
    const capability = license.entitlements?.custom_permission_rules_enabled
    const enabled = capability?.override ?? capability?.default
    if (typeof enabled !== 'boolean') throw new DskError('Directus 未返回自定义权限规则许可信息', 'CONNECTION_ERROR')
    return enabled
  }

  private async get<T>(pathname: string): Promise<T> {
    const data = await this.getData<T>(pathname)
    if (!Array.isArray(data)) throw new DskError(`Directus ${pathname} 返回了无效数据`, 'CONNECTION_ERROR')
    return data
  }

  private async getData<T>(pathname: string): Promise<T> {
    return (await this.getPayload<T>(pathname)).data
  }

  private async getPayload<T>(pathname: string): Promise<DirectusResponse<T>> {
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
    if (!payload || payload.data === undefined || payload.data === null) throw new DskError(`Directus ${pathname} 返回了无效数据`, 'CONNECTION_ERROR')
    return payload
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

  deleteItem(collection: string, id: string | number): Promise<void> {
    return this.request<void>(`/items/${encodeURIComponent(collection)}/${encodeURIComponent(String(id))}`, 'DELETE')
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
