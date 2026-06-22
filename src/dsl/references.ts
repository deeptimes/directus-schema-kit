import type { EnvReference, ResourceReference, SystemResourceKey, SystemResourceReference } from '../types.js'

const referencePattern = /^[a-zA-Z][a-zA-Z0-9_.-]*$/

export function env(name: string): EnvReference {
  if (!/^[A-Z_][A-Z0-9_]*$/.test(name)) {
    throw new Error(`无效的环境变量名: ${name}`)
  }
  return { $env: name }
}

export function ref(key: string): ResourceReference {
  if (!referencePattern.test(key)) {
    throw new Error(`无效的资源引用: ${key}`)
  }
  return { $ref: key }
}

export function systemRef(key: SystemResourceKey): SystemResourceReference {
  if (key !== 'policies.public') {
    throw new Error(`不支持的系统资源引用: ${String(key)}`)
  }
  return { $system: key }
}
