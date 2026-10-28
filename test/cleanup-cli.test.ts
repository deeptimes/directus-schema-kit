import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import test from 'node:test'
import { initCommand } from '../src/commands.js'

test('clean/reset CLI 支持只读预览、JSON、确认与受保护管理员，真实执行调用 Files API', async (t) => {
  const writes: string[] = []
  const rows: Record<string, Array<Record<string, unknown>>> = {
    '/users': [{ id: 'admin', email: 'admin@example.com', status: 'active', role: 'admin-role' }, { id: 'normal', email: 'user@example.com', status: 'active', role: 'editor-role' }],
    '/roles': [{ id: 'admin-role', name: 'Administrator' }, { id: 'editor-role', name: 'Editor' }],
    '/policies': [{ id: 'admin-policy', name: 'Administrator', admin_access: true }, { id: 'public', name: '$t:public_label' }, { id: 'editor-policy', name: 'Editor' }],
    '/access': [{ id: 'admin-access', role: 'admin-role', user: null, policy: 'admin-policy' }, { id: 'editor-access', role: 'editor-role', user: null, policy: 'editor-policy' }],
    '/permissions': [{ id: 1, policy: 'editor-policy', collection: 'old', action: 'read' }],
    '/presets': [], '/files': [{ id: 'file', filename_disk: 'file.png' }], '/folders': [],
    '/items/old': [{ id: 'one' }],
    '/collections': [{ collection: 'old', schema: {} }],
    '/fields': [{ collection: 'old', field: 'id', type: 'uuid', schema: { is_primary_key: true } }], '/relations': [],
  }
  const disk = new Set(['file.png'])
  const server = createServer((request, response) => {
    const url = new URL(request.url!, 'http://localhost')
    if (request.method !== 'GET') {
      writes.push(`${request.method} ${url.pathname}`)
      const parts = url.pathname.split('/')
      const id = decodeURIComponent(parts.pop()!)
      const endpoint = parts.join('/')
      if (endpoint === '/files') disk.delete('file.png')
      if (endpoint === '/collections') {
        rows['/fields'] = []
        rows['/items/old'] = []
      }
      rows[endpoint] = (rows[endpoint] ?? []).filter((row) => String(row.id ?? row.collection) !== id)
      response.writeHead(204).end()
      return
    }
    response.setHeader('content-type', 'application/json')
    const value = url.pathname === '/users/me' ? { id: 'admin' } : url.pathname === '/settings' ? { id: 1, project_name: 'Keep' } : Number(url.searchParams.get('offset')) > 0 ? [] : rows[url.pathname]
    if (value === undefined) { response.writeHead(404).end(JSON.stringify({ errors: [{ message: 'not found' }] })); return }
    response.end(JSON.stringify({ data: value, ...(url.pathname === '/permissions' ? { meta: { filter_count: rows['/permissions']!.length } } : {}) }))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())))
  const port = (server.address() as { port: number }).port
  const cwd = mkdtempSync(path.join(os.tmpdir(), 'dsk-cleanup-cli-'))
  writeFileSync(path.join(cwd, 'package.json'), JSON.stringify({ dependencies: { directus: '11.17.4' } }))
  await initCommand({ cwd, packageVersion: '2.1.1' }, false)
  writeFileSync(path.join(cwd, '.env'), `PUBLIC_URL=http://127.0.0.1:${port}\nADMIN_TOKEN=test-secret\nADMIN_EMAIL=admin@example.com\n`)
  const run = (...args: string[]): Promise<{ code: number | null; output: string }> => new Promise((resolve) => {
    const child = spawn(process.execPath, ['--import', 'tsx', path.resolve('src/cli.ts'), '--cwd', cwd, '--format', 'json', ...args], { env: { ...process.env, PUBLIC_URL: '', ADMIN_TOKEN: '' } })
    let output = ''
    child.stdout.on('data', (data: Buffer) => { output += data.toString() })
    child.on('close', (code) => resolve({ code, output }))
  })
  // shell 中不覆盖 .env 中的连接配置。
  const configPath = path.join(cwd, 'dsk/config.json')
  const { readFileSync } = await import('node:fs')
  const config = JSON.parse(readFileSync(configPath, 'utf8')) as { env: { allowedVariables: string[] } }
  config.env.allowedVariables = []
  writeFileSync(configPath, JSON.stringify(config))
  for (const command of ['clean', 'reset']) {
    const preview = await run(command, '--dry-run')
    assert.equal(preview.code, 0, preview.output)
    const result = JSON.parse(preview.output) as { status: string; dryRun: boolean; operations: unknown[] }
    assert.equal(result.status, 'planned')
    assert.equal(result.dryRun, true)
    assert.ok(result.operations.length > 0)
    assert.equal(writes.length, 0)
  }
  const unconfirmed = await run('reset')
  assert.equal(JSON.parse(unconfirmed.output).status, 'planned')
  assert.equal(writes.length, 0)
  const invalid = await run('reset', '--dry-run', '--confirm')
  assert.equal(invalid.code, 5)
  assert.equal(writes.length, 0)
  const cleaned = await run('clean', '--confirm')
  assert.equal(cleaned.code, 0, cleaned.output)
  assert.equal(JSON.parse(cleaned.output).verified, true)
  assert.deepEqual(writes, ['DELETE /items/old/one'])
  assert.equal(rows['/collections']?.length, 1)
  const reset = await run('reset', '--confirm')
  assert.equal(reset.code, 0, reset.output)
  assert.equal(JSON.parse(reset.output).verified, true)
  assert.ok(writes.includes('DELETE /files/file'))
  assert.equal(disk.size, 0)
  assert.equal(writes.some((item) => /users\/admin|settings|license|bootstrap/.test(item)), false)
  assert.equal(rows['/users']?.length, 1)
  const repeated = await run('reset', '--confirm')
  assert.equal(repeated.code, 0, repeated.output)
  assert.deepEqual(JSON.parse(repeated.output).completed, [])
})
