// 这个库解决了移动端异形屏的显示安全区域的问题，比如iPhoneX，iPhone11等
// 这个库引入后，将设置全局的css变量 --mobile-safe-area-inset-top, --mobile-safe-area-inset-bottom, --mobile-safe-area-inset-left, --mobile-safe-area-inset-right
// 通过这些变量，可以在css中设置安全区域的padding，margin等，来规避异形屏的显示问题
// 为了达到最好的效果，在 html 的 meta 标签中设置 viewport-fit=cover

import { SafeArea } from 'capacitor-plugin-safe-area'
import { Keyboard } from '@capacitor/keyboard'

type SafeAreaInsets = {
  top: number
  right: number
  bottom: number
  left: number
}

let keyboardOpen = false

function applySafeAreaInsets(insets: SafeAreaInsets) {
  for (const [key, value] of Object.entries(insets)) {
    const inset = key === 'bottom' && keyboardOpen ? 0 : value
    document.documentElement.style.setProperty(`--mobile-safe-area-inset-${key}`, `${inset}px`)
  }
}

function setKeyboardOpen(open: boolean) {
  keyboardOpen = open
  document.documentElement.dataset.mobileKeyboardOpen = String(open)
  if (open) {
    document.documentElement.style.setProperty('--mobile-safe-area-inset-bottom', '0px')
  }
}

SafeArea.getSafeAreaInsets().then(({ insets }) => {
  applySafeAreaInsets(insets)
})

SafeArea.getStatusBarHeight().then(({ statusBarHeight }) => {
  // console.log(statusBarHeight, 'statusbarHeight');
})
;(async () => {
  // when safe-area changed
  const eventListener = await SafeArea.addListener('safeAreaChanged', (data) => {
    applySafeAreaInsets(data.insets)
  })
  // eventListener.remove();
})()

Keyboard.addListener('keyboardWillShow', () => {
  setKeyboardOpen(true)
})

Keyboard.addListener('keyboardWillHide', () => {
  setKeyboardOpen(false)
})

Keyboard.addListener('keyboardDidShow', () => {
  setKeyboardOpen(true)
})

Keyboard.addListener('keyboardDidHide', () => {
  setKeyboardOpen(false)
  SafeArea.getSafeAreaInsets().then(({ insets }) => {
    applySafeAreaInsets(insets)
  })
})
