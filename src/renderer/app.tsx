import { SplashScreen } from '@capacitor/splash-screen'
import '@mantine/core/styles.css'
import '@mantine/spotlight/styles.css'
import { RouterProvider } from '@tanstack/react-router'
import { useAtomValue } from 'jotai'
import 'photoswipe/dist/photoswipe.css'
import { StrictMode, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { ErrorBoundary } from './components/common/ErrorBoundary'
import i18n from './i18n'
import { getLogger } from './lib/utils'
import platform from './platform'
import reportWebVitals from './reportWebVitals'
import { router } from './router'
import './static/globals.css'
import './static/index.css'
import { initLogAtom, migrationProcessAtom } from './stores/atoms/utilAtoms'
import * as migration from './stores/migration'
import { getMigrationErrorContext } from './stores/migration-error'
import queryClient from './stores/queryClient'
import { CHATBOX_BUILD_PLATFORM, CHATBOX_BUILD_TARGET } from './variables'

const log = getLogger('index')

if (CHATBOX_BUILD_TARGET === 'mobile_app') {
  document.documentElement.dataset.chatboxPlatform = CHATBOX_BUILD_PLATFORM
}

function installAndroidOverscrollFeedback() {
  if (CHATBOX_BUILD_TARGET !== 'mobile_app' || CHATBOX_BUILD_PLATFORM !== 'android') {
    return
  }

  type Edge = 'top' | 'bottom'
  type Gesture = {
    element: HTMLElement
    startY: number
    startScrollTop: number
    offset: number
    edge: Edge | null
    touchEnded: boolean
    pendingFling: boolean
  }

  let active: Gesture | null = null
  let cleanupTimer: ReturnType<typeof setTimeout> | null = null
  const getSurface = (target: EventTarget | null) => {
    if (!(target instanceof Element)) return null
    const surface = target.closest('.mobile-overscroll-surface')
    return surface instanceof HTMLElement ? surface : null
  }
  const clearCleanupTimer = () => {
    if (cleanupTimer) {
      clearTimeout(cleanupTimer)
      cleanupTimer = null
    }
  }
  const reset = () => {
    clearCleanupTimer()
    if (!active) return
    active.element.classList.remove('mobile-overscroll-active')
    active.element.style.transform = ''
    active = null
  }
  const animateBack = (gesture: Gesture) => {
    requestAnimationFrame(() => {
      if (active === gesture) gesture.element.style.transform = ''
    })
    clearCleanupTimer()
    cleanupTimer = setTimeout(() => {
      if (active === gesture) reset()
    }, 700)
  }
  const playEdgeFeedback = (gesture: Gesture, edge: Edge, distance: number) => {
    gesture.edge = edge
    gesture.pendingFling = false
    gesture.offset = edge === 'top' ? distance : -distance
    gesture.element.classList.add('mobile-overscroll-active')
    gesture.element.style.transform = `translate3d(0, ${gesture.offset}px, 0)`
    animateBack(gesture)
  }

  const onTouchStart = (event: TouchEvent) => {
    clearCleanupTimer()
    const touch = event.touches[0]
    const element = getSurface(event.target)
    if (!touch || !element) return
    active = {
      element,
      startY: touch.clientY,
      startScrollTop: element.scrollTop,
      offset: 0,
      edge: null,
      touchEnded: false,
      pendingFling: false,
    }
  }
  const onTouchMove = (event: TouchEvent) => {
    if (!active || active.touchEnded) return
    const touch = event.touches[0]
    if (!touch) return
    const { element, startY, startScrollTop } = active
    const delta = touch.clientY - startY
    const maxScrollTop = Math.max(0, element.scrollHeight - element.clientHeight)
    const atTop = startScrollTop <= 1 && delta > 0
    const atBottom = startScrollTop >= maxScrollTop - 1 && delta < 0
    const edge: Edge | null = delta > 0 ? 'top' : delta < 0 ? 'bottom' : null
    active.edge = edge
    if (!atTop && !atBottom) return
    const distance = Math.abs(delta)
    const resistance = 1 / (1 + distance / 220)
    const activeEdge: Edge = atTop ? 'top' : 'bottom'
    const offset = (activeEdge === 'top' ? 1 : -1) * Math.min(88, distance * 0.4 * resistance)
    active.edge = activeEdge
    active.offset = offset
    active.pendingFling = false
    element.classList.add('mobile-overscroll-active')
    element.style.transform = `translate3d(0, ${offset}px, 0)`
  }
  const onTouchEnd = () => {
    if (!active) return
    active.touchEnded = true
    if (active.offset !== 0) {
      animateBack(active)
      return
    }
    const maxScrollTop = Math.max(0, active.element.scrollHeight - active.element.clientHeight)
    const reachedEdge =
      active.edge === 'top'
        ? active.element.scrollTop <= 1
        : active.edge === 'bottom'
          ? active.element.scrollTop >= maxScrollTop - 1
          : false
    if (active.edge && reachedEdge) {
      playEdgeFeedback(active, active.edge, 52)
      return
    }
    active.pendingFling = active.edge !== null
    clearCleanupTimer()
    cleanupTimer = setTimeout(reset, 900)
  }
  const onScroll = (event: Event) => {
    if (!active || !active.touchEnded || !active.pendingFling || event.target !== active.element) return
    const { element, edge } = active
    if (!edge) return
    const maxScrollTop = Math.max(0, element.scrollHeight - element.clientHeight)
    const reachedEdge = edge === 'top' ? element.scrollTop <= 1 : element.scrollTop >= maxScrollTop - 1
    if (reachedEdge) playEdgeFeedback(active, edge, 52)
  }

  document.addEventListener('touchstart', onTouchStart, { passive: true })
  document.addEventListener('touchmove', onTouchMove, { passive: true })
  document.addEventListener('touchend', onTouchEnd, { passive: true })
  document.addEventListener('touchcancel', reset, { passive: true })
  document.addEventListener('scroll', onScroll, { passive: true, capture: true })
}

installAndroidOverscrollFeedback()

// 按需加载 polyfill
import './setup/load_polyfill'

// Show native scrollbars only while scrolling
import './setup/scrollbar_visibility'

// Publish the automation contract version during renderer startup.
import './setup/automation_contract'
// 引入保护代码
import './setup/protect'
import { QueryClientProvider } from '@tanstack/react-query'
import { initLastUsedModelStore } from './stores/lastUsedModelStore'
import { initOnboardingStore } from './stores/onboardingStore'
import { initLoginLicenseStateReconciliation } from './stores/premiumActions'
import { initRecentDirectoriesStore } from './stores/recentDirectoriesStore'
import { initSettingsStore } from './stores/settingsStore'
import { reportError } from './utils/sentry'

// 开发环境下引入错误测试工具
// if (process.env.NODE_ENV === 'development') {
//   import('./utils/error-testing')
// }

// Token estimation system initialization (runs in all environments)
import('./setup/token_estimation_init')

// 引入移动端安全区域代码，主要为了解决异形屏幕和 Android edge-to-edge 的问题
if (CHATBOX_BUILD_TARGET === 'mobile_app') {
  import('./setup/mobile_safe_area')
}

// ==========执行主应用初始化==============
async function initializeApp() {
  log.info('initializeApp')

  let migrationError: unknown
  try {
    // 数据迁移
    await migration.migrate()
    log.info('migrate done')
  } catch (e) {
    log.error('migrate error', e)
    migrationError = e
  }

  if (migrationError !== undefined) {
    const migrationErrorContext = getMigrationErrorContext(migrationError)
    reportError(migrationError, {
      domain: 'storage',
      extras: migrationErrorContext ? { ...migrationErrorContext } : undefined,
      operation: 'migration',
      priority: 'high',
      tags: migrationErrorContext ? { configVersion: migrationErrorContext.configVersion } : undefined,
    })
  }
}

function scheduleDeferredStartupTasks() {
  const run = () => {
    void Promise.allSettled([
      import('./setup/sentry_init').then(({ initSentry }) => initSentry()),
      import('./setup/ga_init').then(({ initGoogleAnalytics }) => initGoogleAnalytics()),
      import('./setup/plausible_init').then(({ initPlausibleTracking }) =>
        initPlausibleTracking((onResolved) => {
          router.subscribe('onResolved', ({ hrefChanged }) => onResolved(hrefChanged))
        })
      ),
      import('./setup/jk_analytics_init').then(({ initJkTracking }) => initJkTracking()),
      import('./setup/storage_clear'),
      import('./setup/mcp_bootstrap'),
    ])
  }

  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(run, { timeout: 2500 })
  } else {
    window.setTimeout(run, 1200)
  }
}

// ==========渲染节点==============

function InitPage() {
  const log = useAtomValue(initLogAtom)
  const [showLoadingLog, setShowLoadingLog] = useState(false)
  const migrationProcess = useAtomValue(migrationProcessAtom)

  return (
    <div className="flex flex-col items-center absolute top-0 left-0 w-full h-full">
      <p className="font-roboto font-normal opacity-40 mt-4 mb-2">
        {migrationProcess ? `Migrating...(${migrationProcess})` : 'loading...'}
      </p>
      <div className="">
        <div
          role="button"
          tabIndex={0}
          className="px-4 py-0 rounded-lg cursor-pointer select-none text-sm text-blue-600"
          onClick={() => setShowLoadingLog(!showLoadingLog)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              setShowLoadingLog(!showLoadingLog)
              e.preventDefault()
            }
          }}
        >
          {showLoadingLog ? 'Hide Loading Log' : 'Show Loading Log'}
        </div>
      </div>
      {/* 倒叙展示，能够看到最新的日志 */}
      {showLoadingLog && (
        <pre className="whitespace-pre-wrap flex-1 overflow-y-auto m-0 p-2">{[...log].reverse().join('\n')}</pre>
      )}
    </div>
  )
}

// initializeApp执行时间少于1s的话，将不会看到log
const tid = setTimeout(() => {
  ReactDOM.createRoot(document.getElementById('log-root') as HTMLElement).render(
    <StrictMode>
      <ErrorBoundary>
        <InitPage />
      </ErrorBoundary>
    </StrictMode>
  )
  if (platform.type === 'mobile') {
    SplashScreen.hide()
  }
}, 1000)

// 等待初始化完成后再渲染
initializeApp()
  .catch((e) => {
    // 初始化中的各个步骤已经捕获了错误，这里防止未来添加未捕获的逻辑
    reportError(e, {
      domain: 'application',
      handled: false,
      operation: 'app_initialization',
      priority: 'critical',
    })
    log.error('initializeApp error', e)
  })
  .finally(async () => {
    clearTimeout(tid)

    // 等待settings和onboarding初始化完成，避免闪屏
    const [settings] = await Promise.all([
      initSettingsStore(),
      initLastUsedModelStore(),
      initOnboardingStore(),
      initRecentDirectoriesStore(),
    ])

    i18n.changeLanguage(settings.language)
    initLoginLicenseStateReconciliation()

    scheduleDeferredStartupTasks()

    // Auto-updater and RAG maintenance are not first-screen work.
    if (platform.type === 'desktop') {
      window.setTimeout(() => {
        void Promise.allSettled([
          import('./stores/updateStore').then(({ initUpdateListeners }) => initUpdateListeners()),
          import('./setup/session_attachment_rag_maintenance').then(({ initSessionAttachmentRagMaintenance }) =>
            initSessionAttachmentRagMaintenance()
          ),
        ])
      }, 2000)
    }
    // Cleanup is intentionally not captured — listeners persist for the app lifetime

    // 初始化完成，可以开始渲染
    ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
      <StrictMode>
        <ErrorBoundary>
          <QueryClientProvider client={queryClient}>
            <RouterProvider router={router} />
          </QueryClientProvider>
        </ErrorBoundary>
      </StrictMode>
    )

    if (platform.type === 'mobile') {
      SplashScreen.hide()
    }
    const el = document.querySelector('.splash-screen')
    if (el) {
      el.addEventListener('animationend', () => {
        el.parentNode?.removeChild(el)
      })
      el.classList.add('splash-screen-fade-out')
    }

    if (window?.navigator?.storage) {
      navigator.storage?.persisted().then((persisted) => {
        if (!persisted) {
          navigator.storage?.persist()
        }
      })
    }
  })

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals()
