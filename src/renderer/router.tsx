import { createHashHistory, createRouter, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import platform from './platform'
import { setMobileBackHistoryState, shouldUseMobileHistoryBack } from './platform/mobile_back_navigation'
import { routeTree } from './routeTree.gen'
import { CHATBOX_BUILD_PLATFORM } from './variables'

const history = platform.type === 'web' ? undefined : createHashHistory()

// Create a new router instance
export const router = createRouter({
  routeTree,
  defaultNotFoundComponent: () => {
    const navigate = useNavigate()

    useEffect(() => {
      navigate({ to: '/', replace: true }) // 重定向到首页
    }, [navigate])

    return null
  },
  history,
})

if (CHATBOX_BUILD_PLATFORM === 'android' && history) {
  const syncMobileBackHistoryState = () => {
    setMobileBackHistoryState(shouldUseMobileHistoryBack(history.location.pathname, history.canGoBack()))
  }
  syncMobileBackHistoryState()
  history.subscribe(syncMobileBackHistoryState)
}

// Register the router instance for type safety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
