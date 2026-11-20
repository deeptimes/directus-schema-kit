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

export const defaultAllowedHostRules = [
  'localhost',
  '127.0.0.0/8',
  '::1',
  '10.0.0.0/8',
  '192.168.0.0/16',
  '*.local',
] as const

export interface HostPolicy {
  allowed: boolean
  matchedRule: string | null
  reason?: string
}

export function assertDevelopmentEnvironment(config: DskConfig): void {
  if (config.safety?.environment !== 'development') {
    throw new DskError('拒绝连接：safety.environment 必须显式为 development', 'CONFIG_ERROR', [
      '请在 dsk/config.json 的 safety.environment 设置为 "development"',
      'DSK 只允许本地开发实例；生产、预发布和测试环境由 d6s 发布',
    ])
  }
}

export function resolveHostPolicy(hostname: string, allowedHosts: string[] = []): HostPolicy {
  const host = normalizeHostname(hostname)
  validateAllowedHosts(allowedHosts)

  if (host === 'localhost') return { allowed: true, matchedRule: 'localhost' }
  if (host.endsWith('.local')) return { allowed: true, matchedRule: '*.local' }
  if (host === '::1') return { allowed: true, matchedRule: '::1' }

  const ip = parseIPv4(host)
  if (ip !== null) {
    if (matchesCidr(ip, '127.0.0.0/8')) return { allowed: true, matchedRule: '127.0.0.0/8' }
    if (matchesCidr(ip, '10.0.0.0/8')) return { allowed: true, matchedRule: '10.0.0.0/8' }
    if (matchesCidr(ip, '192.168.0.0/16')) return { allowed: true, matchedRule: '192.168.0.0/16' }
    for (const entry of allowedHosts) {
      const rule = normalizeAllowedRule(entry)
      if (rule && matchesAllowedRule(ip, rule)) return { allowed: true, matchedRule: entry }
    }
    if (matchesCidr(ip, '172.16.0.0/12')) {
      return { allowed: false, matchedRule: null, reason: '172.16.0.0/12 默认不放开；需要时在 safety.allowedHosts 显式加入' }
    }
    return { allowed: false, matchedRule: null, reason: '公网 IPv4 地址始终拒绝' }
  }

  return {
    allowed: false,
    matchedRule: null,
    reason: '只允许 localhost、loopback、10/8、192.168/16、.local 或显式 allowedHosts 私网地址',
  }
}

export function directusConnection(config: DskConfig, configDirectory: string): { url: string; token?: string; databaseClient?: string } {
  const environment = loadProjectEnvironment(config, configDirectory)
  const rawUrl = environment.PUBLIC_URL
  if (!rawUrl) throw new DskError('缺少 PUBLIC_URL', 'CONFIG_ERROR', ['请在 Directus 项目的 .env 或 shell 环境中配置'])
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new DskError('PUBLIC_URL 不是有效 URL', 'CONFIG_ERROR')
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new DskError(`拒绝连接不支持的 Directus 协议: ${url.protocol}`, 'CONFIG_ERROR', ['只允许 http / https'])
  }
  assertDevelopmentEnvironment(config)
  const policy = resolveHostPolicy(url.hostname, config.safety?.allowedHosts ?? [])
  if (!policy.allowed) {
    throw new DskError(`拒绝连接非开发 Directus 地址: ${url.origin}`, 'CONFIG_ERROR', [
      ...(policy.reason ? [policy.reason] : []),
      `默认允许：${defaultAllowedHostRules.join('、')}`,
      '其他私网地址在 dsk/config.json 的 safety.allowedHosts 显式加入；公网地址始终拒绝',
    ])
  }
  const normalized = url.toString().replace(/\/$/, '')
  return {
    url: normalized,
    ...(environment.ADMIN_TOKEN ? { token: environment.ADMIN_TOKEN } : {}),
    ...(environment.DB_CLIENT ? { databaseClient: environment.DB_CLIENT.toLowerCase() } : {}),
  }
}

type AllowedRule =
  | { kind: 'name'; value: string }
  | { kind: 'ip'; ip: number }
  | { kind: 'cidr'; base: number; prefix: number }

function normalizeAllowedRule(value: string): AllowedRule | null {
  const text = value.trim().toLowerCase()
  if (text === 'localhost' || text === '::1' || text === '.local' || text === '*.local') return { kind: 'name', value: text }
  const cidr = parseCidr(text)
  if (cidr) return { kind: 'cidr', ...cidr }
  const ip = parseIPv4(text)
  if (ip !== null) return { kind: 'ip', ip }
  return null
}

export function validateAllowedHosts(allowedHosts: string[]): void {
  for (const raw of allowedHosts) {
    const rule = normalizeAllowedRule(raw)
    if (!rule) {
      throw new DskError(`safety.allowedHosts 含无效条目: ${raw}`, 'CONFIG_ERROR', [
        '只允许 localhost、*.local、IPv4 地址或 IPv4 CIDR',
      ])
    }
    if (rule.kind === 'name') {
      if (rule.value !== 'localhost' && rule.value !== '::1' && rule.value !== '.local' && rule.value !== '*.local') {
        throw new DskError(`safety.allowedHosts 不允许公网主机名: ${raw}`, 'CONFIG_ERROR', ['请使用私网 IP / CIDR，或 *.local'])
      }
      continue
    }
    if (rule.kind === 'ip' && !isPrivateIPv4(rule.ip)) {
      throw new DskError(`safety.allowedHosts 不允许公网地址: ${raw}`, 'CONFIG_ERROR', ['只允许 loopback 或 RFC1918 私网地址'])
    }
    if (rule.kind === 'cidr' && !isPrivateCidr(rule.base, rule.prefix)) {
      throw new DskError(`safety.allowedHosts 不允许公网或过宽网段: ${raw}`, 'CONFIG_ERROR', [
        'CIDR 必须完整落在一个私网段内，例如 10.0.0.0/24、192.168.1.0/24、172.16.0.0/24',
      ])
    }
  }
}

function matchesAllowedRule(ip: number, rule: AllowedRule): boolean {
  if (rule.kind === 'ip') return ip === rule.ip
  if (rule.kind === 'cidr') return matchesCidr(ip, ruleToCidr(rule))
  return false
}

function ruleToCidr(rule: Extract<AllowedRule, { kind: 'cidr' }>): string {
  return `${ipv4ToString(rule.base)}/${rule.prefix}`
}

function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '')
}

function parseIPv4(value: string): number | null {
  const parts = value.split('.')
  if (parts.length !== 4) return null
  const octets: number[] = []
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null
    const octet = Number(part)
    if (octet < 0 || octet > 255) return null
    octets.push(octet)
  }
  return (((octets[0]! << 24) | (octets[1]! << 16) | (octets[2]! << 8) | octets[3]!) >>> 0)
}

function parseCidr(value: string): { base: number; prefix: number } | null {
  const separator = value.indexOf('/')
  if (separator < 1) return null
  const base = parseIPv4(value.slice(0, separator))
  if (base === null) return null
  const prefixText = value.slice(separator + 1)
  if (!/^\d{1,2}$/.test(prefixText)) return null
  const prefix = Number(prefixText)
  if (prefix < 0 || prefix > 32) return null
  return { base, prefix }
}

function matchesCidr(ip: number, cidr: string): boolean {
  const parsed = parseCidr(cidr)
  if (!parsed) return false
  const inverted = 32 - parsed.prefix
  const mask = inverted === 32 ? 0 : ((0xffffffff << inverted) >>> 0)
  return ((ip & mask) >>> 0) === ((parsed.base & mask) >>> 0)
}

function isPrivateIPv4(ip: number): boolean {
  return matchesCidr(ip, '127.0.0.0/8')
    || matchesCidr(ip, '10.0.0.0/8')
    || matchesCidr(ip, '172.16.0.0/12')
    || matchesCidr(ip, '192.168.0.0/16')
}

function isPrivateCidr(base: number, prefix: number): boolean {
  const blocks = [
    { cidr: '127.0.0.0/8', prefix: 8 },
    { cidr: '10.0.0.0/8', prefix: 8 },
    { cidr: '172.16.0.0/12', prefix: 12 },
    { cidr: '192.168.0.0/16', prefix: 16 },
  ]
  return blocks.some((block) => prefix >= block.prefix && matchesCidr(base, block.cidr))
}

function ipv4ToString(ip: number): string {
  return [24, 16, 8, 0].map((shift) => (ip >>> shift) & 255).join('.')
}

function unquote(value: string): string {
  if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
    return value.slice(1, -1)
  }
  return value
}
