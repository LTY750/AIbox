export type MobileSettingsRecord = Record<string, unknown>

/** Single registry for every setting path stored outside SQLite. */
export const MOBILE_SETTINGS_SECRET_PATHS = [
  'licenseKey',
  'licenseInstances',
  'lastSelectedLicenseByUser',
  'memorizedManualLicenseKey',
  'vibedropPublishKey',
  'providers.*.apiKey',
  'providers.*.accessKey',
  'providers.*.secretKey',
  'providers.*.sessionToken',
  'providers.*.oauth.accessToken',
  'providers.*.oauth.refreshToken',
  'extension.documentParser.llamaParse.apiKey',
  'extension.documentParser.mineru.apiToken',
  'extension.documentParser.textin.appId',
  'extension.documentParser.textin.secretCode',
  'extension.documentParser.doc2x.apiKey',
  'extension.webSearch.tavilyApiKey',
  'extension.webSearch.bochaApiKey',
  'extension.webSearch.queritApiKey',
  'customProviders.*.defaultSettings.apiKey',
  'customProviders.*.defaultSettings.accessKey',
  'customProviders.*.defaultSettings.secretKey',
  'customProviders.*.defaultSettings.sessionToken',
  'customProviders.*.defaultSettings.oauth.accessToken',
  'customProviders.*.defaultSettings.oauth.refreshToken',
  'mcp.servers.*.transport.url',
  'mcp.servers.*.transport.headers',
] as const

export const MCP_TRANSPORT_SECRETS_KEY = 'mcp.transportSecrets'

const BLOCKED_PATH_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype'])

const PROVIDER_SECRET_FIELDS = ['apiKey', 'accessKey', 'secretKey', 'sessionToken'] as const
const OAUTH_SECRET_FIELDS = ['accessToken', 'refreshToken'] as const
const PARSER_SECRET_FIELDS = {
  llamaParse: ['apiKey'],
  mineru: ['apiToken'],
  textin: ['appId', 'secretCode'],
  doc2x: ['apiKey'],
} as const
const WEB_SEARCH_SECRET_FIELDS = ['tavilyApiKey', 'bochaApiKey', 'queritApiKey'] as const

function asRecord(value: unknown): MobileSettingsRecord | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as MobileSettingsRecord) : undefined
}

function customProviderSecretPrefix(provider: MobileSettingsRecord, index: number): string {
  const id = typeof provider.id === 'string' && provider.id ? provider.id : `index-${index}`
  return `customProviders.${id}.defaultSettings`
}

export function extractSettingsSecrets(settings: MobileSettingsRecord): Record<string, unknown> {
  const secrets: Record<string, unknown> = {}
  for (const field of ['licenseKey', 'memorizedManualLicenseKey', 'vibedropPublishKey'] as const) {
    const value = settings[field]
    if (value !== undefined && value !== null && value !== '') secrets[field] = value
  }
  const selectedLicenses = asRecord(settings.lastSelectedLicenseByUser)
  if (selectedLicenses && Object.keys(selectedLicenses).length > 0) {
    secrets.lastSelectedLicenseByUser = Object.fromEntries(
      Object.entries(selectedLicenses).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    )
  }
  const licenseInstances = asRecord(settings.licenseInstances)
  if (licenseInstances && Object.keys(licenseInstances).length > 0) {
    secrets.licenseInstances = Object.fromEntries(
      Object.entries(licenseInstances).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    )
  }
  const providers = asRecord(settings.providers)
  for (const [providerId, providerValue] of Object.entries(providers ?? {})) {
    const provider = asRecord(providerValue)
    if (!provider) continue
    for (const field of PROVIDER_SECRET_FIELDS) {
      if (typeof provider[field] === 'string' && provider[field])
        secrets[`providers.${providerId}.${field}`] = provider[field]
    }
    const oauth = asRecord(provider.oauth)
    for (const field of OAUTH_SECRET_FIELDS) {
      if (typeof oauth?.[field] === 'string' && oauth[field])
        secrets[`providers.${providerId}.oauth.${field}`] = oauth[field]
    }
  }
  const parser = asRecord(asRecord(settings.extension)?.documentParser)
  for (const [section, fields] of Object.entries(PARSER_SECRET_FIELDS)) {
    const sectionRecord = asRecord(parser?.[section])
    for (const field of fields) {
      const value = sectionRecord?.[field]
      if (typeof value === 'string' && value) secrets[`extension.documentParser.${section}.${field}`] = value
    }
  }
  const webSearch = asRecord(asRecord(settings.extension)?.webSearch)
  for (const field of WEB_SEARCH_SECRET_FIELDS) {
    const value = webSearch?.[field]
    if (typeof value === 'string' && value) secrets[`extension.webSearch.${field}`] = value
  }
  const customProviders = settings.customProviders
  if (Array.isArray(customProviders)) {
    for (const [index, providerValue] of customProviders.entries()) {
      const provider = asRecord(providerValue)
      if (!provider) continue
      const defaultSettings = asRecord(asRecord(providerValue)?.defaultSettings)
      const prefix = customProviderSecretPrefix(provider, index)
      for (const field of PROVIDER_SECRET_FIELDS) {
        const value = defaultSettings?.[field]
        if (typeof value === 'string' && value) secrets[`${prefix}.${field}`] = value
      }
      const oauth = asRecord(defaultSettings?.oauth)
      for (const field of OAUTH_SECRET_FIELDS) {
        const value = oauth?.[field]
        if (typeof value === 'string' && value) secrets[`${prefix}.oauth.${field}`] = value
      }
    }
  }
  const mcpServers = asRecord(settings.mcp)?.servers
  if (Array.isArray(mcpServers)) {
    const transportSecrets: Record<string, { headers?: Record<string, string>; url: string }> = {}
    for (const serverValue of mcpServers) {
      const server = asRecord(serverValue)
      const transport = asRecord(server?.transport)
      if (typeof server?.id !== 'string' || transport?.type !== 'http' || typeof transport.url !== 'string') continue
      const headers = asRecord(transport.headers)
      transportSecrets[server.id] = {
        url: transport.url,
        ...(headers
          ? {
              headers: Object.fromEntries(
                Object.entries(headers).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
              ),
            }
          : {}),
      }
    }
    if (Object.keys(transportSecrets).length > 0) secrets[MCP_TRANSPORT_SECRETS_KEY] = transportSecrets
  }
  return secrets
}

export function removeSettingsSecrets(settings: MobileSettingsRecord): MobileSettingsRecord {
  const sanitized = structuredClone(settings)
  for (const field of [
    'licenseKey',
    'licenseInstances',
    'lastSelectedLicenseByUser',
    'memorizedManualLicenseKey',
    'vibedropPublishKey',
  ]) {
    delete sanitized[field]
  }
  const providers = asRecord(sanitized.providers)
  for (const providerValue of Object.values(providers ?? {})) {
    const provider = asRecord(providerValue)
    if (!provider) continue
    for (const field of PROVIDER_SECRET_FIELDS) delete provider[field]
    const oauth = asRecord(provider.oauth)
    if (oauth) for (const field of OAUTH_SECRET_FIELDS) delete oauth[field]
  }
  const parser = asRecord(asRecord(sanitized.extension)?.documentParser)
  for (const section of Object.keys(PARSER_SECRET_FIELDS)) {
    const sectionRecord = asRecord(parser?.[section])
    if (sectionRecord) {
      for (const field of PARSER_SECRET_FIELDS[section as keyof typeof PARSER_SECRET_FIELDS])
        delete sectionRecord[field]
    }
  }
  const webSearch = asRecord(asRecord(sanitized.extension)?.webSearch)
  for (const field of WEB_SEARCH_SECRET_FIELDS) {
    if (webSearch) delete webSearch[field]
  }
  const customProviders = sanitized.customProviders
  if (Array.isArray(customProviders)) {
    for (const providerValue of customProviders) {
      const defaultSettings = asRecord(asRecord(providerValue)?.defaultSettings)
      if (!defaultSettings) continue
      for (const field of PROVIDER_SECRET_FIELDS) delete defaultSettings[field]
      const oauth = asRecord(defaultSettings.oauth)
      if (oauth) for (const field of OAUTH_SECRET_FIELDS) delete oauth[field]
    }
  }
  const mcpServers = asRecord(sanitized.mcp)?.servers
  if (Array.isArray(mcpServers)) {
    const supportedServers = [] as unknown[]
    for (const serverValue of mcpServers) {
      const transport = asRecord(asRecord(serverValue)?.transport)
      if (transport?.type === 'http') {
        transport.url = ''
        delete transport.headers
        supportedServers.push(serverValue)
      }
    }
    // Local stdio MCP is unsupported on mobile. Drop legacy entries entirely
    // so commands, arguments, and environment values cannot leak into the
    // SQLite-backed settings snapshot or mobile backups.
    const mcp = asRecord(sanitized.mcp)
    if (mcp) mcp.servers = supportedServers
  }
  return sanitized
}

export function restoreSettingsSecrets(
  settings: MobileSettingsRecord,
  secrets: Record<string, unknown>
): MobileSettingsRecord {
  const restored = structuredClone(settings)
  for (const [path, secret] of Object.entries(secrets)) {
    if (path === MCP_TRANSPORT_SECRETS_KEY) continue
    if (path.startsWith('customProviders.')) {
      const match = path.match(/^customProviders\.([^.]+)\.defaultSettings\.(.+)$/)
      const customProviders = restored.customProviders
      if (match && Array.isArray(customProviders)) {
        const [, providerId, fieldPath] = match
        const providerIndex = customProviders.findIndex((value, index) => {
          const provider = asRecord(value)
          return (
            provider &&
            ((typeof provider.id === 'string' && provider.id === providerId) || `index-${index}` === providerId)
          )
        })
        if (providerIndex !== -1) {
          const provider = asRecord(customProviders[providerIndex])
          if (provider) setPath(provider, `defaultSettings.${fieldPath}`, secret)
        }
      }
      continue
    }
    setPath(restored, path, secret)
  }

  const transportSecrets = asRecord(secrets[MCP_TRANSPORT_SECRETS_KEY])
  const mcpServers = asRecord(restored.mcp)?.servers
  if (!transportSecrets || !Array.isArray(mcpServers)) return restored
  for (const serverValue of mcpServers) {
    const server = asRecord(serverValue)
    const transport = asRecord(server?.transport)
    const serverSecrets = typeof server?.id === 'string' ? asRecord(transportSecrets[server.id]) : undefined
    if (transport?.type !== 'http' || !serverSecrets) continue
    if (typeof serverSecrets.url === 'string') transport.url = serverSecrets.url
    const headers = asRecord(serverSecrets.headers)
    if (headers) transport.headers = structuredClone(headers)
  }
  return restored
}

export function setPath(target: MobileSettingsRecord, path: string, value: unknown): void {
  const parts = path.split('.')
  if (parts.length === 0 || parts.some((part) => BLOCKED_PATH_SEGMENTS.has(part))) return
  let cursor = target
  for (const part of parts.slice(0, -1)) {
    const current = Object.hasOwn(cursor, part) ? asRecord(cursor[part]) : undefined
    if (!current) {
      const next = Object.create(null) as MobileSettingsRecord
      Object.defineProperty(cursor, part, {
        configurable: true,
        enumerable: true,
        value: next,
        writable: true,
      })
      cursor = next
    } else {
      cursor = current
    }
  }
  const leaf = parts[parts.length - 1]
  if (leaf && !BLOCKED_PATH_SEGMENTS.has(leaf)) {
    Object.defineProperty(cursor, leaf, {
      configurable: true,
      enumerable: true,
      value,
      writable: true,
    })
  }
}
