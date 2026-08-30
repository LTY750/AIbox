import * as defaults from '../defaults'
import { SettingsSchema, type Settings } from '../types'
import deepmerge from 'deepmerge'

function withoutProviderCredentials(provider: object): Record<string, unknown> {
  const cleanedProvider: Record<string, unknown> = { ...provider }
  delete cleanedProvider.apiKey
  delete cleanedProvider.oauth
  delete cleanedProvider.accessKey
  delete cleanedProvider.secretKey
  delete cleanedProvider.sessionToken
  return cleanedProvider
}

/**
 * Strip sensitive data from settings before writing a backup
 * (`chatbox-backup-*.zip`). License runtime state is always dropped;
 * license key and provider credentials are kept only when `includeKeys` is set.
 * Shared by the desktop/Web export (settings/general.tsx) and the native backup.
 */
export function cleanSettingsForBackup(settings: Settings, includeKeys: boolean): Record<string, unknown> {
  const cleaned: Record<string, unknown> = { ...settings }
  delete cleaned.licenseDetail
  delete cleaned.licenseInstances
  if (!includeKeys) {
    delete cleaned.licenseKey
    delete cleaned.lastSelectedLicenseByUser
    delete cleaned.memorizedManualLicenseKey
    delete cleaned.vibedropPublishKey
    if (settings.providers) {
      cleaned.providers = Object.fromEntries(
        Object.entries(settings.providers).map(([id, provider]) => [id, withoutProviderCredentials(provider)])
      )
    }
    if (settings.customProviders) {
      cleaned.customProviders = settings.customProviders.map((provider) => ({
        ...provider,
        defaultSettings: provider.defaultSettings
          ? withoutProviderCredentials(provider.defaultSettings)
          : provider.defaultSettings,
      }))
    }
    if (settings.extension) {
      const extension = { ...settings.extension }
      if (settings.extension.webSearch) {
        const webSearch = { ...settings.extension.webSearch }
        delete webSearch.tavilyApiKey
        delete webSearch.bochaApiKey
        delete webSearch.queritApiKey
        extension.webSearch = webSearch
      }
      if (settings.extension.documentParser?.mineru) {
        const documentParser = { ...settings.extension.documentParser }
        delete documentParser.mineru
        extension.documentParser = documentParser
      }
      if (settings.extension.documentParser?.textin) {
        const documentParser = { ...(extension.documentParser ?? settings.extension.documentParser) }
        delete documentParser.textin
        extension.documentParser = documentParser
      }
      cleaned.extension = extension
    }
  }
  if (settings.mcp) {
    // Legacy local-process MCP entries are never exported. The supported
    // product surface only connects to remote HTTPS servers.
    cleaned.mcp = {
      ...settings.mcp,
      servers: settings.mcp.servers.flatMap((server) => {
        if (server.transport.type !== 'http') return []
        if (includeKeys) return [{ ...server, transport: { ...server.transport } }]
        const transport = { ...server.transport }
        delete transport.headers
        // Remote MCP URLs may contain tenant identifiers or query tokens.
        // Keep the server shape in a keyless backup without preserving a
        // potentially sensitive endpoint that cannot work without headers.
        transport.url = ''
        return [{ ...server, transport }]
      }),
    }
  }
  return cleaned
}

/**
 * Validate imported settings and fill fields omitted by older backup formats.
 * The first parse keeps current full backups strict; the default merge only
 * accommodates legacy partial settings and still requires a successful schema
 * parse before the value reaches storage.
 */
export function parseSettingsForImport(value: unknown): Settings | undefined {
  const parsed = SettingsSchema.safeParse(value)
  if (parsed.success) return parsed.data
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const merged = deepmerge<Settings, Partial<Settings>>(defaults.settings(), value as Partial<Settings>, {
    arrayMerge: (_target, source) => source,
  })
  const mergedParsed = SettingsSchema.safeParse(merged)
  return mergedParsed.success ? mergedParsed.data : undefined
}

export function getBackupFilename(exportedAt: Date): string {
  const year = exportedAt.getFullYear()
  const month = exportedAt.getMonth() + 1
  const day = exportedAt.getDate()
  return `chatbox-backup-${year}-${month}-${day}.zip`
}
