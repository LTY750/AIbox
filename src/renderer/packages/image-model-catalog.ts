import { isUsingOAuth, mergeSharedOAuthProviderSettings } from '@shared/oauth'
import { getProviderDefinition } from '@shared/providers'
import {
  ModelProviderEnum,
  ModelProviderType,
  type ProviderModelInfo,
  type ProviderSettings,
  type Settings,
} from '@shared/types'
import platform from '@/platform'
import type { PlatformType } from '@/platform/interfaces'
import { settingsStore } from '@/stores/settingsStore'

export interface ImageModelOption {
  modelId: string
  displayName: string
}

export interface AvailableImageModel {
  provider: string
  modelId: string
  nickname: string
}

export function manualImageModelToOption(model: ProviderModelInfo): ImageModelOption {
  return {
    modelId: model.modelId,
    displayName: model.nickname || model.modelId,
  }
}

export function mergeImageModels(baseModels: ImageModelOption[], manualModels: ImageModelOption[]): ImageModelOption[] {
  const modelsById = new Map<string, ImageModelOption>()
  for (const model of baseModels) modelsById.set(model.modelId, model)
  for (const model of manualModels) {
    modelsById.set(model.modelId, {
      ...modelsById.get(model.modelId),
      ...model,
    })
  }
  return [...modelsById.values()]
}

/**
 * Provider model lists do not always stamp image models with `type: image`.
 * Keep known image-generation IDs visible while still honoring explicit model
 * types for manually configured providers.
 */
export function isImageModelInfo(model: ProviderModelInfo): boolean {
  return model.type === 'image' || model.modelId.startsWith('gpt-image') || /gemini.*image/i.test(model.modelId)
}

export function providerModelsToImageOptions(models: ProviderModelInfo[] | undefined): ImageModelOption[] {
  return (models ?? []).filter(isImageModelInfo).map(manualImageModelToOption)
}

/**
 * Keep newly discovered image models in the provider's saved model list.
 * Model discovery APIs generally label every model as `chat`, so image IDs are
 * normalized here before the image creator reads the persisted settings.
 */
export function mergeFetchedImageModels(
  existingModels: ProviderModelInfo[],
  fetchedModels: ProviderModelInfo[]
): ProviderModelInfo[] {
  const discoveredImages = fetchedModels.filter(isImageModelInfo).map((model) => ({ ...model, type: 'image' as const }))
  if (discoveredImages.length === 0) return existingModels

  const fetchedById = new Map(discoveredImages.map((model) => [model.modelId, model]))
  const merged = existingModels.map((model) => {
    const fetched = fetchedById.get(model.modelId)
    return fetched ? { ...model, ...fetched } : model
  })

  for (const model of discoveredImages) {
    if (!existingModels.some((existing) => existing.modelId === model.modelId)) merged.push(model)
  }
  return merged
}

export function getProviderDefaultImageModels(provider: string): ImageModelOption[] {
  return providerModelsToImageOptions(getProviderDefinition(provider)?.defaultSettings?.models)
}

export function getProviderImageModels(
  provider: string,
  providerSettings?: ProviderSettings,
  providerDefaults?: ProviderSettings
) {
  const defaultModels = providerDefaults
    ? providerModelsToImageOptions(providerDefaults.models)
    : getProviderDefaultImageModels(provider)
  return mergeImageModels(defaultModels, providerModelsToImageOptions(providerSettings?.models))
}

function isBuiltinProviderConfigured(provider: ModelProviderEnum, settings: Settings): boolean {
  const providerSettings = mergeSharedOAuthProviderSettings(provider, settings.providers)
  return !!providerSettings.apiKey || isUsingOAuth(providerSettings, platform.type)
}

export function isOpenAIImageGenerationAuthSupported(
  providers: Settings['providers'],
  platformType: PlatformType = platform.type
): boolean {
  const providerSettings = mergeSharedOAuthProviderSettings(ModelProviderEnum.OpenAI, providers)
  return !isUsingOAuth(providerSettings, platformType)
}

function manualImageModels(settings: Settings, provider: string): ImageModelOption[] {
  return providerModelsToImageOptions(settings.providers?.[provider]?.models)
}

function catalogEntries(provider: string, models: ImageModelOption[]): AvailableImageModel[] {
  return models.map((model) => ({
    provider,
    modelId: model.modelId,
    nickname: model.displayName,
  }))
}

/**
 * Builds the non-React image model catalog used by the image creator UI.
 * Provider defaults and manually configured models follow the same merge and
 * provider-visibility rules as useImageModelGroups().
 */
export function getAvailableImageModels(settings: Settings = settingsStore.getState()): Promise<AvailableImageModel[]> {
  const catalog: AvailableImageModel[] = []

  const geminiConfigured = isBuiltinProviderConfigured(ModelProviderEnum.Gemini, settings)
  const customOpenAIProviders = (settings.customProviders ?? []).filter(
    (provider) =>
      provider.isCustom &&
      (provider.type === ModelProviderType.OpenAI || provider.type === ModelProviderType.OpenAIResponses) &&
      (settings.providers?.[provider.id]?.models?.length ?? 0) > 0
  )
  const customGeminiProviders = (settings.customProviders ?? []).filter(
    (provider) =>
      provider.isCustom &&
      provider.type === ModelProviderType.Gemini &&
      (settings.providers?.[provider.id]?.models?.length ?? 0) > 0
  )
  if (geminiConfigured || customGeminiProviders.length > 0) {
    if (geminiConfigured) {
      catalog.push(
        ...catalogEntries(
          ModelProviderEnum.Gemini,
          mergeImageModels(
            getProviderDefaultImageModels(ModelProviderEnum.Gemini),
            manualImageModels(settings, ModelProviderEnum.Gemini)
          )
        )
      )
    }
    for (const provider of customGeminiProviders) {
      catalog.push(
        ...catalogEntries(
          provider.id,
          getProviderImageModels(provider.id, settings.providers?.[provider.id], provider.defaultSettings)
        )
      )
    }
  }

  if (
    isBuiltinProviderConfigured(ModelProviderEnum.OpenAI, settings) &&
    isOpenAIImageGenerationAuthSupported(settings.providers)
  ) {
    catalog.push(
      ...catalogEntries(
        ModelProviderEnum.OpenAI,
        mergeImageModels(
          getProviderDefaultImageModels(ModelProviderEnum.OpenAI),
          manualImageModels(settings, ModelProviderEnum.OpenAI)
        )
      )
    )
  }

  for (const provider of customOpenAIProviders) {
    catalog.push(
      ...catalogEntries(
        provider.id,
        getProviderImageModels(provider.id, settings.providers?.[provider.id], provider.defaultSettings)
      )
    )
  }

  return Promise.resolve(catalog)
}
