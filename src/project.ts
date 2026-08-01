import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { DskError } from './errors.js'

export interface DirectusProject {
  root: string
  packageJsonPath: string
  packageJson: Record<string, unknown>
  directusVersion: string
}

export const supportedDirectusMajorVersions = [11, 12] as const
export const supportedDirectusVersion = supportedDirectusMajorVersions.map(String).join('.x、') + '.x'

export function discoverDirectusProject(startDirectory: string): DirectusProject {
  let current = path.resolve(startDirectory)

  while (true) {
    const packageJsonPath = path.join(current, 'package.json')
    if (existsSync(packageJsonPath)) {
      const packageJson = readPackageJson(packageJsonPath)
      const directusVersion = findDirectusVersion(packageJson)
      if (directusVersion) {
        const installedVersion = installedDirectusVersion(current)
        const effectiveVersion = installedVersion ?? normalizeDeclaredVersion(directusVersion)
        if (!isSupportedDirectusVersion(effectiveVersion)) {
          throw new DskError(
            `不支持 Directus ${installedVersion ?? directusVersion}`, 'CONFIG_ERROR',
            [`当前仅支持 Directus ${supportedDirectusVersion}`],
          )
        }
        return { root: current, packageJsonPath, packageJson, directusVersion: effectiveVersion }
      }
    }

    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }

  throw new DskError(
    `无法从 ${path.resolve(startDirectory)} 向上识别 Directus 项目`,
    'CONFIG_ERROR',
    ['请确认 package.json 的 dependencies 或 devDependencies 包含 directus'],
  )
}

function installedDirectusVersion(projectRoot: string): string | null {
  const file = path.join(projectRoot, 'node_modules/directus/package.json')
  if (!existsSync(file)) return null
  const value = readPackageJson(file).version
  return typeof value === 'string' ? value : null
}

function normalizeDeclaredVersion(value: string): string {
  const match = /(?:^|[\s~^>=<|])((?:11|12)\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)(?=$|[\s|])/.exec(value)
  return match?.[1] ?? value
}

function isSupportedDirectusVersion(value: string): boolean {
  const match = /^(\d+)\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.exec(value)
  return match !== null && supportedDirectusMajorVersions.includes(Number(match[1]) as typeof supportedDirectusMajorVersions[number])
}

function readPackageJson(filePath: string): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as Record<string, unknown>
  } catch (error) {
    throw new DskError(`无法读取 ${filePath}: ${error instanceof Error ? error.message : String(error)}`, 'CONFIG_ERROR')
  }
}

function findDirectusVersion(packageJson: Record<string, unknown>): string | null {
  for (const section of ['dependencies', 'devDependencies']) {
    const dependencies = packageJson[section]
    if (dependencies && typeof dependencies === 'object' && !Array.isArray(dependencies)) {
      const version = (dependencies as Record<string, unknown>).directus
      if (typeof version === 'string') return version
    }
  }
  return null
}
