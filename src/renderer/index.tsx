import { SplashScreen } from '@capacitor/splash-screen'
import { CHATBOX_BUILD_TARGET } from './variables'

function loadApplication() {
  void import('./app').catch((error) => {
    console.error('Failed to load the application:', error)
    const logRoot = document.getElementById('log-root')
    if (logRoot) logRoot.textContent = 'Failed to start Chatbox.'
  })
}

if (CHATBOX_BUILD_TARGET === 'mobile_app') {
  // Let the lightweight HTML splash paint before parsing the full React app.
  void SplashScreen.hide().finally(() => {
    window.requestAnimationFrame(loadApplication)
  })
} else {
  loadApplication()
}
