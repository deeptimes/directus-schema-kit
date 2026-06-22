import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { loadConfig } from './config.js'
import { DskError } from './errors.js'
import { executeApply } from './apply.js'
import { executeClear } from './clear.js'
import { DirectusReader, DirectusWriter } from './directus.js'
import { diagnoseProject } from './doctor.js'
import { directusConnection, loadProjectEnvironment } from './env.js'
import { initializeWorkspace, type InitResult } from './init.js'
import { compileManifest } from './manifest.js'
import { createPlan } from './plan.js'
import { loadSeedBatches, runSeeds } from './seed.js'
import { syncResources } from './resources.js'
import { discoverDirectusProject } from './project.js'
import { validateManifest, validateWorkspace } from './validate.js'
import type { ApplyResult, ClearOperation, ClearResult, DoctorResult, Manifest, Plan, ResourceSyncResult, SeedResult } from './types.js'

export interface CommandContext {
  cwd: string
  configPath?: string
  packageVersion: string
}

export async function initCommand(context: CommandContext, dryRun: boolean): Promise<InitResult & { manifest?: string }> {
  const project = discoverDirectusProject(context.cwd)
  const result = initializeWorkspace(project.root, dryRun)
  if (dryRun) return result
  const manifest = await buildCommand({ ...context, cwd: project.root }, false)
  return { ...result, manifest: manifest.path }
}

export async function buildCommand(context: CommandContext, check: boolean): Promise<{ path: string; changed: boolean }> {
  const project = discoverDirectusProject(context.cwd)
  const loaded = loadConfig(project.root, context.configPath)
  const manifest = await compileManifest({
    config: loaded.config,
    configDirectory: loaded.directory,
    projectRoot: project.root,
    packageVersion: context.packageVersion,
  })
  const errors = validateManifest(manifest, loaded.config)
  if (errors.length > 0) throw new DskError('Manifest 语义校验失败', 'VALIDATION_ERROR', errors)
  const manifestPath = path.resolve(loaded.directory, loaded.config.paths.manifest)
  const content = JSON.stringify(manifest, null, 2) + '\n'
  const current = existsSync(manifestPath) ? readFileSync(manifestPath, 'utf8') : null
  const changed = current !== content
  if (check && changed) throw new DskError('Manifest 与 DSL 源码不一致', 'VALIDATION_ERROR', ['请运行 dsk build 更新 Manifest'])
  if (!check && changed) atomicWrite(manifestPath, content)
  return { path: manifestPath, changed }
}

export async function validateCommand(context: CommandContext): Promise<{ manifestPath: string; collections: number; fields: number; seeds: number }> {
  const project = discoverDirectusProject(context.cwd)
  const loaded = loadConfig(project.root, context.configPath)
  const result = await validateWorkspace({ config: loaded.config, configDirectory: loaded.directory, projectRoot: project.root })
  return {
    manifestPath: path.resolve(loaded.directory, loaded.config.paths.manifest),
    collections: result.manifest.collections.length,
    fields: result.manifest.fields.length,
    seeds: result.seedFiles,
  }
}

export async function planCommand(context: CommandContext): Promise<Plan> {
  return (await preparePlan(context)).plan
}

export async function applyCommand(context: CommandContext, options: { dryRun?: boolean }): Promise<ApplyResult> {
  const prepared = await preparePlan(context)
  const writer = new DirectusWriter(prepared.connection.url, prepared.connection.token)
  return executeApply({ manifest: prepared.manifest, plan: prepared.plan, writer, dryRun: options.dryRun ?? false })
}

export async function seedCommand(context: CommandContext, options: { path?: string; dryRun?: boolean; plan?: boolean }): Promise<SeedResult> {
  if (options.dryRun && options.plan) throw new DskError('--dry-run 与 --plan 不能同时使用', 'CONFIG_ERROR')
  const project = discoverDirectusProject(context.cwd)
  const loaded = loadConfig(project.root, context.configPath)
  const pattern = seedPattern(options.path, project.root, loaded.config.paths.seeds)
  const batches = await loadSeedBatches(pattern, options.path ? project.root : loaded.directory)
  const mode = options.dryRun ? 'dry-run' : options.plan ? 'plan' : 'apply'
  if (mode === 'dry-run') return runSeeds({ batches, mode })
  const connection = directusConnection(loaded.config, loaded.directory)
  const reader = new DirectusReader(connection.url, connection.token)
  const writer = new DirectusWriter(connection.url, connection.token)
  return runSeeds({ batches, mode, reader, ...(mode === 'apply' ? { writer } : {}) })
}

export async function resourcesApplyCommand(context: CommandContext, options: { dryRun?: boolean; confirmDestructive?: boolean }): Promise<ResourceSyncResult> {
  const project = discoverDirectusProject(context.cwd)
  const loaded = loadConfig(project.root, context.configPath)
  const validated = await validateWorkspace({ config: loaded.config, configDirectory: loaded.directory, projectRoot: project.root })
  const connection = directusConnection(loaded.config, loaded.directory)
  const reader = new DirectusReader(connection.url, connection.token)
  const writer = new DirectusWriter(connection.url, connection.token)
  return syncResources({
    definitions: validated.manifest.resources,
    reader,
    writer,
    environment: loadProjectEnvironment(loaded.config, loaded.directory),
    dryRun: options.dryRun ?? false,
    confirmDestructive: options.confirmDestructive ?? false,
  })
}

export async function clearCommand(context: CommandContext, options: {
  confirm?: boolean
  authorize?: (operations: readonly ClearOperation[]) => Promise<boolean>
}): Promise<ClearResult> {
  const project = discoverDirectusProject(context.cwd)
  const loaded = loadConfig(project.root, context.configPath)
  const validated = await validateWorkspace({ config: loaded.config, configDirectory: loaded.directory, projectRoot: project.root })
  const connection = directusConnection(loaded.config, loaded.directory)
  const reader = new DirectusReader(connection.url, connection.token)
  const writer = new DirectusWriter(connection.url, connection.token)
  const state = await reader.readState()
  return executeClear({
    manifest: validated.manifest,
    state,
    writer,
    confirm: options.confirm ?? false,
    ...(options.authorize ? { authorize: options.authorize } : {}),
    enabled: loaded.config.safety?.clearEnabled ?? true,
  })
}

export function doctorCommand(context: CommandContext): Promise<DoctorResult> {
  return diagnoseProject(context.cwd, context.configPath)
}

async function preparePlan(context: CommandContext): Promise<{
  manifest: Manifest
  plan: Plan
  connection: { url: string; token?: string }
}> {
  const project = discoverDirectusProject(context.cwd)
  const loaded = loadConfig(project.root, context.configPath)
  const validated = await validateWorkspace({ config: loaded.config, configDirectory: loaded.directory, projectRoot: project.root })
  const connection = directusConnection(loaded.config, loaded.directory)
  const state = await new DirectusReader(connection.url, connection.token).readState()
  return {
    manifest: validated.manifest,
    plan: createPlan(validated.manifest, state, connection.url, connection.databaseClient),
    connection,
  }
}

function atomicWrite(filePath: string, content: string): void {
  mkdirSync(path.dirname(filePath), { recursive: true })
  const temporary = `${filePath}.${process.pid}.tmp`
  writeFileSync(temporary, content, 'utf8')
  renameSync(temporary, filePath)
}

function seedPattern(requestedPath: string | undefined, projectRoot: string, configuredPattern: string): string {
  if (!requestedPath) return configuredPattern
  const absolute = path.resolve(projectRoot, requestedPath)
  if (!existsSync(absolute)) throw new DskError(`Seed 路径不存在: ${absolute}`, 'CONFIG_ERROR')
  return statSync(absolute).isDirectory() ? `${requestedPath.replace(/\/$/, '')}/**/*.json` : requestedPath
}
