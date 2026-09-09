import { afterEach, describe, expect, it, vi } from 'vitest'

type SafeAreaInsets = {
  top: number
  right: number
  bottom: number
  left: number
}

type SafeAreaListener = (data: { insets: SafeAreaInsets }) => void
type KeyboardListener = (info?: { keyboardHeight?: number }) => void
type ViewportListener = () => void

const safeAreaMock = vi.hoisted(() => ({
  getSafeAreaInsets: vi.fn(),
  listener: undefined as SafeAreaListener | undefined,
}))

const keyboardMock = vi.hoisted(() => ({
  listeners: new Map<string, KeyboardListener>(),
  addListener: vi.fn((event: string, listener: KeyboardListener) => {
    keyboardMock.listeners.set(event, listener)
    return Promise.resolve({ remove: vi.fn() })
  }),
}))

const viewportListeners = new Map<string, ViewportListener>()

vi.mock('capacitor-plugin-safe-area', () => ({
  SafeArea: {
    getSafeAreaInsets: safeAreaMock.getSafeAreaInsets,
    addListener: vi.fn((_event: string, listener: SafeAreaListener) => {
      safeAreaMock.listener = listener
      return Promise.resolve({ remove: vi.fn() })
    }),
  },
}))

vi.mock('@capacitor/keyboard', () => ({ Keyboard: keyboardMock }))
vi.mock('@capacitor/core', () => ({ registerPlugin: vi.fn(() => ({ setStatusBarStyle: vi.fn() })) }))

async function flushMicrotasks() {
  for (let i = 0; i < 5; i++) await Promise.resolve()
}

describe('mobile safe-area keyboard handling', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
    keyboardMock.listeners.clear()
    safeAreaMock.listener = undefined
    viewportListeners.clear()
  })

  it('releases the compressed layout as soon as the keyboard starts hiding', async () => {
    const setProperty = vi.fn()
    vi.stubGlobal('document', {
      documentElement: {
        dataset: {} as DOMStringMap,
        style: { setProperty },
      },
    })
    safeAreaMock.getSafeAreaInsets
      .mockReset()
      .mockResolvedValueOnce({ insets: { top: 24, right: 0, bottom: 18, left: 0 } })
      .mockResolvedValueOnce({ insets: { top: 24, right: 0, bottom: 26, left: 0 } })
      .mockResolvedValueOnce({ insets: { top: 24, right: 0, bottom: 26, left: 0 } })

    await import('./mobile_safe_area')
    await flushMicrotasks()

    expect(setProperty).toHaveBeenCalledWith('--mobile-safe-area-inset-bottom', '18px')

    keyboardMock.listeners.get('keyboardDidShow')?.({ keyboardHeight: 320 })
    expect(document.documentElement.dataset.mobileKeyboardOpen).toBe('true')
    expect(setProperty).toHaveBeenCalledWith('--mobile-keyboard-height', '320px')
    expect(setProperty).toHaveBeenCalledWith('--mobile-safe-area-inset-bottom', '0px')

    keyboardMock.listeners.get('keyboardWillHide')?.()
    expect(document.documentElement.dataset.mobileKeyboardOpen).toBe('false')
    expect(setProperty).toHaveBeenCalledWith('--mobile-keyboard-height', '0px')

    keyboardMock.listeners.get('keyboardDidHide')?.()
    await flushMicrotasks()

    const bottomValues = setProperty.mock.calls
      .filter((call) => call[0] === '--mobile-safe-area-inset-bottom')
      .map((call) => call[1])
    expect(bottomValues.at(-1)).toBe('26px')
  })

  it('refreshes horizontal insets after a viewport orientation change', async () => {
    const setProperty = vi.fn()
    vi.stubGlobal('document', {
      documentElement: {
        dataset: {} as DOMStringMap,
        style: { setProperty },
      },
    })
    vi.stubGlobal('window', {
      addEventListener: vi.fn((event: string, listener: ViewportListener) => {
        viewportListeners.set(event, listener)
      }),
    })
    safeAreaMock.getSafeAreaInsets
      .mockReset()
      .mockResolvedValueOnce({ insets: { top: 0, right: 0, bottom: 0, left: 138 } })
      .mockResolvedValueOnce({ insets: { top: 24, right: 0, bottom: 26, left: 0 } })

    await import('./mobile_safe_area')
    await flushMicrotasks()

    expect(setProperty).toHaveBeenCalledWith('--mobile-safe-area-inset-left', '138px')
    viewportListeners.get('orientationchange')?.()
    await flushMicrotasks()

    expect(setProperty).toHaveBeenCalledWith('--mobile-safe-area-inset-left', '0px')
    expect(setProperty).toHaveBeenCalledWith('--mobile-safe-area-inset-top', '24px')
  })
})
