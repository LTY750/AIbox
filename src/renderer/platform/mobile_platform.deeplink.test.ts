import { App } from '@capacitor/app'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearMobileBackHandlers, setMobileBackHistoryState } from './mobile_back_navigation'
import MobilePlatform from './mobile_platform'

type AppEvent = { url: string } | { canGoBack: boolean } | { isActive: boolean }
type AppEventHandler = (event: AppEvent) => void

const browserPlugin = vi.hoisted(() => ({ open: vi.fn(() => Promise.resolve()) }))

// Test-double for the native App plugin. Keeps registered listeners so tests
// can emit appUrlOpen events, and controls what getLaunchUrl() resolves with
// (the cold-start path that only exists natively).
const appPlugin = vi.hoisted(() => {
  const toggleBackButtonHandler = vi.fn(() => Promise.resolve())
  const state = {
    listeners: new Map<string, AppEventHandler[]>(),
    launchUrl: undefined as { url: string } | undefined,
    toggleBackButtonHandler,
    emit(event: string, payload: AppEvent) {
      for (const cb of state.listeners.get(event) ?? []) cb(payload)
    },
    reset() {
      state.listeners.clear()
      state.launchUrl = undefined
      toggleBackButtonHandler.mockClear()
    },
  }
  return state
})

vi.mock('@capacitor/app', () => ({
  App: {
    addListener: vi.fn((event: string, cb: AppEventHandler) => {
      const list = appPlugin.listeners.get(event) ?? []
      list.push(cb)
      appPlugin.listeners.set(event, list)
      return { remove: () => undefined }
    }),
    getLaunchUrl: vi.fn(() => Promise.resolve(appPlugin.launchUrl)),
    getInfo: vi.fn(() => Promise.resolve({ version: '0.0.1' })),
    getState: vi.fn(() => Promise.resolve({ isActive: true })),
    exitApp: vi.fn(() => Promise.resolve()),
    toggleBackButtonHandler: appPlugin.toggleBackButtonHandler,
  },
}))

vi.mock('@capacitor/browser', () => ({ Browser: browserPlugin }))

// MobileSQLiteStorage eagerly opens a connection in its constructor chain; the
// node test environment has no native SQLite plugin, so stub the connection layer.
vi.mock('@/storage/sqliteConnection', () => ({
  getSharedSQLiteDatabase: vi.fn(() =>
    Promise.resolve({
      open: () => Promise.resolve(),
      run: () => Promise.resolve({}),
      query: () => Promise.resolve({ values: [] }),
      close: () => Promise.resolve(),
    })
  ),
}))

vi.mock('@/platform', () => ({
  default: {
    type: 'mobile',
    appLog: vi.fn().mockResolvedValue(undefined),
  },
}))

const flushMicrotasks = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve()
}

describe('MobilePlatform deep links', () => {
  beforeEach(() => {
    appPlugin.reset()
    clearMobileBackHandlers()
    browserPlugin.open.mockReset()
    browserPlugin.open.mockResolvedValue(undefined)
    vi.stubGlobal('window', { history: { back: vi.fn() } })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('flushes a cold-start launch URL once navigation is wired', async () => {
    appPlugin.launchUrl = { url: 'chatbox://provider/import?config=eyJpZCI6ImEifQ' }
    const platform = new MobilePlatform()
    await flushMicrotasks()

    const navigate = vi.fn()
    platform.onNavigate(navigate)

    expect(navigate).toHaveBeenCalledWith('/settings/provider?import=eyJpZCI6ImEifQ')
  })

  it('normalizes chatbox-dev scheme on warm appUrlOpen events', async () => {
    const platform = new MobilePlatform()
    const navigate = vi.fn()
    platform.onNavigate(navigate)

    appPlugin.emit('appUrlOpen', { url: 'chatbox-dev://provider/import?config=eyJpZCI6ImIifQ' })

    expect(navigate).toHaveBeenCalledWith('/settings/provider?import=eyJpZCI6ImIifQ')
  })

  it('ignores unrelated URLs without throwing', async () => {
    const platform = new MobilePlatform()
    const navigate = vi.fn()
    platform.onNavigate(navigate)

    appPlugin.emit('appUrlOpen', { url: 'https://example.com/path' })
    appPlugin.emit('appUrlOpen', { url: 'not a url' })

    expect(navigate).not.toHaveBeenCalled()
  })

  it('only opens absolute http and https links', async () => {
    const platform = new MobilePlatform()

    await platform.openLink('https://example.com/docs')
    expect(browserPlugin.open).toHaveBeenCalledWith({ url: 'https://example.com/docs' })

    await expect(platform.openLink('javascript:alert(1)')).rejects.toThrow('Only http and https links are supported')
    await expect(platform.openLink('/relative/path')).rejects.toThrow(
      'Only absolute http and https links are supported'
    )
    expect(browserPlugin.open).toHaveBeenCalledTimes(1)
  })

  it('does not log deep-link query payloads', () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      const platform = new MobilePlatform()
      platform.onNavigate(vi.fn())
      appPlugin.emit('appUrlOpen', {
        url: 'chatbox://unknown/path?config=super-secret-base64&token=secret-token',
      })

      const output = [...debug.mock.calls, ...warn.mock.calls].flat().join(' ')
      expect(output).not.toContain('super-secret-base64')
      expect(output).not.toContain('secret-token')
      expect(output).toContain('unknown/path')
      expect(output).not.toContain('?')
    } finally {
      debug.mockRestore()
      warn.mockRestore()
    }
  })

  it('does not navigate on normal cold start without a launch URL', async () => {
    const platform = new MobilePlatform()
    await flushMicrotasks()

    const navigate = vi.fn()
    platform.onNavigate(navigate)

    expect(navigate).not.toHaveBeenCalled()
  })

  it('uses JS router history when native WebView history is unavailable', () => {
    new MobilePlatform()
    setMobileBackHistoryState(true)
    const historyBack = window.history.back as ReturnType<typeof vi.fn>
    appPlugin.emit('backButton', { canGoBack: false })

    expect(historyBack).toHaveBeenCalledOnce()
    expect(vi.mocked(App.exitApp)).not.toHaveBeenCalled()
  })

  it('keeps the native handler disabled at the root and enables it for history', async () => {
    new MobilePlatform()
    await flushMicrotasks()
    expect(appPlugin.toggleBackButtonHandler).toHaveBeenLastCalledWith({ enabled: false })

    setMobileBackHistoryState(true)
    await flushMicrotasks()
    expect(appPlugin.toggleBackButtonHandler).toHaveBeenLastCalledWith({ enabled: true })
  })

  it('exits when back has no JS router history', () => {
    new MobilePlatform()
    appPlugin.emit('backButton', { canGoBack: true })

    expect(vi.mocked(App.exitApp)).toHaveBeenCalledOnce()
    expect(window.history.back).not.toHaveBeenCalled()
  })
})
