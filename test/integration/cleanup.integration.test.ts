import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { once } from 'node:events'
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createServer } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import test from 'node:test'
import { readCleanupSnapshot } from '../../src/cleanup-reader.js'
import { executeCleanup } from '../../src/cleanup.js'
import { DirectusReader, DirectusWriter } from '../../src/directus.js'
import { collection, field } from '../../src/index.js'
import type { Manifest } from '../../src/types.js'

// 只在临时目录创建一次性实例；绝不使用已有开发实例的 URL、数据库或上传目录。
const project = process.env.DSK_CLEANUP_PROJECT

test('一次性 Directus 实例 clean/reset：授权保护、真实文件删除、重新登录及重复执行', { skip: !project, timeout: 120_000 }, async (t) => {
  const projectRequire = createRequire(path.resolve(project!, 'package.json'))
  const packagePath = projectRequire.resolve('directus/package.json')
  const cli = path.join(path.dirname(packagePath), 'cli.js')
  const directory = mkdtempSync(path.join(os.tmpdir(), 'dsk-cleanup-integration-'))
  const uploads = path.join(directory, 'uploads')
  mkdirSync(uploads)
  const socket = createServer()
  socket.listen(0, '127.0.0.1')
  await once(socket, 'listening')
  const port = (socket.address() as { port: number }).port
  await new Promise<void>((resolve) => socket.close(() => resolve()))
  const url = `http://127.0.0.1:${port}`
  const environment = {
    ...process.env, DB_CLIENT: 'sqlite3', DB_FILENAME: path.join(directory, 'data.db'),
    SECRET: 'dsk-cleanup-isolated-test-secret-32-characters',
    ADMIN_EMAIL: 'cleanup@example.com', ADMIN_PASSWORD: 'dsk-cleanup-test-password',
    HOST: '127.0.0.1', PORT: String(port), PUBLIC_URL: url,
    STORAGE_LOCATIONS: 'local', STORAGE_LOCAL_DRIVER: 'local', STORAGE_LOCAL_ROOT: uploads,
    TELEMETRY: 'false', LOG_LEVEL: 'error', CACHE_ENABLED: 'false',
    EXTENSIONS_PATH: path.join(directory, 'extensions'),
  }
  let server: ReturnType<typeof spawn> | undefined
  let output = ''
  try {
    // bootstrap 仅用于建立隔离测试夹具，不属于 clean/reset 的实现或执行路径。
    execFileSync(process.execPath, [cli, 'bootstrap'], { cwd: directory, env: environment, stdio: 'pipe', timeout: 60_000 })
    server = spawn(process.execPath, [cli, 'start'], { cwd: directory, env: environment, stdio: ['ignore', 'pipe', 'pipe'] })
    server.stderr?.on('data', (data: Buffer) => { output += data.toString() })
    for (let attempt = 0; attempt < 200; attempt++) {
      if (server.exitCode !== null) throw new Error(`Directus 启动失败: ${output.slice(-1000)}`)
      try { if ((await fetch(`${url}/server/ping`, { signal: AbortSignal.timeout(500) })).ok) break } catch { /* 等待临时实例。 */ }
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
    const login = async (): Promise<string> => {
      const response = await fetch(`${url}/auth/login`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: environment.ADMIN_EMAIL, password: environment.ADMIN_PASSWORD }),
      })
      assert.equal(response.ok, true, `login HTTP ${response.status}`)
      return ((await response.json()) as { data: { access_token: string } }).data.access_token
    }
    const token = await login()
    const reader = new DirectusReader(url, token)
    const writer = new DirectusWriter(url, token)
    const request = async (endpoint: string, method: string, body: unknown): Promise<Record<string, unknown>> => {
      const response = await fetch(`${url}/${endpoint}`, { method, headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) })
      assert.equal(response.ok, true, `${method} ${endpoint} HTTP ${response.status}`)
      return ((await response.json()) as { data: Record<string, unknown> }).data
    }
    const definition = collection({ name: 'cleanup_articles', label: 'Articles', fields: [field.m2o('parent', { collection: 'cleanup_articles' })] })
    await writer.createCollection(definition, definition.fields[0])
    await writer.createField('cleanup_articles', definition.fields.find((row) => row.field === 'parent')!)
    await writer.createRelation({ collection: 'cleanup_articles', field: 'parent', related_collection: 'cleanup_articles', meta: { many_collection: 'cleanup_articles', many_field: 'parent', one_collection: 'cleanup_articles' }, schema: { on_delete: 'SET NULL' } })
    const legacy = collection({ name: 'cleanup_legacy', label: 'Legacy' })
    await writer.createCollection(legacy, legacy.fields[0])
    const a = await writer.createItem('cleanup_articles', {})
    const b = await writer.createItem('cleanup_articles', { parent: a.id })
    await writer.updateItem('cleanup_articles', a.id as string, { parent: b.id })
    await writer.createItem('cleanup_legacy', {})
    const role = await writer.createSystemResource('roles', { name: 'Cleanup Editor' })
    const policy = await writer.createSystemResource('policies', { name: 'Cleanup Editor', admin_access: false, app_access: false })
    await writer.createSystemResource('access', { role: role.id, policy: policy.id })
    await writer.createSystemResource('permissions', { policy: policy.id, collection: 'cleanup_articles', action: 'read', fields: ['*'], permissions: {} })
    const ordinary = await writer.createSystemResource('users', { email: 'ordinary@example.com', role: role.id, status: 'active' })
    const folder = await writer.createSystemResource('folders', { name: 'Cleanup uploads' })
    const form = new FormData()
    form.set('folder', String(folder.id))
    form.set('file', new Blob(['temporary file'], { type: 'text/plain' }), 'cleanup.txt')
    const upload = await fetch(`${url}/files`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form })
    assert.equal(upload.ok, true)
    const file = ((await upload.json()) as { data: { id: string; filename_disk: string } }).data
    const diskPath = path.join(uploads, file.filename_disk)
    assert.equal(existsSync(diskPath), true)
    const manifest: Manifest = {
      manifestVersion: 1, generator: { name: 'test', version: '1' }, source: { algorithm: 'sha256', digest: 'a'.repeat(64), files: [] },
      collections: [{ ...definition, fields: [] }], fields: [], relations: [],
      resources: { roles: [], policies: [], access: [], permissions: [], presets: [], folders: [] },
    }
    const singleton = collection({ name: 'cleanup_singleton', label: 'Singleton', fields: [field.string('title')] })
    await writer.createCollection(singleton, singleton.fields[0])
    await writer.createField('cleanup_singleton', singleton.fields.find((row) => row.field === 'title')!)
    await writer.createItem('cleanup_singleton', { title: 'singleton content' })
    await writer.updateCollection('cleanup_singleton', { singleton: true })
    const readSnapshot = () => readCleanupSnapshot(reader)
    const before = await readSnapshot()
    const dryRun = await executeCleanup({ mode: 'full', manifest, readSnapshot, writer, dryRun: true })
    assert.equal(dryRun.status, 'planned', JSON.stringify(dryRun.blockers))
    assert.equal(existsSync(diskPath), true)
    const clean = await executeCleanup({ mode: 'data', manifest, readSnapshot, writer, confirm: true })
    assert.equal(clean.status, 'success', JSON.stringify(clean.failure ?? clean.blockers))
    assert.equal((await reader.listItems('cleanup_articles')).length, 0)
    assert.equal(existsSync(diskPath), true)
    const ownerField = field.m2o('user_owner', { collection: 'directus_users', required: true, onDelete: 'RESTRICT' })
    await writer.createField('cleanup_articles', ownerField)
    await writer.createRelation({ collection: 'cleanup_articles', field: 'user_owner', related_collection: 'directus_users', meta: { many_collection: 'cleanup_articles', many_field: 'user_owner', one_collection: 'directus_users' }, schema: { on_delete: 'RESTRICT' } })
    await writer.createItem('cleanup_articles', { user_owner: ordinary.id })
    await request('settings', 'PATCH', { project_logo: file.id })
    const blocked = await executeCleanup({ mode: 'full', manifest, readSnapshot, writer, confirm: true })
    assert.equal(blocked.status, 'blocked')
    assert.equal(blocked.completed.length, 0)
    assert.equal(existsSync(diskPath), true)
    await request('settings', 'PATCH', { project_logo: null })
    const reset = await executeCleanup({ mode: 'full', manifest, readSnapshot, writer, confirm: true })
    assert.equal(reset.status, 'success', JSON.stringify(reset.failure ?? reset.blockers))
    assert.equal(reset.verified, true)
    assert.equal(existsSync(diskPath), false)
    assert.equal((await reader.listAll('users')).length, 1)
    assert.equal((await reader.readState()).collections.some((row) => row.collection === 'cleanup_legacy'), false)
    const admin = (await reader.listAll('users')).find((row) => row.id === before.currentUser)!
    assert.equal(admin.email, 'cleanup@example.com')
    await login()
    const repeated = await executeCleanup({ mode: 'full', manifest, readSnapshot, writer, confirm: true })
    assert.equal(repeated.status, 'success', JSON.stringify(repeated.failure ?? repeated.blockers))
    assert.equal(repeated.completed.length, 0)
    t.diagnostic('临时 SQLite 与 uploads 中验证文件删除、普通用户删除、管理员密码登录与 reset 幂等')
  } finally {
    if (server && server.exitCode === null) {
      const exited = once(server, 'exit')
      server.kill('SIGTERM')
      await exited
    }
    rmSync(directory, { recursive: true, force: true })
  }
})
