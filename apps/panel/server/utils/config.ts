import { timingSafeEqual } from 'node:crypto'
import type { H3Event } from 'h3'

const REQUIRED = ['adminPassword', 'sessionSecret', 'internalToken', 'mcpToken', 'encryptionKey'] as const
type SecretName = typeof REQUIRED[number]

/** Nuxt parses environment values, so an all-digit secret arrives as a number. */
export function secret (name: SecretName): string {
  const value = useRuntimeConfig()[name] as unknown
  return value === undefined || value === null ? '' : String(value)
}

export function assertConfig (): void {
  const missing = REQUIRED.filter(key => !secret(key))
  if (missing.length) throw new Error(`missing configuration: ${missing.map(k => `NUXT_${k.replace(/[A-Z]/g, c => `_${c}`).toUpperCase()}`).join(', ')}`)
  if (secret('sessionSecret').length < 32) throw new Error('NUXT_SESSION_SECRET must be at least 32 characters')
}

export function safeEqual (a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

export function hasBearer (event: H3Event, token: string): boolean {
  return safeEqual(getRequestHeader(event, 'authorization') ?? '', `Bearer ${token}`)
}

export function sessionConfig () {
  return { password: secret('sessionSecret'), name: 'mfcp', maxAge: 60 * 60 * 24 * 30, cookie: { sameSite: 'lax' as const } }
}

export function botUrl (id: string): string {
  const config = useRuntimeConfig()
  return config.botUrlTemplate.replace('{id}', id).replace('{namespace}', config.k8s.namespace)
}
