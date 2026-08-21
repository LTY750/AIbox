import { settings as defaultSettings } from '@shared/defaults'
import { ModelProviderEnum, ModelProviderType, type Settings } from '@shared/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/platform', () => ({ default: { type: 'desktop' } }))
vi.mock('@/stores/settingsStore', () => ({ settingsStore: { getState: vi.fn() } }))

import {
  getAvailableImageModels,
  getProviderDefaultImageModels,
  getProviderImageModels,
  mergeFetchedImageModels,
} from './image-model-catalog'

function createSettings(): Settings {
  return defaultSettings()
}

describe('image model catalog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses local provider defaults and merges manually configured image models', async () => {
    const settings = createSettings()
    const geminiDefaults = getProviderDefaultImageModels(ModelProviderEnum.Gemini)
    const defaultGeminiModel = geminiDefaults[0]
    settings.providers = {
      [ModelProviderEnum.Gemini]: {
        apiKey: 'gemini-key',
        models: [
          {
            modelId: defaultGeminiModel.modelId,
            type: 'image',
            nickname: 'Custom Gemini Name',
          },
          { modelId: 'custom-gemini-image', type: 'image', nickname: 'Custom Image' },
        ],
      },
    }

    await expect(getAvailableImageModels(settings)).resolves.toEqual([
      {
        provider: ModelProviderEnum.Gemini,
        modelId: defaultGeminiModel.modelId,
        nickname: 'Custom Gemini Name',
      },
      ...geminiDefaults.slice(1).map((model) => ({
        provider: ModelProviderEnum.Gemini,
        modelId: model.modelId,
        nickname: model.displayName,
      })),
      {
        provider: ModelProviderEnum.Gemini,
        modelId: 'custom-gemini-image',
        nickname: 'Custom Image',
      },
    ])
  })

  it('uses only manual image models for custom Gemini providers', async () => {
    const settings = createSettings()
    settings.providers = {
      'custom-provider-gemini': {
        models: [{ modelId: 'custom-image', type: 'image', nickname: 'Custom Image' }],
      },
    }
    settings.customProviders = [
      {
        id: 'custom-provider-gemini',
        name: 'Custom Gemini',
        type: ModelProviderType.Gemini,
        isCustom: true,
      },
    ]

    await expect(getAvailableImageModels(settings)).resolves.toEqual([
      { provider: 'custom-provider-gemini', modelId: 'custom-image', nickname: 'Custom Image' },
    ])
  })

  it('includes manual image models for custom OpenAI-compatible providers', async () => {
    const settings = createSettings()
    settings.providers = {
      'custom-provider-openai': {
        apiKey: 'custom-key',
        apiHost: 'https://example.com/v1',
        models: [{ modelId: 'gpt-image-2', type: 'image', nickname: 'Custom GPT Image' }],
      },
    }
    settings.customProviders = [
      {
        id: 'custom-provider-openai',
        name: 'Custom OpenAI',
        type: ModelProviderType.OpenAI,
        isCustom: true,
      },
    ]

    await expect(getAvailableImageModels(settings)).resolves.toEqual([
      {
        provider: 'custom-provider-openai',
        modelId: 'gpt-image-2',
        nickname: 'Custom GPT Image',
      },
    ])
  })

  it('includes image models from custom OpenAI Responses-compatible providers', async () => {
    const settings = createSettings()
    settings.providers = {
      'custom-provider-responses': {
        apiKey: 'custom-key',
        apiHost: 'https://example.com/v1',
        models: [{ modelId: 'gpt-image-2', type: 'chat', nickname: 'Morph Image 2' }],
      },
    }
    settings.customProviders = [
      {
        id: 'custom-provider-responses',
        name: 'Custom Responses',
        type: ModelProviderType.OpenAIResponses,
        isCustom: true,
      },
    ]

    await expect(getAvailableImageModels(settings)).resolves.toEqual([
      {
        provider: 'custom-provider-responses',
        modelId: 'gpt-image-2',
        nickname: 'Morph Image 2',
      },
    ])
  })

  it('includes provider-defined OpenAI image defaults without a manifest request', async () => {
    const settings = createSettings()
    settings.providers = {
      [ModelProviderEnum.OpenAI]: { apiKey: 'openai-key' },
    }

    const defaults = getProviderDefaultImageModels(ModelProviderEnum.OpenAI)
    await expect(getAvailableImageModels(settings)).resolves.toEqual(
      defaults.map((model) => ({
        provider: ModelProviderEnum.OpenAI,
        modelId: model.modelId,
        nickname: model.displayName,
      }))
    )
  })

  it('omits unconfigured providers', async () => {
    await expect(getAvailableImageModels(createSettings())).resolves.toEqual([])
  })

  it('keeps manually configured image models when no provider default exists', () => {
    const models = getProviderImageModels('custom-provider', {
      models: [{ modelId: 'manual-only', type: 'image', nickname: 'Manual Only' }],
    })

    expect(models).toEqual([{ modelId: 'manual-only', displayName: 'Manual Only' }])
  })

  it('persists discovered OpenAI image models with an explicit image type', () => {
    expect(
      mergeFetchedImageModels(
        [{ modelId: 'gpt-5-mini', type: 'chat' }],
        [
          { modelId: 'gpt-5-mini', type: 'chat' },
          { modelId: 'gpt-image-2', type: 'chat', nickname: 'Morph Image 2' },
        ]
      )
    ).toEqual([
      { modelId: 'gpt-5-mini', type: 'chat' },
      { modelId: 'gpt-image-2', type: 'image', nickname: 'Morph Image 2' },
    ])
  })

  it('omits OpenAI image models when OAuth is active', async () => {
    const settings = createSettings()
    settings.providers = {
      [ModelProviderEnum.OpenAI]: {
        activeAuthMode: 'oauth',
        oauth: { accessToken: 'oauth-token' },
      },
    }

    await expect(getAvailableImageModels(settings)).resolves.toEqual([])
  })
})
