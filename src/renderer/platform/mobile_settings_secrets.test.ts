import { describe, expect, it } from 'vitest'
import {
  extractSettingsSecrets,
  MOBILE_SETTINGS_SECRET_PATHS,
  removeSettingsSecrets,
  setPath,
} from './mobile_settings_secrets'

describe('mobile settings secret registry', () => {
  it('extracts and redacts every registered credential path', () => {
    const settings = {
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
        documentParser: {
          llamaParse: { apiKey: 'llama-key' },
          mineru: { apiToken: 'mineru-token' },
          textin: { appId: 'app-id', secretCode: 'secret-code' },
        },
      },
    }

    const secrets = extractSettingsSecrets(settings)
    expect(Object.keys(secrets).sort()).toEqual(
      MOBILE_SETTINGS_SECRET_PATHS.map((path) => path.replace('*', 'openai')).sort()
    )
    expect(removeSettingsSecrets(settings)).toEqual({
      providers: { openai: { oauth: {}, model: 'gpt-4o' } },
      extension: { documentParser: { llamaParse: {}, mineru: {}, textin: {} } },
    })
    expect(settings.providers.openai.apiKey).toBe('api-key')
  })

  it('restores nested paths without overwriting siblings', () => {
    const target = { providers: { openai: { model: 'gpt-4o' } } }
    setPath(target, 'providers.openai.apiKey', 'restored')
    expect(target).toEqual({ providers: { openai: { model: 'gpt-4o', apiKey: 'restored' } } })
  })
})
