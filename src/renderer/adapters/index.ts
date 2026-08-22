import { getModel } from '@shared/models'
import type { ModelInterface } from '@shared/models/types'
import { type OAuthCredentials, OAuthIpcChannels, toOAuthSettingsProviderId } from '@shared/oauth'
import { createAfetch } from '@shared/request/request'
import type { SessionSettings } from '@shared/types'
import type {
  ApiRequestOptions,
  ModelDependencies,
  OAuthAdapter,
  RequestAdapter,
  StorageAdapter,
} from '@shared/types/adapters'
import type { SentryAdapter } from '@shared/utils/sentry_adapter'
import { getOS } from '@/packages/navigator'
import platform from '@/platform'
import type { PlatformType } from '@/platform/interfaces'
import storage from '@/storage'
import { StorageKeyGenerator } from '@/storage/StoreStorage'
import * as settingActions from '@/stores/settingActions'
import { settingsStore } from '@/stores/settingsStore'
import { apiRequest } from '@/utils/request'
import { RendererSentryAdapter } from './sentry'

interface ModelDependencyPlatformInfo {
  type: PlatformType
  platform: string
  os: string
  version: string
}

interface BlobStorageLike {
  setBlob(key: string, value: string): Promise<void>
  getBlob(key: string): Promise<string | null>
}

interface ApiRequestClient {
  post(
    url: string,
    headers: Record<string, string>,
    body: RequestInit['body'] | undefined,
    options: {
      signal?: AbortSignal
      retry?: number
      useProxy?: boolean
      responseType?: ApiRequestOptions['responseType']
    }
  ): Promise<Response>
  get(
    url: string,
    headers: Record<string, string>,
    options: {
      signal?: AbortSignal
      retry?: number
      useProxy?: boolean
      responseType?: ApiRequestOptions['responseType']
    }
  ): Promise<Response>
}

interface OAuthIpcInvoker {
  invoke(channel: string, providerId: string, credentialJson: string): Promise<string>
}

function headersToRecord(headers?: HeadersInit): Record<string, string> {
  const result: Record<string, string> = {}
  new Headers(headers).forEach((value, key) => {
    result[key] = value
  })
  return result
}

function isStreamingRequest(url: string, init?: RequestInit): boolean {
  if ((init?.method || 'GET').toUpperCase() !== 'POST') return false

  const headers = new Headers(init?.headers)
  if (headers.get('accept')?.toLowerCase().includes('text/event-stream')) return true

  try {
    const parsedUrl = new URL(url)
    if (parsedUrl.searchParams.get('alt')?.toLowerCase() === 'sse') return true
    if (parsedUrl.pathname.toLowerCase().includes('streamgeneratecontent')) return true
  } catch {
    // A malformed URL will be handled by the request implementation.
  }

  if (typeof init?.body !== 'string') return false
  try {
    return JSON.parse(init.body).stream === true
  } catch {
    return false
  }
}

export interface CreateModelDependenciesOptions {
  platformInfo?: ModelDependencyPlatformInfo
  platformType?: ModelDependencies['platformType']
  storage?: StorageAdapter
  blobStorage?: BlobStorageLike
  createPictureStorageKey?: (folder: string) => string
  request?: RequestAdapter
  apiRequestClient?: ApiRequestClient
  sentry?: SentryAdapter
  getRemoteConfig?: ModelDependencies['getRemoteConfig']
  oauth?: OAuthAdapter
  oauthIpc?: OAuthIpcInvoker
}

async function createDefaultPlatformInfo(): Promise<ModelDependencyPlatformInfo> {
  return {
    type: platform.type,
    platform: await platform.getPlatform(),
    os: getOS(),
    version: (await platform.getVersion()) || 'unknown',
  }
}

function createStorageAdapter(options: CreateModelDependenciesOptions): StorageAdapter {
  if (options.storage) {
    return options.storage
  }
  const blobStorage = options.blobStorage ?? storage
  const createPictureStorageKey = options.createPictureStorageKey ?? StorageKeyGenerator.picture
  return {
    async saveImage(folder: string, dataUrl: string): Promise<string> {
      const storageKey = createPictureStorageKey(folder)
      await blobStorage.setBlob(storageKey, dataUrl)
      return storageKey
    },
    async getImage(keyOrUrl: string): Promise<string> {
      if (keyOrUrl.startsWith('http://') || keyOrUrl.startsWith('https://')) {
        return keyOrUrl
      }
      const blob = await blobStorage.getBlob(keyOrUrl)
      if (!blob) return ''
      return blob.startsWith('data:') ? blob : `data:image/png;base64,${blob}`
    },
  }
}

function createRequestAdapter(
  platformInfo: ModelDependencyPlatformInfo,
  apiRequestClient: ApiRequestClient = apiRequest
): RequestAdapter {
  const afetch = createAfetch(platformInfo)
  return {
      fetchWithOptions: (
      url: string,
      init?: RequestInit,
      options?: { retry?: number; parseChatboxRemoteError?: boolean }
    ): Promise<Response> => {
      // Some provider SDKs (notably Chatbox AI) inject their own fetch function
      // instead of using apiRequest. Route their Android SSE requests through the
      // native stream transport as well, so background execution is consistent.
      if (platformInfo.type === 'mobile' && isStreamingRequest(url, init)) {
        return apiRequestClient.post(url, headersToRecord(init?.headers), init?.body, {
          signal: init?.signal || undefined,
          retry: options?.retry ?? 0,
          // On mobile this selects Capacitor/native HTTP; it does not rewrite the URL.
          useProxy: true,
        })
      }
      return afetch(url, init, options || {})
    },
    apiRequest(options: ApiRequestOptions): Promise<Response> {
      if (options.method === 'POST') {
        return apiRequestClient.post(options.url, options.headers || {}, options.body, {
          signal: options.signal,
          retry: options.retry,
          useProxy: options.useProxy,
          responseType: options.responseType,
        })
      }
      return apiRequestClient.get(options.url, options.headers || {}, {
        signal: options.signal,
        retry: options.retry,
        useProxy: options.useProxy,
        responseType: options.responseType,
      })
    },
  }
}

function getDefaultOAuthIpc(): OAuthIpcInvoker {
  const maybeDesktopPlatform = platform as unknown as { ipc?: OAuthIpcInvoker }
  if (!maybeDesktopPlatform.ipc) {
    throw new Error('OAuth IPC is only available on desktop')
  }
  return maybeDesktopPlatform.ipc
}

function createDesktopOAuthAdapter(oauthIpc?: OAuthIpcInvoker): OAuthAdapter {
  return {
    async refreshCredential(providerId: string, credential: OAuthCredentials): Promise<OAuthCredentials> {
      const ipc = oauthIpc ?? getDefaultOAuthIpc()
      const resultJson = await ipc.invoke(OAuthIpcChannels.REFRESH, providerId, JSON.stringify(credential))
      const result = JSON.parse(resultJson) as {
        success: boolean
        credentials?: OAuthCredentials
        error?: string
      }
      if (!result.success || !result.credentials) {
        throw new Error(result.error || `Failed to refresh OAuth credential for ${providerId}`)
      }
      return result.credentials
    },
    persistCredential(providerId: string, credential: OAuthCredentials): void {
      const settingsProviderId = toOAuthSettingsProviderId(providerId) || providerId
      settingsStore.setState((currentSettings) => ({
        providers: {
          ...(currentSettings.providers || {}),
          [settingsProviderId]: {
            ...(currentSettings.providers?.[settingsProviderId] || {}),
            oauth: credential,
          },
        },
      }))
    },
    clearCredential(providerId: string): void {
      const settingsProviderId = toOAuthSettingsProviderId(providerId) || providerId
      settingsStore.setState((currentSettings) => {
        const currentProviderSettings = currentSettings.providers?.[settingsProviderId] || {}
        return {
          providers: {
            ...(currentSettings.providers || {}),
            [settingsProviderId]: {
              ...currentProviderSettings,
              oauth: undefined,
            },
          },
        }
      })
    },
  }
}

export async function createModelDependencies(
  options: CreateModelDependenciesOptions = {}
): Promise<ModelDependencies> {
  const platformInfo = options.platformInfo ?? (await createDefaultPlatformInfo())
  const platformType = options.platformType ?? platformInfo.type

  return {
    storage: createStorageAdapter(options),
    request: options.request ?? createRequestAdapter(platformInfo, options.apiRequestClient),
    sentry: options.sentry ?? new RendererSentryAdapter(),
    getRemoteConfig: options.getRemoteConfig ?? settingActions.getRemoteConfig,
    oauth: options.oauth ?? (platformType === 'desktop' ? createDesktopOAuthAdapter(options.oauthIpc) : undefined),
    platformType,
  }
}

export async function createModel(
  settings: SessionSettings,
  dependencies?: ModelDependencies
): Promise<ModelInterface> {
  const globalSettings = settingsStore.getState().getSettings()
  const configs = await platform.getConfig()
  const modelDependencies = dependencies ?? (await createModelDependencies())
  return getModel(settings, globalSettings, configs, modelDependencies)
}
