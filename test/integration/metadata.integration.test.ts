import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createServer } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import test from 'node:test'
import { executeApply } from '../../src/apply.js'
import { defaultConfig } from '../../src/config.js'
import { DirectusReader, DirectusWriter } from '../../src/directus.js'
import { collection, field, resource } from '../../src/index.js'
import { createPlan } from '../../src/plan.js'
import { syncResources } from '../../src/resources.js'
import { validateManifest } from '../../src/validate.js'
import type { FieldCondition, Manifest } from '../../src/types.js'

const project = process.env.DSK_METADATA_PROJECT

test('隔离 Directus：Translation Strings 和字段条件的官方 API 生命周期', { skip: !project, timeout: 120_000 }, async (t) => {
  const require = createRequire(path.resolve(project!, 'package.json'))
  const packagePath = require.resolve('directus/package.json')
  const cli = path.join(path.dirname(packagePath), 'cli.js')
  const directory = mkdtempSync(path.join(os.tmpdir(), 'dsk-metadata-'))
  const socket = createServer().listen(0, '127.0.0.1')
  await once(socket, 'listening')
  const port = (socket.address() as { port: number }).port
  await new Promise<void>((resolve) => socket.close(() => resolve()))
  const url = `http://127.0.0.1:${port}`
  const environment = {
    ...process.env, DB_CLIENT: 'sqlite3', DB_FILENAME: path.join(directory, 'data.db'),
    SECRET: 'dsk-metadata-isolated-secret-at-least-32-characters',
    ADMIN_EMAIL: 'metadata@example.com', ADMIN_PASSWORD: 'dsk-metadata-test-password',
    HOST: '127.0.0.1', PORT: String(port), PUBLIC_URL: url,
    STORAGE_LOCATIONS: 'local', STORAGE_LOCAL_DRIVER: 'local', STORAGE_LOCAL_ROOT: path.join(directory, 'uploads'),
    TELEMETRY: 'false', LOG_LEVEL: 'error', CACHE_ENABLED: 'false', EXTENSIONS_PATH: path.join(directory, 'extensions'),
    QUERY_LIMIT_DEFAULT: '2', // 翻译读取不能依赖实例默认返回条数。
  }
  let server: ReturnType<typeof spawn> | undefined
  let output = ''
  try {
    execFileSync(process.execPath, [cli, 'bootstrap'], { cwd: directory, env: environment, stdio: 'pipe', timeout: 60_000 })
    server = spawn(process.execPath, [cli, 'start'], { cwd: directory, env: environment, stdio: ['ignore', 'pipe', 'pipe'] })
    server.stderr?.on('data', (data: Buffer) => { output += data.toString() })
    server.stdout?.on('data', (data: Buffer) => { output += data.toString() })
    for (let attempt = 0; attempt < 200; attempt++) {
      if (server.exitCode !== null) throw new Error(`Directus 启动失败: ${output.slice(-1000)}`)
      try { if ((await fetch(`${url}/server/ping`, { signal: AbortSignal.timeout(500) })).ok) break } catch { /* 等待隔离实例。 */ }
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
    const login = await fetch(`${url}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: environment.ADMIN_EMAIL, password: environment.ADMIN_PASSWORD }) })
    assert.equal(login.ok, true)
    const token = ((await login.json()) as { data: { access_token: string } }).data.access_token
    const methods: string[] = []
    const fetcher: typeof fetch = async (input, init) => { methods.push(init?.method ?? 'GET'); return fetch(input, init) }
    const reader = new DirectusReader(url, token, 20_000, fetcher)
    const writer = new DirectusWriter(url, token, 20_000, 1, fetcher)
    const info = await reader.readObject('server/info')
    t.diagnostic(`Directus ${String(info.version)} + SQLite：独立临时实例`)
    const model = collection({ name: 'article_contexts', label: '文章调用条件', fields: [
      field.string('type', { interface: 'select-dropdown', options: { choices: [
        { value: 'object', text: '$t:dsk.metadata.object' }, { value: 'sign', text: '$t:dsk.metadata.sign' },
        { value: 'aspect', text: 'Aspect' },
      ] } }),
      ...['object', 'other_object', 'sign', 'house', 'aspect'].map((name) => name === 'house'
        ? field.integer(name, { interface: 'select-dropdown', options: { choices: [{ value: 1, text: '$t:dsk.metadata.object' }] } })
        : field.string(name)),
    ] })
    const manifest: Manifest = {
      manifestVersion: 1, generator: { name: 'test', version: '1' }, source: { algorithm: 'sha256', digest: 'a'.repeat(64), files: [] },
      collections: [{ ...model, fields: [], source: 'content.ts' }],
      fields: model.fields.map((item) => ({ ...item, collection: model.collection, source: 'content.ts' })), relations: [],
      resources: { folders: [], roles: [], policies: [], access: [], permissions: [], presets: [], translations: [] },
    }
    assert.equal((await executeApply({ manifest, plan: createPlan(manifest, await reader.readState(), url), writer })).status, 'success')
    const record = await writer.createItem('article_contexts', { type: 'aspect', object: 'sun', other_object: 'moon', aspect: 'square' })
    const before = await reader.readState()
    const typesByField: Record<string, string[]> = {
      object: ['object', 'object_sign', 'object_house', 'aspect'], other_object: ['aspect'],
      sign: ['sign', 'object_sign', 'house_sign'], house: ['house', 'object_house', 'house_sign'], aspect: ['aspect'],
    }
    for (const target of manifest.fields.filter((item) => Object.hasOwn(typesByField, item.field))) {
      const conditions: FieldCondition[] = [
        { name: '适用类型显示并必填', rule: { type: { _in: typesByField[target.field]! } }, hidden: false, required: true, options: {} },
        { name: '其他类型隐藏并清空', rule: { type: { _nin: typesByField[target.field]! } }, hidden: true, required: false, clear_hidden_value_on_save: true, options: {} },
      ]
      Object.assign(target.meta, { hidden: true, required: false, conditions })
    }
    assert.deepEqual(validateManifest(manifest, defaultConfig), [])
    const plan = createPlan(manifest, before, url)
    assert.equal(plan.summary.update, 5)
    assert.equal(plan.summary.conflict + plan.summary.dangerous, 0)
    methods.length = 0
    await executeApply({ manifest, plan, writer, dryRun: true })
    assert.deepEqual(methods, [])
    assert.equal((await executeApply({ manifest, plan, writer })).status, 'success')
    assert.equal(methods.every((method) => method === 'PATCH'), true)
    const after = await reader.readState()
    assert.equal(createPlan(manifest, after, url).summary.update, 0)
    for (const current of after.fields.filter((item) => item.collection === model.collection)) {
      assert.deepEqual(current.schema, before.fields.find((item) => item.collection === model.collection && item.field === current.field)?.schema)
    }
    // API 不会执行 Studio 隐藏清空；更新元数据也不会修改已有业务记录。
    assert.deepEqual((await reader.listItems('article_contexts'))[0], record)
    const object = manifest.fields.find((item) => item.field === 'object')!
    object.meta.conditions!.reverse()
    assert.equal((await executeApply({ manifest, plan: createPlan(manifest, after, url), writer })).status, 'success')
    const reordered = (await reader.readState()).fields.find((item) => item.collection === model.collection && item.field === 'object')!
    assert.deepEqual((reordered.meta as Record<string, unknown>).conditions, object.meta.conditions)
    for (const empty of [null, []]) {
      object.meta.conditions = empty
      assert.equal((await executeApply({ manifest, plan: createPlan(manifest, await reader.readState(), url), writer })).status, 'success')
      assert.equal(createPlan(manifest, await reader.readState(), url).summary.update, 0)
    }

    const bulk = await fetch(`${url}/translations`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(Array.from({ length: 101 }, (_, index) => ({ key: `unmanaged.${index}`, language: 'en-US', value: 'keep' }))),
    })
    assert.equal(bulk.ok, true)
    const existing = await writer.createSystemResource('translations', { key: 'dsk.metadata.object', language: 'zh-CN', value: '旧值' })
    await writer.createSystemResource('translations', { key: 'unmanaged', language: 'en-US', value: 'keep' })
    manifest.resources.translations = [
      resource('translations', { key: 'object-zh', data: { key: 'dsk.metadata.object', language: 'zh-CN', value: '对象 ☀️\n第二行' } }),
      resource('translations', { key: 'object-en', data: { key: 'dsk.metadata.object', language: 'en-US', value: 'Object' } }),
      resource('translations', { key: 'sign-zh', data: { key: 'dsk.metadata.sign', language: 'zh-CN', value: '星座' } }),
      resource('translations', { key: 'sign-en', data: { key: 'dsk.metadata.sign', language: 'en-US', value: '' } }),
    ]
    methods.length = 0
    const preview = await syncResources({ definitions: manifest.resources, reader, writer, dryRun: true })
    assert.equal(preview.status, 'success')
    assert.equal(preview.operations[0]?.action, 'update')
    assert.equal(preview.operations[0]?.id, existing.id)
    assert.equal(methods.every((method) => method === 'GET'), true)
    const synced = await syncResources({ definitions: manifest.resources, reader, writer })
    assert.equal(synced.status, 'success', JSON.stringify(synced.failure))
    assert.equal((await reader.listSystemResource('translations')).length, 106)
    methods.length = 0
    const repeated = await syncResources({ definitions: manifest.resources, reader, writer })
    assert.equal(repeated.operations.every((item) => item.action === 'unchanged'), true)
    assert.equal(methods.every((method) => method === 'GET'), true)
    // API 自身拒绝重复自然键；脏实例的多条匹配由 MemoryResources 夹具覆盖。
    await assert.rejects(() => writer.createSystemResource('translations', { key: 'dsk.metadata.object', language: 'zh-CN', value: 'duplicate' }), /写入 Directus 失败/)
    manifest.resources.translations = [{ ...manifest.resources.translations[0]!, delete: true }]
    assert.equal((await syncResources({ definitions: manifest.resources, reader, writer })).status, 'blocked')
    assert.equal((await syncResources({ definitions: manifest.resources, reader, writer, confirmDestructive: true })).status, 'success')
    assert.equal((await reader.listSystemResource('translations')).length, 105)
    assert.equal((await syncResources({ definitions: manifest.resources, reader, writer })).operations[0]?.action, 'unchanged')
    const { executeClear } = await import('../../src/clear.js')
    assert.equal((await executeClear({ manifest, state: await reader.readState(), writer, confirm: true })).status, 'success')
    assert.equal((await reader.listSystemResource('translations')).length, 105, 'clear 不删除共享翻译')
    manifest.resources.translations = [resource('translations', {
      key: 'remaining-sign', data: { key: 'dsk.metadata.sign', language: 'zh-CN', value: '星座' },
    })]
    const { readCleanupSnapshot } = await import('../../src/cleanup-reader.js')
    const { executeCleanup } = await import('../../src/cleanup.js')
    for (const mode of ['data', 'full'] as const) {
      const cleanup = await executeCleanup({ mode, manifest, readSnapshot: () => readCleanupSnapshot(reader), writer, confirm: true })
      assert.equal(cleanup.status, 'success', JSON.stringify(cleanup.failure ?? cleanup.blockers))
      assert.equal((await reader.listSystemResource('translations')).length, 105, `${mode} 不扩大翻译删除范围`)
    }
  } finally {
    if (server && server.exitCode === null) {
      const exited = once(server, 'exit')
      server.kill('SIGTERM')
      await exited
    }
    rmSync(directory, { recursive: true, force: true })
  }
})
