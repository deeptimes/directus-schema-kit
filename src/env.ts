import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { DskError } from './errors.js'
import type { DskConfig } from './types.js'

export function loadProjectEnvironment(config: DskConfig, configDirectory: string): Record<string, string> {
  const values: Record<string, string> = {}
  const envPath = path.resolve(configDirectory, config.env?.file ?? '../.env')
  if (existsSync(envPath)) {
    for (const rawLine of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const line = rawLine.trim()
      if (!line || line.startsWith('#')) continue
      const separator = line.indexOf('=')
      if (separator < 1) continue
      const key = line.slice(0, separator).trim()
      const rawValue = line.slice(separator + 1).trim()
      values[key] = unquote(rawValue)
    }
  }
  for (const name of config.env?.allowedVariables ?? []) {
    if (process.env[name] !== undefined) values[name] = process.env[name]
  }
  return values
}

export function directusConnection(config: DskConfig, configDirectory: string): { url: string; token?: string } {
  const environment = loadProjectEnvironment(config, configDirectory)
  const rawUrl = environment.DIRECTUS_URL
  if (!rawUrl) throw new DskError('缺少 DIRECTUS_URL', 'CONFIG_ERROR', ['请在 Directus 项目的 .env 或 shell 环境中配置'])
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new DskError('DIRECTUS_URL 不是有效 URL', 'CONFIG_ERROR')
  }
  if (!['http:', 'https:'].includes(url.protocol) || !isLocalHostname(url.hostname)) {
    throw new DskError(`拒绝连接非本地 Directus 地址: ${url.origin}`, 'CONFIG_ERROR', ['V1 plan 仅允许回环、私网或 .local 开发实例'])
  }
  const normalized = url.toString().replace(/\/$/, '')
  return { url: normalized, ...(environment.DIRECTUS_TOKEN ? { token: environment.DIRECTUS_TOKEN } : {}) }
}

function isLocalHostname(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '::1' || hostname.endsWith('.local')) return true
  if (/^127\./.test(hostname) || /^10\./.test(hostname) || /^192\.168\./.test(hostname)) return true
  const match = /^172\.(\d+)\./.exec(hostname)
  return match !== null && Number(match[1]) >= 16 && Number(match[1]) <= 31
}

function unquote(value: string): string {
  if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
    return value.slice(1, -1)
  }
  return value
}
