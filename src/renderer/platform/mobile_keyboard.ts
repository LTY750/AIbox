import { Keyboard } from '@capacitor/keyboard'

const KEYBOARD_HIDE_TIMEOUT_MS = 300

/**
 * Finish the IME transition before changing mobile routes. Android can keep
 * the keyboard visible for a frame after a focused input's route is removed,
 * which temporarily changes the available WebView height.
 */
export async function hideMobileKeyboard(): Promise<void> {
  const keyboardWasOpen =
    typeof document !== 'undefined' && document.documentElement.dataset.mobileKeyboardOpen === 'true'
  const activeElement = typeof document !== 'undefined' ? document.activeElement : null
  if (activeElement && 'blur' in activeElement && typeof activeElement.blur === 'function') {
    activeElement.blur()
  }

  if (!keyboardWasOpen) {
    return
  }

  let timeout: ReturnType<typeof setTimeout> | undefined
  let removeListener: (() => Promise<void>) | undefined
  let resolveDidHide: (() => void) | undefined
  const didHide = new Promise<void>((resolve) => {
    resolveDidHide = resolve
  })

  try {
    const listener = await Keyboard.addListener('keyboardDidHide', () => {
      resolveDidHide?.()
    })
    removeListener = () => listener.remove()
    timeout = setTimeout(() => resolveDidHide?.(), KEYBOARD_HIDE_TIMEOUT_MS)

    await Keyboard.hide()
    await didHide
  } catch (error) {
    console.warn('Failed to hide mobile keyboard before navigation:', error)
  } finally {
    if (timeout) {
      clearTimeout(timeout)
    }
    await removeListener?.()
  }
}