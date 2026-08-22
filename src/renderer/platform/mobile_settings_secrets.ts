export type MobileSettingsRecord = Record<string, unknown>

/** Single registry for every setting path stored outside SQLite. */
export const MOBILE_SETTINGS_SECRET_PATHS = [
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
] as const

const PROVIDER_SECRET_FIELDS = ['apiKey', 'accessKey', 'secretKey', 'sessionToken'] as const
const OAUTH_SECRET_FIELDS = ['accessToken', 'refreshToken'] as const
const PARSER_SECRET_FIELDS = {
  llamaParse: ['apiKey'],
  mineru: ['apiToken'],
  textin: ['appId', 'secretCode'],
} as const

function asRecord(value: unknown): MobileSettingsRecord | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as MobileSettingsRecord) : undefined
}

export function extractSettingsSecrets(settings: MobileSettingsRecord): Record<string, unknown> {
  const secrets: Record<string, unknown> = {}
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
  return secrets
}

export function removeSettingsSecrets(settings: MobileSettingsRecord): MobileSettingsRecord {
  const sanitized = structuredClone(settings)
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
  return sanitized
}

export function setPath(target: MobileSettingsRecord, path: string, value: unknown): void {
  const parts = path.split('.')
  let cursor = target
  for (const part of parts.slice(0, -1)) {
    if (!asRecord(cursor[part])) cursor[part] = {}
    cursor = cursor[part] as MobileSettingsRecord
  }
  const leaf = parts[parts.length - 1]
  if (leaf) cursor[leaf] = value
}
