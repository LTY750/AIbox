import { ModelProviderEnum } from '@shared/types'
import { describe, expect, it } from 'vitest'
import {
  applyChatboxLicenseDefaultModelToSession,
  type ChatboxDefaultModelSettings,
  resolveChatboxLicenseDefaultModel,
} from './defaultChatModel'

function makeSettings(overrides: Partial<ChatboxDefaultModelSettings> = {}): ChatboxDefaultModelSettings {
  return {
    hasExpiredLicense: false,
    ...overrides,
  }
}

describe('resolveChatboxLicenseDefaultModel', () => {
  it('uses the current regular-provider default for BYOK users', () => {
    expect(resolveChatboxLicenseDefaultModel(makeSettings())).toEqual({
      provider: ModelProviderEnum.OpenAI,
      modelId: 'gpt-4o-mini',
    })
  })

  it('does not use an expired Chatbox license as the default model source', () => {
    expect(
      resolveChatboxLicenseDefaultModel(
        makeSettings({
          licenseKey: 'license-key',
          hasExpiredLicense: true,
          licenseDetail: {
            name: 'Chatbox AI Pro',
            defaultModel: 'chatboxai-4',
          },
        })
      )
    ).toEqual({ provider: ModelProviderEnum.OpenAI, modelId: 'gpt-4o-mini' })
  })

  it('uses the regular-provider default when a license supplies a legacy model', () => {
    expect(
      resolveChatboxLicenseDefaultModel(
        makeSettings({
          licenseKey: 'license-key',
          licenseDetail: {
            name: 'Chatbox AI Pro',
            defaultModel: 'chatboxai-4',
            type: 'chatboxai-3.5',
          },
        })
      )
    ).toEqual({ provider: ModelProviderEnum.OpenAI, modelId: 'gpt-4o-mini' })
  })

  it('uses the regular-provider default when a license type is supplied', () => {
    expect(
      resolveChatboxLicenseDefaultModel(
        makeSettings({
          licenseKey: 'license-key',
          licenseDetail: {
            name: 'Chatbox AI Lite',
            type: 'chatboxai-3.5',
          },
        })
      )
    ).toEqual({ provider: ModelProviderEnum.OpenAI, modelId: 'gpt-4o-mini' })
  })

  it('uses the regular-provider default for older license details', () => {
    expect(
      resolveChatboxLicenseDefaultModel(
        makeSettings({
          licenseKey: 'license-key',
          licensePlanName: 'Chatbox AI Pro',
        })
      )
    ).toEqual({ provider: ModelProviderEnum.OpenAI, modelId: 'gpt-4o-mini' })

    expect(
      resolveChatboxLicenseDefaultModel(
        makeSettings({
          licenseKey: 'license-key',
          licensePlanName: 'Chatbox AI Lite',
        })
      )
    ).toEqual({ provider: ModelProviderEnum.OpenAI, modelId: 'gpt-4o-mini' })
  })

  it('ignores legacy plan and display-name fields', () => {
    expect(
      resolveChatboxLicenseDefaultModel(
        makeSettings({
          licenseKey: 'license-key',
          licenseDetail: {
            name: 'Chatbox AI Pro',
            plan: 'lite',
          },
        })
      )
    ).toEqual({ provider: ModelProviderEnum.OpenAI, modelId: 'gpt-4o-mini' })

    expect(
      resolveChatboxLicenseDefaultModel(
        makeSettings({
          licenseKey: 'license-key',
          licenseDetail: {
            name: 'Chatbox AI Lite',
            plan: 'pro',
          },
        })
      )
    ).toEqual({ provider: ModelProviderEnum.OpenAI, modelId: 'gpt-4o-mini' })
  })
})

describe('applyChatboxLicenseDefaultModelToSession', () => {
  it('applies the regular-provider default to preset chat sessions', () => {
    const session = {
      type: 'chat' as const,
      settings: undefined,
    }

    expect(applyChatboxLicenseDefaultModelToSession(session, makeSettings())).toEqual({
      type: 'chat',
      settings: { provider: ModelProviderEnum.OpenAI, modelId: 'gpt-4o-mini' },
    })
  })

  it('preserves other preset fields while applying the regular-provider default', () => {
    const session = {
      type: 'chat' as const,
      settings: {
        temperature: 0.7,
      },
    }

    expect(
      applyChatboxLicenseDefaultModelToSession(
        session,
        makeSettings({
          licenseKey: 'license-key',
          licenseDetail: {
            name: 'Chatbox AI Pro',
            defaultModel: 'chatboxai-4',
          },
        })
      )
    ).toEqual({
      type: 'chat',
      settings: {
        temperature: 0.7,
        provider: ModelProviderEnum.OpenAI,
        modelId: 'gpt-4o-mini',
      },
    })
  })

  it('does not override an existing preset session model', () => {
    const session = {
      type: 'chat' as const,
      settings: {
        provider: ModelProviderEnum.OpenAI,
        modelId: 'gpt-4o',
      },
    }

    expect(
      applyChatboxLicenseDefaultModelToSession(
        session,
        makeSettings({
          licenseKey: 'license-key',
          licenseDetail: {
            name: 'Chatbox AI Pro',
            defaultModel: 'chatboxai-4',
          },
        })
      )
    ).toBe(session)
  })

  it('does not apply chat defaults to picture sessions', () => {
    const session = {
      type: 'picture' as const,
      settings: undefined,
    }

    expect(
      applyChatboxLicenseDefaultModelToSession(
        session,
        makeSettings({
          licenseKey: 'license-key',
          licenseDetail: {
            name: 'Chatbox AI Pro',
            defaultModel: 'chatboxai-4',
          },
        })
      )
    ).toBe(session)
  })
})
