import platforms from '@/platform'
import { initSettingsStore } from '@/stores/settingsStore'

declare global {
  interface Window {
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
  }
}

let loadPromise: Promise<void> | null = null

export async function initGoogleAnalytics(): Promise<void> {
  const settings = await initSettingsStore()
  if (!settings.allowReportingAndTracking) return
  if (!loadPromise) {
    loadPromise = new Promise((resolve) => {
      const gtag = (...args: unknown[]) => {
        if (!window.dataLayer) window.dataLayer = []
        window.dataLayer.push(args)
      }
      window.gtag = window.gtag || gtag
      const script = document.createElement('script')
      script.async = true
      script.src = 'https://www.googletagmanager.com/gtag/js?id=G-B365F44W6E'
      script.onload = () => resolve()
      script.onerror = () => resolve()
      document.head.appendChild(script)
      window.gtag?.('js', new Date())
    })
  }
  await loadPromise
  await platforms.initTracking()
}
