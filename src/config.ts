import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { Ajv, type ErrorObject } from 'ajv'
import { DskError } from './errors.js'
import type { DskConfig } from './types.js'

export const defaultConfig: DskConfig = {
  schemaVersion: 1,
  paths: {
    schemaSource: 'schemas/**/*.ts',
    resourceSource: 'resources/**/*.ts',
    seeds: 'seeds/**/*.json',
    manifest: 'generated/manifest.json',
  },
  env: {
    file: '../.env',
    allowedVariables: ['DIRECTUS_URL', 'DIRECTUS_TOKEN'],
  },
  validation: {
    requireChineseTranslations: false,
  },
  safety: {
    clearEnabled: true,
  },
}

export const configJsonSchema = {
  $id: 'https://deeptimes.dev/dsk/config.schema.json',
  type: 'object',
  additionalProperties: false,
  required: ['schemaVersion', 'paths'],
  properties: {
    schemaVersion: { const: 1 },
    paths: {
      type: 'object', additionalProperties: false,
      required: ['schemaSource', 'resourceSource', 'seeds', 'manifest'],
      properties: {
        schemaSource: { type: 'string', minLength: 1 },
        resourceSource: { type: 'string', minLength: 1 },
        seeds: { type: 'string', minLength: 1 },
        manifest: { type: 'string', minLength: 1 },
      },
    },
    env: {
      type: 'object', additionalProperties: false,
      properties: {
        file: { type: 'string', minLength: 1 },
        allowedVariables: { type: 'array', uniqueItems: true, items: { type: 'string', pattern: '^[A-Z_][A-Z0-9_]*$' } },
      },
    },
    validation: {
      type: 'object', additionalProperties: false,
      properties: { requireChineseTranslations: { type: 'boolean' } },
    },
    safety: {
      type: 'object', additionalProperties: false,
      properties: { clearEnabled: { type: 'boolean' } },
    },
  },
} as const

export interface LoadedConfig {
  config: DskConfig
  path: string
  directory: string
}

export function loadConfig(projectRoot: string, customPath?: string): LoadedConfig {
  const configPath = path.resolve(projectRoot, customPath ?? 'dsk/config.json')
  if (!existsSync(configPath)) {
    throw new DskError(`配置文件不存在: ${configPath}`, 'CONFIG_ERROR', ['请先运行 dsk init'])
  }

  let value: unknown
  try {
    value = JSON.parse(readFileSync(configPath, 'utf8'))
  } catch (error) {
    throw new DskError(`配置文件不是有效 JSON: ${configPath}`, 'CONFIG_ERROR', [error instanceof Error ? error.message : String(error)])
  }

  const ajv = new Ajv({ allErrors: true, strict: true })
  const validate = ajv.compile(configJsonSchema)
  if (!validate(value)) {
    throw new DskError(`配置文件校验失败: ${configPath}`, 'CONFIG_ERROR', formatAjvErrors(validate.errors))
  }
  return { config: value as DskConfig, path: configPath, directory: path.dirname(configPath) }
}

export function formatAjvErrors(errors: ErrorObject[] | null | undefined): string[] {
  return (errors ?? []).map((error) => `${error.instancePath || '/'} ${error.message ?? '校验失败'}`)
}
