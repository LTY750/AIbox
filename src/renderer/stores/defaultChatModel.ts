import { type ChatboxAILicenseDetail, ModelProviderEnum, type Session } from '@shared/types'

export type ChatboxLicenseDefaultModelId = NonNullable<ChatboxAILicenseDetail['defaultModel']>

type ChatboxLicenseDetailForDefaultModel = Pick<ChatboxAILicenseDetail, 'defaultModel' | 'type' | 'name' | 'plan'>

export type ChatboxDefaultModelSettings = {
  licenseKey?: string
  hasExpiredLicense?: boolean
  licenseDetail?: ChatboxLicenseDetailForDefaultModel
  licensePlanName?: string
}

export type DefaultChatModelSelection = {
  provider: string
  modelId: string
}

export function resolveChatboxLicenseDefaultModel(
  _settings: ChatboxDefaultModelSettings
): DefaultChatModelSelection | undefined {
  // The old function name is retained for migration call sites. New sessions
  // always start with a regular provider model and never depend on a license.
  return {
    provider: ModelProviderEnum.OpenAI,
    modelId: 'gpt-4o-mini',
  }
}

export function applyChatboxLicenseDefaultModelToSession<T extends Pick<Session, 'type' | 'settings'>>(
  session: T,
  settings: ChatboxDefaultModelSettings
): T {
  if (session.type !== 'chat' || (session.settings?.provider && session.settings?.modelId)) {
    return session
  }

  const defaultModel = resolveChatboxLicenseDefaultModel(settings)
  if (!defaultModel) {
    return session
  }

  return {
    ...session,
    settings: {
      ...(session.settings || {}),
      ...defaultModel,
    },
  }
}
