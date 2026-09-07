// 这个库解决了移动端异形屏的显示安全区域的问题，比如iPhoneX，iPhone11等
// 这个库引入后，将设置全局的css变量 --mobile-safe-area-inset-top, --mobile-safe-area-inset-bottom, --mobile-safe-area-inset-left, --mobile-safe-area-inset-right
// 通过这些变量，可以在css中设置安全区域的padding，margin等，来规避异形屏的显示问题
// 为了达到最好的效果，在 html 的 meta 标签中设置 viewport-fit=cover

import { Keyboard, type KeyboardInfo } from '@capacitor/keyboard'
import { SafeArea } from 'capacitor-plugin-safe-area'
import './mobile_system_bars'

type SafeAreaInsets = {
  top: number
  right: number
  bottom: number
  left: number
}

let keyboardOpen = false
let latestInsets: SafeAreaInsets = { top: 0, right: 0, bottom: 0, left: 0 }

function applySafeAreaInsets(insets: SafeAreaInsets) {
  latestInsets = insets
  syncSafeAreaVariables()
}

function refreshSafeAreaInsets() {
  void SafeArea.getSafeAreaInsets()
    .then(({ insets }) => {
      applySafeAreaInsets(insets)
    })
    .catch((error) => {
      console.warn('Failed to refresh mobile safe area:', error)
    })
}

function syncSafeAreaVariables() {
  for (const [key, value] of Object.entries(latestInsets)) {
    const inset = key === 'bottom' && keyboardOpen ? 0 : value
    document.documentElement.style.setProperty(`--mobile-safe-area-inset-${key}`, `${inset}px`)
  }
}

function setKeyboardOpen(open: boolean) {
  keyboardOpen = open
  document.documentElement.dataset.mobileKeyboardOpen = String(open)
  if (!open) {
    document.documentElement.style.setProperty('--mobile-keyboard-height', '0px')
  }
  syncSafeAreaVariables()
}

function setKeyboardOpenWithHeight(info?: KeyboardInfo) {
  document.documentElement.style.setProperty('--mobile-keyboard-height', `${Math.max(0, info?.keyboardHeight ?? 0)}px`)
  setKeyboardOpen(true)
}

void SafeArea.getSafeAreaInsets()
  .then(({ insets }) => {
    applySafeAreaInsets(insets)
  })
  .catch((error) => {
    console.warn('Failed to read mobile safe area:', error)
  })

// Keep the CSS variables in sync when the keyboard, orientation, or system bars change.
void SafeArea.addListener('safeAreaChanged', (data) => {
  applySafeAreaInsets(data.insets)
}).catch((error) => {
  console.warn('Failed to listen for mobile safe area changes:', error)
})

// Some Android WebViews do not emit safeAreaChanged when an edge-to-edge
// window rotates. Refresh after viewport changes so a landscape side inset
// cannot remain applied to the next portrait layout.
if (typeof window !== 'undefined') {
  window.addEventListener('orientationchange', refreshSafeAreaInsets)
  window.addEventListener('resize', refreshSafeAreaInsets)
}

void Keyboard.addListener('keyboardWillShow', (info) => {
  setKeyboardOpenWithHeight(info)
}).catch((error) => {
  console.warn('Failed to listen for keyboardWillShow:', error)
})

void Keyboard.addListener('keyboardDidShow', (info) => {
  setKeyboardOpenWithHeight(info)
}).catch((error) => {
  console.warn('Failed to listen for keyboardDidShow:', error)
})

void Keyboard.addListener('keyboardWillHide', () => {
  // Release the compressed layout as soon as the hide animation starts so
  // content is not left under the retreating IME until keyboardDidHide.
  // keyboardDidHide below stays as a fallback for WebViews where the will
  // event may not fire; setKeyboardOpen(false) is idempotent.
  setKeyboardOpen(false)
  refreshSafeAreaInsets()
}).catch((error) => {
  console.warn('Failed to listen for keyboardWillHide:', error)
})

void Keyboard.addListener('keyboardDidHide', () => {
  setKeyboardOpen(false)
  refreshSafeAreaInsets()
}).catch((error) => {
  console.warn('Failed to listen for keyboardDidHide:', error)
})
