import { ModelProviderEnum, ModelProviderType } from '@shared/types'
import { useMemo } from 'react'
import {
  getProviderImageModels,
  type ImageModelOption,
  isOpenAIImageGenerationAuthSupported,
} from '@/packages/image-model-catalog'
import { useSettingsStore } from '@/stores/settingsStore'
import { useProviders } from './useProviders'

export interface ImageModelGroup {
  label: string
  providerId: string
  isCustom?: boolean
  models: ImageModelOption[]
}

export function useProviderImageModels(provider: ModelProviderEnum, enabled: boolean): ImageModelOption[] {
  const providerSettings = useSettingsStore((state) => state.providers?.[provider])

  return useMemo(
    () => (enabled ? getProviderImageModels(provider, providerSettings) : []),
    [enabled, provider, providerSettings]
  )
}

export function useImageModelGroups(): ImageModelGroup[] {
  const { providers } = useProviders()
  const providerSettingsMap = useSettingsStore((state) => state.providers)

  const openAIProvider = providers.find((p) => p.id === ModelProviderEnum.OpenAI)
  const geminiProvider = providers.find((p) => p.id === ModelProviderEnum.Gemini)
  const customOpenAIProviders = providers.filter(
    (p) =>
      p.isCustom && (p.type === ModelProviderType.OpenAI || p.type === ModelProviderType.OpenAIResponses)
  )
  const customGeminiProviders = providers.filter((p) => p.isCustom && p.type === ModelProviderType.Gemini)

  const openAIImageModels = useProviderImageModels(ModelProviderEnum.OpenAI, !!openAIProvider)
  const geminiImageModels = useProviderImageModels(ModelProviderEnum.Gemini, !!geminiProvider)

  return useMemo(() => {
    const groups: ImageModelGroup[] = []
    if (geminiProvider) {
      if (geminiImageModels.length > 0) {
        groups.push({
          label: geminiProvider.name,
          providerId: geminiProvider.id,
          models: geminiImageModels,
        })
      }
    }

    for (const provider of customGeminiProviders) {
      const models = getProviderImageModels(provider.id, providerSettingsMap?.[provider.id], provider.defaultSettings)
      if (models.length > 0) {
        groups.push({
          label: provider.name,
          providerId: provider.id,
          isCustom: true,
          models,
        })
      }
    }

    if (openAIProvider && isOpenAIImageGenerationAuthSupported(providerSettingsMap)) {
      if (openAIImageModels.length > 0) {
        groups.push({
          label: openAIProvider.name,
          providerId: openAIProvider.id,
          models: openAIImageModels,
        })
      }
    }

    for (const provider of customOpenAIProviders) {
      const models = getProviderImageModels(provider.id, providerSettingsMap?.[provider.id], provider.defaultSettings)
      if (models.length > 0) {
        groups.push({
          label: provider.name,
          providerId: provider.id,
          isCustom: true,
          models,
        })
      }
    }

    return groups
  }, [
    openAIProvider,
    geminiProvider,
    customOpenAIProviders,
    customGeminiProviders,
    providerSettingsMap,
    openAIImageModels,
    geminiImageModels,
  ])
}
