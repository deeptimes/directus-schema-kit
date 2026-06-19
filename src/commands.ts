import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { loadConfig } from './config.js'
import { DskError } from './errors.js'
import { executeApply } from './apply.js'
import { DirectusReader, DirectusWriter } from './directus.js'
import { directusConnection } from './env.js'
import { initializeWorkspace, type InitResult } from './init.js'
import { compileManifest } from './manifest.js'
import { createPlan } from './plan.js'
import { discoverDirectusProject } from './project.js'
import { validateManifest, validateWorkspace } from './validate.js'
import type { ApplyResult, Manifest, Plan } from './types.js'

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

export async function planCommand(context: CommandContext, moduleFilter?: string): Promise<Plan> {
  return (await preparePlan(context, moduleFilter)).plan
}

export async function applyCommand(context: CommandContext, options: { module?: string; dryRun?: boolean }): Promise<ApplyResult> {
  const prepared = await preparePlan(context, options.module)
  const writer = new DirectusWriter(prepared.connection.url, prepared.connection.token)
  return executeApply({ manifest: prepared.manifest, plan: prepared.plan, writer, dryRun: options.dryRun ?? false })
}

async function preparePlan(context: CommandContext, moduleFilter?: string): Promise<{
  manifest: Manifest
  plan: Plan
  connection: { url: string; token?: string }
}> {
  const project = discoverDirectusProject(context.cwd)
  const loaded = loadConfig(project.root, context.configPath)
  const validated = await validateWorkspace({ config: loaded.config, configDirectory: loaded.directory, projectRoot: project.root })
  if (moduleFilter && !validated.manifest.modules.some((item) => item.id === moduleFilter)) {
    throw new DskError(`Manifest 中不存在模块: ${moduleFilter}`, 'CONFIG_ERROR')
  }
  const connection = directusConnection(loaded.config, loaded.directory)
  const state = await new DirectusReader(connection.url, connection.token).readState()
  return { manifest: validated.manifest, plan: createPlan(validated.manifest, state, connection.url, moduleFilter), connection }
}

function atomicWrite(filePath: string, content: string): void {
  mkdirSync(path.dirname(filePath), { recursive: true })
  const temporary = `${filePath}.${process.pid}.tmp`
  writeFileSync(temporary, content, 'utf8')
  renameSync(temporary, filePath)
}
