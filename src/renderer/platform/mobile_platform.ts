import { App } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import { Device } from '@capacitor/device'
import * as defaults from '@shared/defaults'
import type { Config, Settings, ShortcutSetting } from '@shared/types'
import localforage from 'localforage'
import { v4 as uuidv4 } from 'uuid'
import { parseLocale } from '@/i18n/parser'
import { parseFileWithMineru, testMineruConnection } from '@/packages/mineru'
import { parseFileWithTextIn } from '@/packages/textin'
import type { ImageGenerationStorage } from '@/storage/ImageGenerationStorage'
import type { SessionMetaStorage } from '@/storage/SessionMetaStorage'
import { SQLiteImageGenerationStorage } from '@/storage/SQLiteImageGenerationStorage'
import { SQLiteSessionMetaStorage } from '@/storage/SQLiteSessionMetaStorage'
import { CHATBOX_BUILD_PLATFORM } from '@/variables'
import { getBrowser, getOS } from '../packages/navigator'
import { handleMobileRequest } from '../utils/mobile-request'
import type { Platform, PlatformType } from './interfaces'
import type { KnowledgeBaseController } from './knowledge-base/interface'
import {
  dispatchMobileBack,
  subscribeMobileBackNavigationState,
} from './mobile_back_navigation'
import MobileExporter from './mobile_exporter'
import mobileLogger from './mobile_logger'
import { getSecureValue, removeSecureValue, setSecureValue } from './mobile_secure_storage'
import type { SessionAttachmentRagController } from './session-attachment-rag/interface'
import { MobileSQLiteStorage } from './storages'

export {
  extractSettingsSecrets,
  removeSettingsSecrets,
  restoreSettingsSecrets,
  setPath,
} from './mobile_settings_secrets'

import {
  extractSettingsSecrets,
  type MobileSettingsRecord,
  removeSettingsSecrets,
  restoreSettingsSecrets,
} from './mobile_settings_secrets'
import { parseFileLocallyInBrowser, parseUrlContentFree } from './web_platform_utils'

const SECURE_SETTINGS_KEY = 'chatbox.settings.secrets'

function summarizeDeepLink(url: string): string {
  try {
    const normalizedUrl = url.replace(/^chatbox-dev:\/\//, 'chatbox://')
    const parsedUrl = new URL(normalizedUrl.replace(/^chatbox:\/\//, 'https://'))
    // Keep query and fragment data out of diagnostics: deep links can carry
    // base64 provider configurations and one-time authentication values.
    return `${parsedUrl.protocol}//${parsedUrl.hostname}${parsedUrl.pathname}`
  } catch {
    return '[invalid URL]'
  }
}

export default class MobilePlatform extends MobileSQLiteStorage implements Platform {
  public type: PlatformType = 'mobile'

  public exporter = new MobileExporter()

  private navigationCallback: ((path: string) => void) | null = null
  // Deep links can arrive before __root.tsx wires onNavigate (cold start);
  // buffer the target path and flush it once the callback is registered.
  private pendingNavigationPath: string | null = null
  private _imageGenerationStorage: ImageGenerationStorage | null = null
  private _sessionMetaStorage: SessionMetaStorage | null = null
  private appStateCallbacks = new Set<(state: { isActive: boolean }) => void>()
  private backButtonToggleQueue = Promise.resolve()
  private lastBackButtonHandlerEnabled: boolean | null = null
  private canGoBackInHistory = false

  constructor() {
    super()
    mobileLogger.init().catch((e) => console.error('Failed to init mobile logger:', e))
    // 监听深度链接 (Deep Links)
    App.addListener('appUrlOpen', (event) => {
      console.debug('App URL opened:', summarizeDeepLink(event.url))
      this.handleDeepLink(event.url)
    })
    // Cold start: the native side only stores the launch intent (Bridge.intentUri)
    // and never fires appUrlOpen for it, so pull it once via getLaunchUrl().
    App.getLaunchUrl()
      .then((result) => {
        if (result?.url) {
          console.debug('App launched from URL:', summarizeDeepLink(result.url))
          this.handleDeepLink(result.url)
        }
      })
      .catch((error) => console.warn('Failed to get launch URL:', error))
    const appStateListener = App.addListener('appStateChange', (state) => {
      for (const callback of this.appStateCallbacks) {
        try {
          callback(state)
        } catch (error) {
          console.error('Mobile app state callback failed:', error)
        }
      }
    })
    // Promise.resolve also supports lightweight test doubles that return a
    // listener handle directly instead of Capacitor's Promise.
    void Promise.resolve(appStateListener).catch((error) => {
      console.warn('Failed to listen appStateChange:', error)
    })

    const backButtonListener = App.addListener('backButton', ({ canGoBack }) => {
      if (dispatchMobileBack({ canGoBack })) {
        return
      }

      // Hash-router entries live in the WebView's JS history, which can differ
      // from the native WebView back stack reported by Capacitor.
      if (this.canGoBackInHistory) {
        window.history.back()
        return
      }

      // The native callback is disabled at the chat boundary, so Android
      // normally handles this gesture and plays its back-to-home animation.
      // Keep an explicit exit only as a fallback for a callback toggle race.
      void App.exitApp().catch((error) => {
        console.warn('Failed to exit app after back navigation:', error)
      })
    })
    void Promise.resolve(backButtonListener).catch((error) => {
      console.warn('Failed to listen backButton:', error)
    })

    subscribeMobileBackNavigationState(({ canGoBackInHistory, shouldInterceptBack }) => {
      this.canGoBackInHistory = canGoBackInHistory
      this.syncBackButtonHandler(shouldInterceptBack)
    })
  }

  private syncBackButtonHandler(enabled: boolean): void {
    if (this.lastBackButtonHandlerEnabled === enabled) {
      return
    }
    this.lastBackButtonHandlerEnabled = enabled
    this.backButtonToggleQueue = this.backButtonToggleQueue
      .catch(() => undefined)
      .then(() => App.toggleBackButtonHandler({ enabled }))
      .catch((error) => {
        console.warn('Failed to synchronize native back button handler:', error)
      })
  }

  // 处理深度链接
  private handleDeepLink(url: string): void {
    try {
      // 支持 chatbox:// 和 chatbox-dev:// 两种协议（归一化处理）
      const normalizedUrl = url.replace(/^chatbox-dev:\/\//, 'chatbox://')
      // Android WebView parses non-special schemes as opaque-path URLs
      // (hostname === '', pathname === '//provider/import'), unlike Node which
      // fills the host. Swap to a special scheme so host/path/query parse
      // identically on every engine.
      const parsedUrl = new URL(normalizedUrl.replace(/^chatbox:\/\//, 'https://'))

      // 处理 provider 导入链接: chatbox://provider/import?config=<base64-encoded-config>
      if (parsedUrl.hostname === 'provider' && parsedUrl.pathname === '/import') {
        const encodedConfig = parsedUrl.searchParams.get('config') || ''
        const path = `/settings/provider?import=${encodeURIComponent(encodedConfig)}`
        this.triggerNavigation(path)
        return
      }

      // 处理 auth 回调链接: chatbox://auth/callback?ticket_id=xxx&status=success
      if (parsedUrl.hostname === 'auth' && parsedUrl.pathname === '/callback') {
        // 不需要，实际跳回到 app 后业务hooks useLogin 会处理后续动作
      }

      console.warn('Unhandled deep link:', summarizeDeepLink(url))
    } catch (error) {
      // Do not include the original URL or an exception message that may
      // embed it in logs.
      console.error('Failed to handle deep link:', error instanceof Error ? error.name : 'UnknownError')
    }
  }

  // 触发导航
  private triggerNavigation(path: string): void {
    if (this.navigationCallback) {
      this.navigationCallback(path)
    } else {
      // Navigation may not be wired yet (cold start before __root subscribes);
      // keep the path and flush it when onNavigate is registered.
      this.pendingNavigationPath = path
    }
  }

  // 设置导航回调（类似 electronAPI.onNavigate）
  public onNavigate(callback: (path: string) => void): () => void {
    this.navigationCallback = callback
    if (this.pendingNavigationPath) {
      const path = this.pendingNavigationPath
      this.pendingNavigationPath = null
      callback(path)
    }
    return () => {
      this.navigationCallback = null
    }
  }

  public async getVersion(): Promise<string> {
    return (await App.getInfo()).version
  }
  public async getPlatform(): Promise<string> {
    return CHATBOX_BUILD_PLATFORM
  }
  public async getArch(): Promise<string> {
    // Capacitor's DeviceInfo intentionally omits CPU architecture. Prefer the
    // newer User-Agent Client Hints value when available and fall back to the
    // user agent so x86 Android emulators are not reported as arm64.
    const userAgentData = (
      navigator as Navigator & {
        userAgentData?: { architecture?: string }
      }
    ).userAgentData
    const architecture = userAgentData?.architecture?.toLowerCase()
    if (architecture) {
      if (architecture.includes('arm')) return 'arm64'
      if (architecture.includes('86')) return architecture.includes('64') ? 'x64' : 'ia32'
    }

    const userAgent = navigator.userAgent.toLowerCase()
    if (/(x86_64|amd64|win64|x64)/.test(userAgent)) return 'x64'
    if (/(i[3-6]86|x86)/.test(userAgent)) return 'ia32'
    if (/(arm64|aarch64|armv8)/.test(userAgent)) return 'arm64'
    return 'unknown'
  }
  public async shouldUseDarkColors(): Promise<boolean> {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
  }
  public onSystemThemeChange(callback: () => void): () => void {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', callback)
    return () => {
      window.matchMedia('(prefers-color-scheme: dark)').removeEventListener('change', callback)
    }
  }
  public onWindowShow(callback: () => void): () => void {
    return () => null
  }
  public onWindowFocused(callback: () => void): () => void {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        callback()
      }
    }
    const removeAppStateListener = this.onAppStateChange(({ isActive }) => {
      if (isActive) {
        callback()
      }
    })
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      removeAppStateListener()
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }
  public onAppStateChange(callback: (state: { isActive: boolean }) => void): () => void {
    this.appStateCallbacks.add(callback)
    return () => {
      this.appStateCallbacks.delete(callback)
    }
  }
  public async isWindowFocused(): Promise<boolean> {
    try {
      const state = await App.getState()
      return state.isActive && document.visibilityState === 'visible'
    } catch {
      return document.visibilityState === 'visible'
    }
  }
  public onUpdateDownloaded(callback: () => void): () => void {
    return () => null
  }
  public async openLink(url: string): Promise<void> {
    let targetUrl: URL
    try {
      targetUrl = new URL(url)
    } catch {
      throw new Error('Only absolute http and https links are supported')
    }
    if (targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:') {
      throw new Error('Only http and https links are supported')
    }

    try {
      // 使用 Browser.open 打开
      // 原生插件不受 JavaScript 用户手势限制，可以在异步调用后正常工作
      // iOS: 会使用 SFSafariViewController 而不是普通 webview
      // Android: 使用 Chrome Custom Tabs
      await Browser.open({
        url: targetUrl.toString(),
      })
    } catch (error) {
      console.error('Failed to open link with Browser plugin:', error)
      // 降级方案：使用 window.open（但在异步调用后可能被阻止）
      window.open(targetUrl.toString())
    }
  }
  public async getDeviceName(): Promise<string> {
    try {
      const info = await Device.getInfo()

      // iOS: 直接返回 model 型号（如 "iPhone13,4"），官网会 mapping 成 "iPhone 13 Pro Max"
      if (info.platform === 'ios') {
        return info.model
      }

      // Android: 使用降级策略
      // 优先使用 name（用户自定义的设备名称）
      if (info.name) {
        return info.name
      }
      // 如果没有 name，返回 manufacturer + model
      if (info.manufacturer && info.model) {
        return `${info.manufacturer} ${info.model}`
      }
      // 降级到 model 或 platform
      return info.model || info.platform || getOS()
    } catch (error) {
      console.error('Failed to get device info:', error)
      // 降级方案：返回 OS 信息
      return getOS()
    }
  }
  public async getInstanceName(): Promise<string> {
    return `${getOS()} / ${getBrowser()}`
  }
  public async getLocale() {
    const lang = window.navigator.language
    return parseLocale(lang)
  }
  public async ensureShortcutConfig(config: ShortcutSetting): Promise<void> {
    return
  }
  public async ensureProxyConfig(config: { proxy?: string }): Promise<void> {
    return
  }
  public async relaunch(): Promise<void> {
    location.reload()
  }

  public async getConfig(): Promise<Config> {
    let value = await this.getStoreValue('configs')
    if (value === undefined || value === null) {
      value = defaults.newConfigs()
      this.setStoreValue('configs', value)
    }
    return value
  }

  public async setStoreValue(key: string, value: any): Promise<void> {
    if (key === 'settings' && value && typeof value === 'object') {
      const secrets = extractSettingsSecrets(value)
      // Replace the snapshot so clearing a provider key also removes its old
      // secure value instead of leaving an orphaned credential behind.
      await setSecureValue(SECURE_SETTINGS_KEY, JSON.stringify(secrets))
      return super.setStoreValue(key, removeSettingsSecrets(value))
    }
    return super.setStoreValue(key, value)
  }

  public async getStoreValue(key: string): Promise<any> {
    const value = await super.getStoreValue(key)
    if (key !== 'settings' || !value || typeof value !== 'object') return value
    // Sanitize legacy snapshots on read as well as on write. This matters for
    // installs upgraded from a build that persisted local stdio MCP entries:
    // an existing secure-settings blob must not prevent that stale data from
    // being removed from SQLite.
    const sanitizedValue = removeSettingsSecrets(value as MobileSettingsRecord)
    if (JSON.stringify(sanitizedValue) !== JSON.stringify(value)) {
      await super.setStoreValue(key, sanitizedValue)
    }
    // A decryption error is intentionally allowed to propagate so the
    // settings screen can surface recovery guidance instead of silently
    // presenting a credential-less profile.
    const rawSecrets = await getSecureValue(SECURE_SETTINGS_KEY)
    if (!rawSecrets) {
      const secrets = extractSettingsSecrets(value)
      if (Object.keys(secrets).length > 0) {
        await setSecureValue(SECURE_SETTINGS_KEY, JSON.stringify(secrets))
      }
      return Object.keys(secrets).length > 0 ? restoreSettingsSecrets(sanitizedValue, secrets) : sanitizedValue
    }
    try {
      const secrets = JSON.parse(rawSecrets) as Record<string, unknown>
      return restoreSettingsSecrets(sanitizedValue, secrets)
    } catch {
      return sanitizedValue
    }
  }

  public async getAllStoreValues(): Promise<{ [key: string]: any }> {
    // Never rehydrate secure settings in bulk reads: backup/export callers
    // must receive the persisted, redacted snapshot.
    return super.getAllStoreValues()
  }

  public async delStoreValue(key: string): Promise<void> {
    if (key === 'settings') await removeSecureValue(SECURE_SETTINGS_KEY)
    return super.delStoreValue(key)
  }
  public async getSettings(): Promise<Settings> {
    let value = await this.getStoreValue('settings')
    if (value === undefined || value === null) {
      value = defaults.settings()
      this.setStoreValue('settings', value)
    }
    return value
  }

  public async getStoreBlob(key: string): Promise<string | null> {
    return localforage.getItem<string>(key)
  }
  public async setStoreBlob(key: string, value: string): Promise<void> {
    await localforage.setItem(key, value)
  }
  public async delStoreBlob(key: string) {
    return localforage.removeItem(key)
  }
  public async listStoreBlobKeys(): Promise<string[]> {
    return localforage.keys()
  }

  public async initTracking() {
    const GAID = 'G-B365F44W6E'
    try {
      const conf = await this.getConfig()
      window.gtag('config', GAID, {
        app_name: 'chatbox',
        user_id: conf.uuid,
        client_id: conf.uuid,
        app_version: await this.getVersion(),
        chatbox_platform_type: 'mobile',
        chatbox_platform: await this.getPlatform(),
        app_platform: await this.getPlatform(),
      })
    } catch (e) {
      window.gtag('config', GAID, {
        app_name: 'chatbox',
      })
      throw e
    }
  }
  public trackingEvent(name: string, params: { [key: string]: string }) {
    window.gtag('event', name, params)
  }

  public async shouldShowAboutDialogWhenStartUp(): Promise<boolean> {
    return false
  }

  public async appLog(level: string, message: string): Promise<void> {
    mobileLogger.log(level, message)
  }

  public async exportLogs(): Promise<string> {
    return mobileLogger.exportLogs()
  }

  public async clearLogs(): Promise<void> {
    return mobileLogger.clearLogs()
  }

  public async ensureAutoLaunch(enable: boolean) {
    return
  }

  async parseFileLocally(file: File): Promise<{ key?: string; isSupported: boolean; errorCode?: string }> {
    const result = await parseFileLocallyInBrowser(file)
    if (!result.isSupported) {
      return { isSupported: false, errorCode: result.errorCode }
    }
    const key = `parseFile-${uuidv4()}`
    await this.setStoreBlob(key, result.text)
    return { key, isSupported: true }
  }

  async parseFileWithMineru(
    file: File,
    apiToken: string
  ): Promise<{ success: boolean; content?: string; error?: string; cancelled?: boolean }> {
    try {
      const content = await parseFileWithMineru(file, { apiToken })
      return { success: true, content }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return { success: false, cancelled: true, error: 'Operation cancelled' }
      }
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  async testMineruConnection(apiToken: string): Promise<{ success: boolean; error?: string }> {
    return testMineruConnection(apiToken)
  }

  async parseFileWithTextin(
    file: File,
    credentials: { appId: string; secretCode: string }
  ): Promise<{ success: boolean; content?: string; error?: string; cancelled?: boolean }> {
    try {
      const content = await parseFileWithTextIn(file, credentials, undefined, (url, init) =>
        handleMobileRequest(url, init.method || 'GET', new Headers(init.headers), init.body, init.signal || undefined)
      )
      return { success: true, content }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  getLocalFilePath(file: File): string {
    return file.path || ''
  }

  public async parseUrl(url: string): Promise<{ key: string; title: string }> {
    return parseUrlContentFree(url)
  }

  public async isFullscreen() {
    return true
  }

  public async setFullscreen(enabled: boolean): Promise<void> {
    return
  }

  installUpdate(): Promise<void> {
    throw new Error('Method not implemented.')
  }

  public getKnowledgeBaseController(): KnowledgeBaseController {
    throw new Error('Method not implemented.')
  }

  public getSessionAttachmentRagController(): SessionAttachmentRagController {
    throw new Error('Session attachment RAG is not implemented on mobile.')
  }

  public getImageGenerationStorage(): ImageGenerationStorage {
    if (!this._imageGenerationStorage) {
      this._imageGenerationStorage = new SQLiteImageGenerationStorage()
    }
    return this._imageGenerationStorage
  }

  public getSessionMetaStorage(): SessionMetaStorage {
    if (!this._sessionMetaStorage) {
      this._sessionMetaStorage = new SQLiteSessionMetaStorage()
    }
    return this._sessionMetaStorage
  }

  public minimize() {
    return Promise.resolve()
  }

  public maximize() {
    return Promise.resolve()
  }

  public unmaximize() {
    return Promise.resolve()
  }

  public closeWindow() {
    return Promise.resolve()
  }

  public isMaximized() {
    return Promise.resolve(true)
  }

  public onMaximizedChange() {
    return () => null
  }
}
