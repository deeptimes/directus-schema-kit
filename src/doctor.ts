import { existsSync } from 'node:fs'
import path from 'node:path'
import { loadConfig } from './config.js'
import { loadProjectEnvironment } from './env.js'
import { discoverDirectusProject } from './project.js'
import { validateWorkspace } from './validate.js'
import type { DoctorCheck, DoctorResult } from './types.js'

export async function diagnoseProject(cwd: string, customConfig?: string): Promise<DoctorResult> {
  const project = discoverDirectusProject(cwd)
  const checks: DoctorCheck[] = []
  const configPath = path.resolve(project.root, customConfig ?? 'dsk/config.json')
  if (!existsSync(configPath)) {
    checks.push({ name: 'config', status: 'fail', message: '缺少 dsk/config.json，请运行 dsk init' })
    return result(project.root, project.directusVersion, configPath, null, checks, path.join(project.root, '.env'), [], ['DIRECTUS_URL'])
  }

  let loaded
  try {
    loaded = loadConfig(project.root, customConfig)
    checks.push({ name: 'config', status: 'pass', message: '配置文件有效' })
  } catch (error) {
    checks.push({ name: 'config', status: 'fail', message: error instanceof Error ? error.message : String(error) })
    return result(project.root, project.directusVersion, configPath, null, checks, path.join(project.root, '.env'), [], ['DIRECTUS_URL'])
  }

  const envFile = path.resolve(loaded.directory, loaded.config.env?.file ?? '../.env')
  const environment = loadProjectEnvironment(loaded.config, loaded.directory)
  const allowed = loaded.config.env?.allowedVariables ?? []
  const configured = allowed.filter((name) => environment[name] !== undefined).sort()
  const missing = allowed.filter((name) => environment[name] === undefined).sort()
  checks.push({
    name: 'environment', status: environment.DIRECTUS_URL ? 'pass' : 'warn',
    message: environment.DIRECTUS_URL ? 'Directus 连接变量已配置' : '缺少 DIRECTUS_URL；离线命令可用，实例命令不可用',
  })

  const manifestPath = path.resolve(loaded.directory, loaded.config.paths.manifest)
  for (const directory of ['dsk/schemas', 'dsk/resources', 'dsk/seeds', 'dsk/generated']) {
    checks.push({ name: directory, status: existsSync(path.join(project.root, directory)) ? 'pass' : 'fail', message: existsSync(path.join(project.root, directory)) ? '目录存在' : '目录缺失' })
  }
  try {
    await validateWorkspace({ config: loaded.config, configDirectory: loaded.directory, projectRoot: project.root })
    checks.push({ name: 'workspace', status: 'pass', message: 'Manifest、源码摘要和 Seed 校验通过' })
  } catch (error) {
    checks.push({ name: 'workspace', status: 'fail', message: error instanceof Error ? error.message : String(error) })
  }
  return result(project.root, project.directusVersion, configPath, manifestPath, checks, envFile, configured, missing)
}

function result(root: string, directusVersion: string, config: string, manifest: string | null, checks: DoctorCheck[], envFile: string, configuredVariables: string[], missingVariables: string[]): DoctorResult {
  return {
    doctorVersion: 1,
    ok: checks.every((check) => check.status !== 'fail'),
    project: { root, directusVersion, packageManager: packageManager(root) },
    environment: { file: envFile, exists: existsSync(envFile), configuredVariables, missingVariables },
    workspace: { config, manifest },
    checks,
  }
}

function packageManager(root: string): DoctorResult['project']['packageManager'] {
  if (existsSync(path.join(root, 'pnpm-lock.yaml'))) return 'pnpm'
  if (existsSync(path.join(root, 'yarn.lock'))) return 'yarn'
  if (existsSync(path.join(root, 'bun.lock')) || existsSync(path.join(root, 'bun.lockb'))) return 'bun'
  if (existsSync(path.join(root, 'package-lock.json'))) return 'npm'
  return 'unknown'
}
