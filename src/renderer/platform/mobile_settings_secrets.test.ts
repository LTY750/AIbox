import { describe, expect, it } from 'vitest'
import {
  extractSettingsSecrets,
  removeSettingsSecrets,
  restoreSettingsSecrets,
  setPath,
} from './mobile_settings_secrets'

describe('mobile settings secret registry', () => {
  it('extracts and redacts every registered credential path', () => {
    const settings = {
      licenseKey: 'license-key',
      licenseInstances: { 'license-key': 'instance-id' },
      memorizedManualLicenseKey: 'memorized-license-key',
      lastSelectedLicenseByUser: { user: 'selected-license-key' },
      vibedropPublishKey: { email: 'user@example.com', key: 'publish-key' },
      providers: {
        openai: {
          apiKey: 'api-key',
          accessKey: 'access-key',
          secretKey: 'secret-key',
          sessionToken: 'session-token',
          oauth: { accessToken: 'access-token', refreshToken: 'refresh-token' },
          model: 'gpt-4o',
        },
      },
      extension: {
        webSearch: {
          tavilyApiKey: 'tavily-key',
          bochaApiKey: 'bocha-key',
          queritApiKey: 'querit-key',
        },
        documentParser: {
          llamaParse: { apiKey: 'llama-key' },
          mineru: { apiToken: 'mineru-token' },
          textin: { appId: 'app-id', secretCode: 'secret-code' },
        },
      },
      customProviders: [
        {
          id: 'custom-provider',
          defaultSettings: {
            apiKey: 'custom-api-key',
            oauth: { accessToken: 'custom-access-token', refreshToken: 'custom-refresh-token' },
          },
        },
      ],
      mcp: {
        servers: [
          {
            id: 'modelscope',
            name: 'ModelScope',
            enabled: true,
            transport: {
              type: 'http',
              url: 'https://mcp.example.com/sse?token=secret',
              headers: { Authorization: 'Bearer mcp-token' },
            },
          },
        ],
      },
    }

    const secrets = extractSettingsSecrets(settings)
    expect(Object.keys(secrets).sort()).toEqual(
      [
        'licenseKey',
        'licenseInstances',
        'memorizedManualLicenseKey',
        'lastSelectedLicenseByUser',
        'vibedropPublishKey',
        'providers.openai.apiKey',
        'providers.openai.accessKey',
        'providers.openai.secretKey',
        'providers.openai.sessionToken',
        'providers.openai.oauth.accessToken',
        'providers.openai.oauth.refreshToken',
        'extension.webSearch.tavilyApiKey',
        'extension.webSearch.bochaApiKey',
        'extension.webSearch.queritApiKey',
        'extension.documentParser.llamaParse.apiKey',
        'extension.documentParser.mineru.apiToken',
        'extension.documentParser.textin.appId',
        'extension.documentParser.textin.secretCode',
        'customProviders.custom-provider.defaultSettings.apiKey',
        'customProviders.custom-provider.defaultSettings.oauth.accessToken',
        'customProviders.custom-provider.defaultSettings.oauth.refreshToken',
        'mcp.transportSecrets',
      ].sort()
    )
    expect(removeSettingsSecrets(settings)).toEqual({
      providers: { openai: { oauth: {}, model: 'gpt-4o' } },
      extension: {
        webSearch: {},
        documentParser: { llamaParse: {}, mineru: {}, textin: {} },
      },
      customProviders: [{ id: 'custom-provider', defaultSettings: { oauth: {} } }],
      mcp: {
        servers: [
          {
            id: 'modelscope',
            name: 'ModelScope',
            enabled: true,
            transport: { type: 'http', url: '' },
          },
        ],
      },
    })
    expect(settings.providers.openai.apiKey).toBe('api-key')

    expect(restoreSettingsSecrets(removeSettingsSecrets(settings), secrets)).toEqual(settings)
  })

  it('restores nested paths without overwriting siblings', () => {
    const target = { providers: { openai: { model: 'gpt-4o' } } }
    setPath(target, 'providers.openai.apiKey', 'restored')
    expect(target).toEqual({ providers: { openai: { model: 'gpt-4o', apiKey: 'restored' } } })
  })

  it('removes legacy stdio environment values from persisted snapshots', () => {
    const settings = {
      mcp: {
        servers: [
          {
            id: 'legacy-local',
            name: 'Legacy local server',
            enabled: false,
            transport: {
              type: 'stdio',
              command: 'server',
              args: ['--token', 'secret-token'],
              env: { TOKEN: 'secret-token' },
            },
          },
        ],
      },
    }

    expect(removeSettingsSecrets(settings)).toEqual({ mcp: { servers: [] } })
  })

  it('rejects prototype-polluting secret paths from malicious backups', () => {
    const target: Record<string, unknown> = {}

    setPath(target, 'providers.__proto__.polluted', 'owned')
    setPath(target, 'constructor.prototype.polluted', 'owned')
    setPath(target, 'prototype.polluted', 'owned')
    restoreSettingsSecrets(target, {
      'providers.__proto__.polluted': 'owned',
      'constructor.prototype.polluted': 'owned',
      'prototype.polluted': 'owned',
    })

    expect(Object.prototype).not.toHaveProperty('polluted')
    expect(target).toEqual({})
  })
})
