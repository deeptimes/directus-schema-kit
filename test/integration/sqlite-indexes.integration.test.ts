import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { collection, field } from '../../src/index.js'
import { createPlan } from '../../src/plan.js'
import type { DirectusState, Manifest } from '../../src/types.js'

// 使用目标 Directus 项目实际安装的 inspector 与 SQLite driver，不向 DSK 添加数据库依赖。
const project = process.env.DSK_SQLITE_PROJECT

test('SQLite 唯一性识别保留条件约束，并阻断真实全局唯一性差异', { skip: !project }, async () => {
  const projectRequire = createRequire(path.resolve(project!, 'package.json'))
  const directusRequire = createRequire(projectRequire.resolve('directus/package.json'))
  const apiRequire = createRequire(directusRequire.resolve('@directus/api'))
  const schemaPath = apiRequire.resolve('@directus/schema')
  const schemaRequire = createRequire(schemaPath)
  const knex = schemaRequire('knex')
  const { createInspector } = await import(pathToFileURL(schemaPath).href)
  const directory = mkdtempSync(path.join(os.tmpdir(), 'dsk-indexes-'))
  const config = { client: 'sqlite3', connection: { filename: path.join(directory, 'test.db') }, useNullAsDefault: true }
  let database = knex(config)
  try {
    await database.raw('CREATE TABLE profiles (id INTEGER PRIMARY KEY AUTOINCREMENT, user_owner INTEGER, is_self INTEGER, global_key INTEGER, composite_a INTEGER, composite_b INTEGER, mixed INTEGER)')
    await database.raw('CREATE UNIQUE INDEX profiles_one_self_per_owner ON profiles (user_owner) WHERE is_self = 1')
    await database.raw('CREATE UNIQUE INDEX profiles_global_key ON profiles (global_key)')
    await database.raw('CREATE UNIQUE INDEX profiles_composite ON profiles (composite_a, composite_b)')
    await database.raw('CREATE UNIQUE INDEX profiles_mixed_global ON profiles (mixed)')
    await database.raw('CREATE UNIQUE INDEX profiles_mixed_partial ON profiles (mixed) WHERE is_self = 1')
    await database.raw('INSERT INTO profiles (user_owner, is_self) VALUES (1, 1), (1, 0), (1, 0)')
    await assert.rejects(() => database.raw('INSERT INTO profiles (user_owner, is_self) VALUES (1, 1)'), /UNIQUE constraint failed/)

    await database.raw('INSERT INTO profiles (global_key, composite_a, composite_b, mixed) VALUES (42, 3, 4, 7)')
    await assert.rejects(() => database.raw('INSERT INTO profiles (global_key) VALUES (42)'), /UNIQUE constraint failed/)
    await database.raw('INSERT INTO profiles (composite_a, composite_b) VALUES (3, 5)')
    await assert.rejects(() => database.raw('INSERT INTO profiles (composite_a, composite_b) VALUES (3, 4)'), /UNIQUE constraint failed/)
    await assert.rejects(() => database.raw('INSERT INTO profiles (mixed) VALUES (7)'), /UNIQUE constraint failed/)

    // 关闭再打开数据库与 inspector，验证结果不依赖进程内的旧 schema。
    await database.destroy()
    database = knex(config)
    const columns = await createInspector(database).columnInfo('profiles') as Array<{ name: string; is_unique: boolean }>
    const unique = Object.fromEntries(columns.map((item) => [item.name, item.is_unique]))
    assert.equal(unique.user_owner, false, '条件唯一不等于全局唯一')
    assert.equal(unique.global_key, true)
    assert.equal(unique.composite_a, false)
    assert.equal(unique.composite_b, false)
    assert.equal(unique.mixed, true, '条件索引不能遮蔽同字段的全局唯一索引')

    const profiles = collection({ name: 'profiles', label: '档案', primaryKey: 'integer', fields: [
      field.integer('user_owner'), field.integer('is_self'), field.integer('global_key', { unique: true }),
      field.integer('composite_a'), field.integer('composite_b'), field.integer('mixed', { unique: true }),
    ] })
    const manifest: Manifest = {
      manifestVersion: 1, generator: { name: 'test', version: '1' },
      source: { algorithm: 'sha256', digest: 'a'.repeat(64), files: [] },
      collections: [{ ...profiles, fields: [] }],
      fields: profiles.fields.map((item) => ({ ...item, collection: 'profiles', source: 'test.ts' })),
      relations: [], resources: { folders: [], roles: [], policies: [], access: [], permissions: [], presets: [] },
    }
    const state: DirectusState = {
      collections: manifest.collections.map((item) => ({ ...item })),
      fields: manifest.fields.map((item) => ({ ...item, schema: { ...item.schema, is_unique: item.field === 'id' ? true : unique[item.field] } })),
      relations: [],
    }
    const plan = createPlan(manifest, state, 'http://localhost:8055', 'sqlite3')
    assert.ok(plan.operations.every((item) => item.action === 'unchanged'))
    manifest.fields.find((item) => item.field === 'global_key')!.schema!.is_unique = false
    manifest.fields.find((item) => item.field === 'user_owner')!.schema!.is_unique = true
    const drift = createPlan(manifest, state, 'http://localhost:8055', 'sqlite3')
    for (const name of ['global_key', 'user_owner']) {
      const operation = drift.operations.find((item) => item.resource === `profiles.${name}`)!
      assert.equal(operation.action, 'dangerous')
      assert.ok(operation.changes.some((item) => item.path === 'schema.is_unique'))
    }
    assert.equal((await database.raw("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'profiles_one_self_per_owner'")).length, 1)
  } finally {
    await database.destroy()
    rmSync(directory, { recursive: true, force: true })
  }
})

test('Directus 空库按普通集合层级完整 apply，重启后条件唯一不误报', { skip: !project, timeout: 120_000 }, async () => {
  const { spawn, execFileSync } = await import('node:child_process')
  const { once } = await import('node:events')
  const { createServer } = await import('node:net')
  const { DirectusReader, DirectusWriter } = await import('../../src/directus.js')
  const { executeApply } = await import('../../src/apply.js')
  const projectRequire = createRequire(path.resolve(project!, 'package.json'))
  const directusPackage = projectRequire.resolve('directus/package.json')
  const apiRequire = createRequire(createRequire(directusPackage).resolve('@directus/api'))
  const knex = createRequire(apiRequire.resolve('@directus/schema'))('knex')
  const cli = path.join(path.dirname(directusPackage), 'cli.js')
  const directory = mkdtempSync(path.join(os.tmpdir(), 'dsk-directus-'))
  const socket = createServer()
  socket.listen(0, '127.0.0.1')
  await once(socket, 'listening')
  const port = (socket.address() as { port: number }).port
  await new Promise<void>((resolve) => socket.close(() => resolve()))
  const url = `http://127.0.0.1:${port}`
  const databaseFile = path.join(directory, 'data.db')
  const environment = {
    ...process.env, DB_CLIENT: 'sqlite3', DB_FILENAME: databaseFile,
    SECRET: 'dsk-isolated-regression-secret-at-least-32-characters',
    ADMIN_EMAIL: 'regression@example.com', ADMIN_PASSWORD: 'dsk-regression-password',
    HOST: '127.0.0.1', PORT: String(port), PUBLIC_URL: url,
    TELEMETRY: 'false', LOG_LEVEL: 'error', CACHE_ENABLED: 'false',
  }
  let server: ReturnType<typeof spawn> | undefined
  const stop = async (): Promise<void> => {
    if (!server || server.exitCode !== null) return
    const exit = once(server, 'exit')
    server.kill('SIGTERM')
    await exit
    server = undefined
  }
  const start = async (): Promise<void> => {
    server = spawn(process.execPath, [cli, 'start'], { cwd: directory, env: environment, stdio: 'ignore' })
    for (let attempt = 0; attempt < 200; attempt++) {
      if (server.exitCode !== null) throw new Error(`Directus 提前退出: ${server.exitCode}`)
      try {
        if ((await fetch(`${url}/server/ping`, { signal: AbortSignal.timeout(1_000) })).ok) return
      } catch { /* 等待隔离测试实例启动。 */ }
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
    throw new Error('Directus 测试实例启动超时')
  }
  try {
    execFileSync(process.execPath, [cli, 'bootstrap'], { cwd: directory, env: environment, stdio: 'pipe', timeout: 60_000 })
    await start()
    const login = async (): Promise<string> => {
      const response = await fetch(`${url}/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: environment.ADMIN_EMAIL, password: environment.ADMIN_PASSWORD }),
      })
      assert.equal(response.ok, true)
      return ((await response.json()) as { data: { access_token: string } }).data.access_token
    }
    let token = await login()
    let reader = new DirectusReader(url, token)
    let writer = new DirectusWriter(url, token)
    const definitions = [
      collection({ name: 'profile_tag_links', label: '标签关联', group: 'profile_tags' }),
      collection({ name: 'profile_tags', label: '标签', group: 'profiles' }),
      collection({ name: 'profiles', label: '档案', fields: [
        field.integer('user_owner'), field.integer('is_self'), field.integer('global_key', { unique: true }),
        field.integer('composite_a'), field.integer('composite_b'), field.integer('mixed', { unique: true }),
      ] }),
    ]
    const manifest: Manifest = {
      manifestVersion: 1, generator: { name: 'test', version: '1' },
      source: { algorithm: 'sha256', digest: 'a'.repeat(64), files: [] },
      collections: definitions.map((item) => ({ ...item, fields: [] })),
      fields: definitions.flatMap((item) => item.fields.map((definition) => ({ ...definition, collection: item.collection, source: 'test.ts' }))),
      relations: [], resources: { folders: [], roles: [], policies: [], access: [], permissions: [], presets: [] },
    }
    const state = await reader.readState()
    assert.equal(state.collections.some((item) => item.collection === 'profiles'), false)
    const applied = await executeApply({ manifest, plan: createPlan(manifest, state, url, 'sqlite3'), writer })
    assert.equal(applied.status, 'success', JSON.stringify(applied.failed))
    assert.deepEqual(applied.completed.filter((item) => item.resourceType === 'collection').map((item) => item.resource), [
      'profiles', 'profile_tags', 'profile_tag_links',
    ])
    await stop()
    const database = knex({ client: 'sqlite3', connection: { filename: databaseFile }, useNullAsDefault: true })
    try {
      await database.raw('CREATE UNIQUE INDEX profiles_one_self_per_owner ON profiles (user_owner) WHERE is_self = 1')
      await database.raw('CREATE UNIQUE INDEX profiles_composite ON profiles (composite_a, composite_b)')
      await database.raw('CREATE UNIQUE INDEX profiles_mixed_partial ON profiles (mixed) WHERE is_self = 1')
    } finally {
      await database.destroy()
    }
    // 两次启动分别重建 Directus schema 缓存，确认不是旧缓存掩盖问题。
    for (let round = 0; round < 2; round++) {
      await start()
      token = await login()
      reader = new DirectusReader(url, token)
      writer = new DirectusWriter(url, token)
      const converged = createPlan(manifest, await reader.readState(), url, 'sqlite3')
      assert.ok(converged.operations.every((item) => item.action === 'unchanged'), JSON.stringify(converged.operations.filter((item) => item.action !== 'unchanged')))
      const changed = structuredClone(manifest)
      changed.fields.find((item) => item.field === 'global_key')!.schema!.is_unique = false
      const drift = createPlan(changed, await reader.readState(), url, 'sqlite3')
      assert.equal(drift.operations.find((item) => item.resource === 'profiles.global_key')?.action, 'dangerous')
      const blocked = await executeApply({ manifest: changed, plan: drift, writer })
      assert.equal(blocked.status, 'blocked')
      assert.deepEqual(blocked.completed, [])
      if (round === 0) {
        await writer.createItem('profiles', { user_owner: 1, is_self: 1 })
        await writer.createItem('profiles', { user_owner: 1, is_self: 0 })
        await writer.createItem('profiles', { user_owner: 1, is_self: 0 })
      }
      await assert.rejects(() => writer.createItem('profiles', { user_owner: 1, is_self: 1 }), /写入 Directus 失败/)
      assert.equal((await reader.listItems('profiles')).length, 3)
      await stop()
    }
  } finally {
    await stop()
    rmSync(directory, { recursive: true, force: true })
  }
})
