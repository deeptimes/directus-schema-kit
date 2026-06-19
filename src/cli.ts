#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { Command } from 'commander'
import { applyCommand, buildCommand, clearCommand, doctorCommand, initCommand, planCommand, resourcesApplyCommand, seedCommand, validateCommand, type CommandContext } from './commands.js'
import { DskError } from './errors.js'

const packageJsonPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../package.json')
const packageVersion = (JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { version: string }).version
const program = new Command()

program
  .name('dsk')
  .description('Directus Schema Kit')
  .version(packageVersion)
  .option('--cwd <path>', 'Directus 项目或其子目录', process.cwd())
  .option('--config <path>', '相对项目根目录的配置文件路径')
  .option('--format <format>', '输出格式: text 或 json', 'text')

program.command('init')
  .description('初始化 dsk/ 与 .dsk/ 工作区')
  .option('--dry-run', '只展示将创建的文件')
  .action(async (options: { dryRun?: boolean }) => {
    const context = commandContext()
    const result = await initCommand(context, options.dryRun ?? false)
    output({ command: 'init', ok: true, ...result }, () => {
      console.log(result.dryRun ? '初始化预览：' : '初始化完成：')
      for (const file of result.created) console.log(`  创建 ${file}`)
      for (const file of result.preserved) console.log(`  保留 ${file}`)
      if (!result.dryRun) console.log('\n下一步：pnpm dsk validate，然后运行 pnpm dsk plan。')
    })
  })

program.command('build')
  .description('编译 DSL 并生成确定性 Manifest')
  .option('--check', '检查 Manifest 新鲜度但不写入')
  .action(async (options: { check?: boolean }) => {
    const result = await buildCommand(commandContext(), options.check ?? false)
    output({ command: 'build', ok: true, ...result }, () => console.log(result.changed ? `Manifest 已生成: ${result.path}` : `Manifest 无变化: ${result.path}`))
  })

program.command('validate')
  .description('离线校验配置、Manifest、DSL 新鲜度和 seed')
  .action(async () => {
    const result = await validateCommand(commandContext())
    output({ command: 'validate', ok: true, ...result }, () => console.log(`校验通过：${result.collections} collections，${result.fields} fields，${result.seeds} seed files`))
  })

program.command('doctor')
  .description('诊断项目识别、版本、环境变量和 DSK 工作区')
  .action(async () => {
    const result = await doctorCommand(commandContext())
    output({ command: 'doctor', ...result }, () => {
      console.log(`Directus ${result.project.directusVersion} · ${result.project.packageManager}`)
      for (const check of result.checks) console.log(`${check.status.padEnd(4)} ${check.name}: ${check.message}`)
      console.log(`环境变量：已配置 ${result.environment.configuredVariables.join(', ') || '(无)'}；缺少 ${result.environment.missingVariables.join(', ') || '(无)'}`)
    })
    if (!result.ok) process.exitCode = 5
  })

program.command('plan')
  .description('只读比较 Manifest 与本地 Directus 实例')
  .option('--module <id>', '只规划指定模块')
  .action(async (options: { module?: string }) => {
    const result = await planCommand(commandContext(), options.module)
    output({ command: 'plan', ok: true, ...result }, () => {
      for (const item of result.operations) {
        const marker = item.action === 'dangerous' ? '!' : item.action === 'unchanged' ? '=' : '+'
        console.log(`${marker} ${item.action.padEnd(9)} ${item.resourceType.padEnd(10)} ${item.resource}`)
        for (const change of item.changes) console.log(`    ${change.path}: ${display(change.current)} -> ${display(change.target)}`)
      }
      const summary = result.summary
      console.log(`\n汇总：create ${summary.create}，update ${summary.update}，unchanged ${summary.unchanged}，conflict ${summary.conflict}，dangerous ${summary.dangerous}`)
    })
    if (result.summary.dangerous > 0 || result.summary.conflict > 0) process.exitCode = 3
  })

program.command('apply')
  .description('执行 Plan 中允许的安全创建和更新')
  .option('--module <id>', '只应用指定模块')
  .option('--dry-run', '生成执行报告但不写入')
  .action(async (options: { module?: string; dryRun?: boolean }) => {
    const result = await applyCommand(commandContext(), options)
    output({ command: 'apply', ok: result.status === 'success', ...result }, () => {
      console.log(`状态：${result.status}${result.dryRun ? ' (dry-run)' : ''}`)
      for (const item of result.completed) console.log(`  完成 ${item.action} ${item.resourceType} ${item.resource}${item.detail ? `（${item.detail}）` : ''}`)
      if (result.failed) console.error(`  失败 ${result.failed.resourceType} ${result.failed.resource}: ${result.failed.message}`)
      for (const item of result.blocked) console.error(`  阻断 ${item.action} ${item.resourceType} ${item.resource}: ${item.reason ?? '需要人工处理'}`)
      console.log(`汇总：完成 ${result.completed.length}，未执行 ${result.notExecuted.length}，阻断 ${result.blocked.length}`)
    })
    if (result.status === 'blocked') process.exitCode = 3
    else if (result.status === 'failed') process.exitCode = 4
  })

program.command('seed [path]')
  .description('校验、规划或幂等应用 JSON Seed')
  .option('--dry-run', '仅执行本地结构和引用格式校验')
  .option('--plan', '连接实例预测 create/update/unchanged，不写入')
  .action(async (seedPath: string | undefined, options: { dryRun?: boolean; plan?: boolean }) => {
    const result = await seedCommand(commandContext(), { ...(seedPath ? { path: seedPath } : {}), ...options })
    output({ command: 'seed', ok: result.status === 'success', ...result }, () => {
      console.log(`Seed ${result.mode}：${result.status}`)
      console.log(`汇总：create ${result.summary.create}，update ${result.summary.update}，unchanged ${result.summary.unchanged}`)
      if (result.failure) console.error(`失败 ${result.failure.collection}.${result.failure.key}: ${result.failure.message}`)
    })
    if (result.status === 'failed') process.exitCode = 4
  })

const resources = program.command('resources').description('同步 Directus 系统资源')
resources.command('apply')
  .description('规划并同步 Directus 11 系统资源和访问关系')
  .option('--dry-run', '只输出计划，不写入')
  .option('--confirm-destructive', '允许定义中显式声明的删除')
  .action(async (options: { dryRun?: boolean; confirmDestructive?: boolean }) => {
    const result = await resourcesApplyCommand(commandContext(), options)
    output({ command: 'resources apply', ok: result.status === 'success', ...result }, () => {
      for (const item of result.operations) console.log(`${item.action.padEnd(9)} ${item.type}.${item.key}`)
      console.log(`状态：${result.status}，完成 ${result.completed.length}/${result.operations.filter((item) => item.action !== 'unchanged').length}`)
      if (result.failure) console.error(`失败 ${result.failure.type}.${result.failure.key}: ${result.failure.message}`)
    })
    if (result.status === 'blocked') process.exitCode = 3
    else if (result.status === 'failed') process.exitCode = 4
  })

program.command('clear')
  .description('规划或清理指定模块声明的自定义集合')
  .requiredOption('--module <id>', '目标模块')
  .option('--confirm', '执行真实删除')
  .option('--scope <id>', '真实删除时必须与 module 完全一致')
  .action(async (options: { module: string; confirm?: boolean; scope?: string }) => {
    const result = await clearCommand(commandContext(), options)
    output({ command: 'clear', ok: result.status === 'planned' || result.status === 'success', ...result }, () => {
      console.log(`Clear ${result.module}：${result.status}${result.dryRun ? ' (dry-run)' : ''}`)
      for (const item of result.operations) console.log(`  delete ${item.resourceType} ${item.resource}`)
      if (result.reason) console.error(`阻断：${result.reason}`)
      for (const failure of result.failures) console.error(`失败 ${failure.resource}: ${failure.message}`)
    })
    if (result.status === 'blocked') process.exitCode = 3
    else if (result.status === 'failed') process.exitCode = 4
  })

program.showHelpAfterError()

try {
  await program.parseAsync(process.argv)
} catch (error) {
  const details = error instanceof DskError ? error.details : []
  const payload = { ok: false, code: error instanceof DskError ? error.code : 'INTERNAL_ERROR', message: error instanceof Error ? error.message : String(error), details }
  if (program.opts<{ format: string }>().format === 'json') console.log(JSON.stringify(payload))
  else {
    console.error(payload.message)
    for (const detail of details) console.error(`  - ${detail}`)
  }
  process.exitCode = exitCode(error)
}

function commandContext(): CommandContext {
  const options = program.opts<{ cwd: string; config?: string }>()
  return {
    cwd: path.resolve(options.cwd),
    packageVersion,
    ...(options.config ? { configPath: options.config } : {}),
  }
}

function output(value: object, textOutput: () => void): void {
  if (program.opts<{ format: string }>().format === 'json') console.log(JSON.stringify(value))
  else textOutput()
}

function exitCode(error: unknown): number {
  if (!(error instanceof DskError)) return 4
  if (error.code === 'CONFIG_ERROR') return 5
  return 2
}

function display(value: unknown): string {
  const result = JSON.stringify(value)
  return result === undefined ? '(未设置)' : result
}
