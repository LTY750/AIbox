import { registerPlugin } from '@capacitor/core'
import { CHATBOX_BUILD_PLATFORM } from '@/variables'

interface SystemBarsPlugin {
  setStatusBarStyle(options: { style: 'light' | 'dark' }): Promise<void>
}

const SystemBars = registerPlugin<SystemBarsPlugin>('SystemBars')

function applyStatusBarStyle(): void {
  const theme = document.documentElement.dataset.theme
  const style = theme === 'dark' ? 'light' : 'dark'
  void SystemBars.setStatusBarStyle({ style }).catch((error) => {
    console.warn('Failed to update Android status bar style:', error)
  })
}

if (CHATBOX_BUILD_PLATFORM === 'android') {
  applyStatusBarStyle()

  const themeObserver = new MutationObserver((mutations) => {
    if (mutations.some((mutation) => mutation.attributeName === 'data-theme')) {
      applyStatusBarStyle()
    }
  })

  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  })
}
