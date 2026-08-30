import { Stack } from '@mantine/core'
import { type ModelProvider, ModelProviderEnum } from '@shared/types'
import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useState } from 'react'
import useChatboxAIModels from '@/hooks/useChatboxAIModels'
import { useLanguage, useProviderSettings, useSettingsStore } from '@/stores/settingsStore'
import { LicenseKeyView } from './-components/LicenseKeyView'
import { LicenseSelectionModal } from './-components/LicenseSelectionModal'
import { LoggedInView } from './-components/LoggedInView'
import { LoginView } from './-components/LoginView'
import { ModelManagement } from './-components/ModelManagement'
import type { UserLicense, ViewMode } from './-components/types'
import { useAuthTokens } from './-components/useAuthTokens'

export const Route = createFileRoute('/settings/provider/chatbox-ai/')({
  component: RouteComponent,
})

export function RouteComponent() {
  const language = useLanguage()
  const providerId: ModelProvider = ModelProviderEnum.ChatboxAI
  const { providerSettings, setProviderSettings } = useProviderSettings(providerId)
  const licenseActivationMethod = useSettingsStore((state) => state.licenseActivationMethod)
  const [viewMode, setViewMode] = useState<ViewMode>(licenseActivationMethod === 'manual' ? 'licenseKey' : 'login')
  const { isLoggedIn, clearAuthTokens, saveAuthTokens } = useAuthTokens()
  const { allChatboxAIModels, chatboxAIModels, refetch: refetchChatboxAIModels } = useChatboxAIModels()

  const deleteModel = (modelId: string) => {
    setProviderSettings({
      excludedModels: [...(providerSettings?.excludedModels || []), modelId],
    })
  }

  const resetModels = () => {
    setProviderSettings({
      models: [],
      excludedModels: [],
    })
  }

  const [licenseModalState, setLicenseModalState] = useState<{
    show: boolean
    licenses: UserLicense[]
    onConfirm?: (selectedLicenseKey: string) => void
    onCancel?: () => void
  }>({
    show: false,
    licenses: [],
  })

  const showLicenseSelectionModal = useCallback(
    (params: { licenses: UserLicense[]; onConfirm: (selectedLicenseKey: string) => void; onCancel: () => void }) => {
      setLicenseModalState({
        show: true,
        ...params,
      })
    },
    []
  )

  const handleLicenseModalConfirm = (selectedLicenseKey: string) => {
    licenseModalState.onConfirm?.(selectedLicenseKey)
    setLicenseModalState({ show: false, licenses: [] })
  }

  const handleLicenseModalCancel = () => {
    licenseModalState.onCancel?.()
    setLicenseModalState({ show: false, licenses: [] })
  }

  return (
    <Stack gap="xxl">
      <LicenseSelectionModal
        opened={licenseModalState.show}
        licenses={licenseModalState.licenses}
        onConfirm={handleLicenseModalConfirm}
        onCancel={handleLicenseModalCancel}
      />

      {viewMode === 'login' ? (
        isLoggedIn ? (
          <LoggedInView
            onLogout={clearAuthTokens}
            language={language}
            onShowLicenseSelectionModal={showLicenseSelectionModal}
            onSwitchToLicenseKey={() => setViewMode('licenseKey')}
          />
        ) : (
          <LoginView
            language={language}
            saveAuthTokens={saveAuthTokens}
            onSwitchToLicenseKey={() => setViewMode('licenseKey')}
          />
        )
      ) : (
        <LicenseKeyView language={language} onSwitchToLogin={() => setViewMode('login')} />
      )}

      <ModelManagement
        chatboxAIModels={chatboxAIModels}
        allChatboxAIModels={allChatboxAIModels}
        onDeleteModel={deleteModel}
        onResetModels={resetModels}
        onFetchModels={refetchChatboxAIModels}
        onAddModel={(model) =>
          setProviderSettings({
            excludedModels: (providerSettings?.excludedModels || []).filter((modelId) => modelId !== model.modelId),
          })
        }
        onRemoveModel={(modelId) =>
          setProviderSettings({
            excludedModels: [...(providerSettings?.excludedModels || []), modelId],
          })
        }
      />
    </Stack>
  )
}
