import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { promisify } from 'node:util'
import { diagnoseProject } from '../src/doctor.js'
import { initCommand } from '../src/commands.js'

const execFileAsync = promisify(execFile)

test('doctor 只报告变量名，不泄露变量值', async () => {
  const cwd = mkdtempSync(path.join(os.tmpdir(), 'dsk-doctor-'))
  writeFileSync(path.join(cwd, 'package.json'), JSON.stringify({ dependencies: { directus: '11.17.4' } }))
  await initCommand({ cwd, packageVersion: '1.0.0' }, false)
  writeFileSync(path.join(cwd, '.env'), 'PUBLIC_URL=http://127.0.0.1:8055\nADMIN_TOKEN=doctor-super-secret\n')
  const report = await diagnoseProject(cwd)
  const serialized = JSON.stringify(report)
  assert.equal(report.ok, true)
  assert.deepEqual(report.environment.configuredVariables, ['ADMIN_TOKEN', 'PUBLIC_URL'])
  assert.equal(serialized.includes('doctor-super-secret'), false)
})

test('doctor --format json 的 stdout 只有单一 JSON 且已脱敏', async () => {
  const cwd = mkdtempSync(path.join(os.tmpdir(), 'dsk-doctor-cli-'))
  writeFileSync(path.join(cwd, 'package.json'), JSON.stringify({ dependencies: { directus: '11.17.4' } }))
  await initCommand({ cwd, packageVersion: '1.0.0' }, false)
  writeFileSync(path.join(cwd, '.env'), 'PUBLIC_URL=http://127.0.0.1:8055\nADMIN_TOKEN=cli-super-secret\n')
  const cli = path.join(process.cwd(), 'src/cli.ts')
  const { stdout, stderr } = await execFileAsync(process.execPath, ['--import', 'tsx', cli, '--cwd', cwd, '--format', 'json', 'doctor'], { cwd: process.cwd() })
  const value = JSON.parse(stdout) as { command: string; doctorVersion: number; ok: boolean }
  assert.deepEqual({ command: value.command, doctorVersion: value.doctorVersion, ok: value.ok }, { command: 'doctor', doctorVersion: 1, ok: true })
  assert.equal(stdout.includes('cli-super-secret'), false)
  assert.equal(stderr, '')
})
