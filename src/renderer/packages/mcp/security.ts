import type { Settings } from '@shared/types'
import { redactSensitiveText } from '@shared/utils/redact'
import type { MCPServerConfig } from './types'

const MAX_REMOTE_URL_LENGTH = 4096
const MAX_REMOTE_HEADER_COUNT = 64
const MAX_REMOTE_HEADER_NAME_LENGTH = 256
const MAX_REMOTE_HEADER_VALUE_LENGTH = 8192
const MAX_RESULT_DEPTH = 8
const MAX_RESULT_ARRAY_ITEMS = 200
const MAX_RESULT_TEXT_LENGTH = 50_000

const SENSITIVE_KEY_PATTERN =
  /(?:^|[-_\s])(api[-_\s]?key|authorization|bearer|cookie|credential|license(?:[-_\s]?key)?|password|private[-_\s]?key|secret|session[-_\s]?token|token)(?:$|[-_\s])/i

const BLOCKED_HEADER_NAMES = new Set([
  'connection',
  'content-length',
  'cookie',
  'host',
  'origin',
  'proxy-authorization',
  'referer',
  'set-cookie',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
])

export type McpDnsLookup = (hostname: string) => Promise<ReadonlyArray<{ address: string; family: number }>>

function isSensitiveKey(key: string): boolean {
  // Settings use both snake/kebab-case and camelCase (for example `apiKey`).
  // Normalize a camel-case boundary before applying the shared key pattern so
  // a secret is not exposed merely because its field uses JavaScript casing.
  const normalized = key.replace(/([a-z0-9])([A-Z])/g, '$1-$2')
  return SENSITIVE_KEY_PATTERN.test(normalized)
}

function isBlockedIpv4(hostname: string): boolean {
  const octets = hostname.split('.').map(Number)
  if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) {
    return false
  }
  const [a, b] = octets
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  )
}

function isBlockedIpv6(hostname: string): boolean {
  const normalized = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (!normalized.includes(':')) return false
  const parts = normalized.split('::')
  if (parts.length > 2) return false

  const parseHextets = (part: string): number[] | undefined => {
    if (!part) return []
    const values = part.split(':')
    const result: number[] = []
    for (const value of values) {
      if (!value) return undefined
      if (value.includes('.')) {
        const octets = value.split('.').map(Number)
        if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
          return undefined
        }
        result.push((octets[0] << 8) | octets[1], (octets[2] << 8) | octets[3])
        continue
      }
      if (!/^[0-9a-f]{1,4}$/.test(value)) return undefined
      result.push(Number.parseInt(value, 16))
    }
    return result
  }

  const left = parseHextets(parts[0])
  const right = parseHextets(parts[1] ?? '')
  if (!left || !right) return false
  const hextets = parts.length === 2 ? [...left, ...Array(8 - left.length - right.length).fill(0), ...right] : left
  if (hextets.length !== 8) return false

  if (hextets.every((value) => value === 0) || hextets.slice(0, 7).every((value) => value === 0 && hextets[7] === 1)) {
    return true
  }
  const first = hextets[0]
  if ((first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80) return true
  if (first === 0x2001 && hextets[1] === 0x0db8) return true

  if (hextets.slice(0, 5).every((value) => value === 0) && hextets[5] === 0xffff) {
    const mappedIpv4 = `${hextets[6] >> 8}.${hextets[6] & 255}.${hextets[7] >> 8}.${hextets[7] & 255}`
    return isBlockedIpv4(mappedIpv4)
  }
  return false
}

export function validateRemoteMcpUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim()
  if (!trimmed || trimmed.length > MAX_REMOTE_URL_LENGTH) {
    throw new Error('Enter a valid remote MCP URL.')
  }

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    throw new Error('Enter a valid remote MCP URL.')
  }

  if (url.protocol !== 'https:') {
    throw new Error('Remote MCP servers must use HTTPS.')
  }
  if (url.username || url.password) {
    throw new Error('Put authentication in an HTTP header instead of URL user information.')
  }

  const hostname = url.hostname.toLowerCase()
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.lan') ||
    isBlockedIpv4(hostname) ||
    isBlockedIpv6(hostname)
  ) {
    throw new Error('Remote MCP servers must use a public HTTPS address.')
  }

  url.hash = ''
  return url.toString()
}

/**
 * Validate the URL and, when a native resolver is available, verify every DNS
 * answer before opening a connection. The check is repeated by the transport
 * fetch wrapper to detect DNS changes between MCP requests.
 */
export async function validateRemoteMcpUrlWithDns(rawUrl: string, lookup?: McpDnsLookup): Promise<string> {
  const normalized = validateRemoteMcpUrl(rawUrl)
  const url = new URL(normalized)
  if (isBlockedIpv4(url.hostname) || isBlockedIpv6(url.hostname)) return normalized

  if (!lookup) return normalized
  let addresses: ReadonlyArray<{ address: string; family: number }>
  try {
    addresses = await lookup(url.hostname)
  } catch {
    throw new Error('Remote MCP hostname could not be resolved.')
  }
  if (addresses.length === 0) return normalized
  if (addresses.some(({ address }) => isBlockedIpv4(address) || isBlockedIpv6(address))) {
    throw new Error('Remote MCP servers must use a public HTTPS address.')
  }
  return normalized
}

export function normalizeMcpHeaders(headers?: Record<string, string>): Record<string, string> | undefined {
  if (!headers) return undefined
  const entries = Object.entries(headers)
  if (entries.length > MAX_REMOTE_HEADER_COUNT) {
    throw new Error(`Remote MCP servers may provide at most ${MAX_REMOTE_HEADER_COUNT} headers.`)
  }
  const normalized: Record<string, string> = {}
  for (const [rawName, rawValue] of entries) {
    const name = rawName.trim()
    const value = rawValue.trim()
    if (
      !name ||
      !value ||
      name.length > MAX_REMOTE_HEADER_NAME_LENGTH ||
      value.length > MAX_REMOTE_HEADER_VALUE_LENGTH ||
      /[\r\n]/.test(name) ||
      /[\r\n]/.test(value) ||
      !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name)
    )
      continue
    if (BLOCKED_HEADER_NAMES.has(name.toLowerCase())) continue
    normalized[name] = value
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined
}

function addSecret(secrets: Set<string>, value: unknown): void {
  if (typeof value !== 'string') return
  const trimmed = value.trim()
  if (trimmed.length >= 8) secrets.add(trimmed)
}

function collectSettingsSecrets(value: unknown, secrets: Set<string>, key = '', depth = 0): void {
  if (depth > MAX_RESULT_DEPTH || value === null || value === undefined) return
  if (typeof value === 'string') {
    if (isSensitiveKey(key)) addSecret(secrets, value)
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) collectSettingsSecrets(item, secrets, key, depth + 1)
    return
  }
  if (typeof value !== 'object') return
  for (const [childKey, childValue] of Object.entries(value)) {
    collectSettingsSecrets(childValue, secrets, childKey, depth + 1)
  }
}

function collectUrlSecrets(rawUrl: string, secrets: Set<string>): void {
  addSecret(secrets, rawUrl)
  try {
    const url = new URL(rawUrl)
    addSecret(secrets, url.username)
    addSecret(secrets, url.password)
    for (const value of url.searchParams.values()) addSecret(secrets, value)
    for (const segment of url.pathname.split('/')) {
      if (segment.length >= 16 && /[0-9_-]/.test(segment)) addSecret(secrets, segment)
    }
  } catch {
    // URL validation reports malformed input before a connection is attempted.
  }
}

export function collectKnownMcpSecrets(settings: Settings, serverConfig: MCPServerConfig): string[] {
  const secrets = new Set<string>()
  // These values are held at the settings root rather than under providers or
  // extension. Add their values explicitly so arbitrary license strings are
  // masked even when they do not resemble a known API-key prefix.
  addSecret(secrets, settings.licenseKey)
  addSecret(secrets, settings.memorizedManualLicenseKey)
  for (const value of Object.values(settings.lastSelectedLicenseByUser ?? {})) addSecret(secrets, value)
  for (const [license, instance] of Object.entries(settings.licenseInstances ?? {})) {
    addSecret(secrets, license)
    addSecret(secrets, instance)
  }
  addSecret(secrets, settings.vibedropPublishKey?.key)
  collectSettingsSecrets(settings.providers, secrets)
  collectSettingsSecrets(settings.customProviders, secrets)
  collectSettingsSecrets(settings.extension, secrets)
  if (serverConfig.transport.type === 'http') {
    collectUrlSecrets(serverConfig.transport.url, secrets)
    for (const value of Object.values(serverConfig.transport.headers ?? {})) addSecret(secrets, value)
  }
  return [...secrets].sort((a, b) => b.length - a.length)
}

function containsKnownSecret(text: string, secrets: string[]): boolean {
  return secrets.some((secret) => text.includes(secret))
}

function looksLikeCredential(text: string): boolean {
  return (
    /\bBearer\s+[A-Za-z0-9._~-]{8,}/i.test(text) ||
    /\bsk-[A-Za-z0-9_-]{8,}\b/.test(text) ||
    /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/.test(text)
  )
}

function inputContainsCredential(value: unknown, secrets: string[], key = '', depth = 0): boolean {
  if (depth > MAX_RESULT_DEPTH || value === null || value === undefined) return false
  if (typeof value === 'string') {
    return isSensitiveKey(key) || containsKnownSecret(value, secrets) || looksLikeCredential(value)
  }
  if (Array.isArray(value)) return value.some((item) => inputContainsCredential(item, secrets, key, depth + 1))
  if (typeof value !== 'object') return false
  return Object.entries(value).some(([childKey, childValue]) =>
    inputContainsCredential(childValue, secrets, childKey, depth + 1)
  )
}

export function assertMcpToolInputSafe(input: unknown, settings: Settings, serverConfig: MCPServerConfig): void {
  const secrets = collectKnownMcpSecrets(settings, serverConfig)
  if (inputContainsCredential(input, secrets)) {
    throw new Error('The MCP call was blocked because its arguments contain credential-like data.')
  }
}

function redactText(text: string, secrets: string[]): string {
  let redacted = text
  for (const secret of secrets) redacted = redacted.split(secret).join('[REDACTED]')
  redacted = redactSensitiveText(redacted)
  return redacted.length > MAX_RESULT_TEXT_LENGTH
    ? `${redacted.slice(0, MAX_RESULT_TEXT_LENGTH)}\n[truncated]`
    : redacted
}

function redactResultValue(value: unknown, secrets: string[], key = '', depth = 0): unknown {
  if (isSensitiveKey(key)) return '[REDACTED]'
  if (typeof value === 'string') return redactText(value, secrets)
  if (value === null || typeof value !== 'object') return value
  if (depth >= MAX_RESULT_DEPTH) return '[truncated]'
  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_RESULT_ARRAY_ITEMS).map((item) => redactResultValue(item, secrets, key, depth + 1))
    if (value.length > MAX_RESULT_ARRAY_ITEMS) items.push('[truncated]')
    return items
  }
  return Object.fromEntries(
    Object.entries(value).map(([childKey, childValue]) => [
      childKey,
      redactResultValue(childValue, secrets, childKey, depth + 1),
    ])
  )
}

export function redactMcpToolResult<T>(result: T, settings: Settings, serverConfig: MCPServerConfig): T {
  return redactResultValue(result, collectKnownMcpSecrets(settings, serverConfig)) as T
}

export function sanitizeMcpError(error: unknown, serverConfig: MCPServerConfig): Error {
  let message = error instanceof Error ? error.message : String(error)
  if (serverConfig.transport.type === 'http') {
    message = message.split(serverConfig.transport.url).join('[MCP endpoint]')
  }
  message = redactSensitiveText(message).replace(/\[URL\]/g, '[MCP endpoint]')
  return new Error(message || 'Remote MCP request failed.')
}

export function getMcpEndpointLabel(serverConfig: MCPServerConfig): string {
  if (serverConfig.transport.type !== 'http') return 'local'
  try {
    return new URL(serverConfig.transport.url).host
  } catch {
    return 'invalid endpoint'
  }
}
