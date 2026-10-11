// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { hideMobileKeyboard } from './mobile_keyboard'

const keyboardMock = vi.hoisted(() => {
  let didHide: (() => void) | undefined
  const remove = vi.fn(() => Promise.reject(new Error('listener cleanup failed')))
  return {
    Keyboard: {
      addListener: vi.fn((_event: string, listener: () => void) => {
        didHide = listener
        return { remove }
      }),
      hide: vi.fn(async () => didHide?.()),
    },
    remove,
  }
})

vi.mock('@capacitor/keyboard', () => keyboardMock)

describe('hideMobileKeyboard', () => {
  afterEach(() => {
    document.documentElement.dataset.mobileKeyboardOpen = 'false'
    keyboardMock.Keyboard.addListener.mockClear()
    keyboardMock.Keyboard.hide.mockClear()
    keyboardMock.remove.mockClear()
  })

  it('resolves when removing the keyboard listener fails', async () => {
    document.documentElement.dataset.mobileKeyboardOpen = 'true'

    await expect(hideMobileKeyboard()).resolves.toBeUndefined()
    expect(keyboardMock.Keyboard.hide).toHaveBeenCalledOnce()
    expect(keyboardMock.remove).toHaveBeenCalledOnce()
  })
})
