import { useEffect, useRef } from 'react'

export type MobileBackButtonEvent = {
  canGoBack: boolean
}

export type MobileBackHandler = (event: MobileBackButtonEvent) => boolean

type RegisteredHandler = {
  handler: MobileBackHandler
  id: number
  priority: number
}

let nextHandlerId = 0
const handlers: RegisteredHandler[] = []
const backStateListeners = new Set<(state: MobileBackNavigationState) => void>()
let canGoBackInHistory = false

export type MobileBackNavigationState = {
  hasRegisteredHandler: boolean
  canGoBackInHistory: boolean
  shouldInterceptBack: boolean
}

/** Chat routes are the native back-stack boundary on Android. */
export function isMobileChatRoute(pathname: string): boolean {
  return pathname === '/' || pathname.startsWith('/session/')
}

/** Only menu/page routes may consume browser history on mobile. */
export function shouldUseMobileHistoryBack(pathname: string, canGoBack: boolean): boolean {
  return canGoBack && !isMobileChatRoute(pathname)
}

function getBackNavigationState(): MobileBackNavigationState {
  const hasRegisteredHandler = handlers.length > 0
  return {
    hasRegisteredHandler,
    canGoBackInHistory,
    shouldInterceptBack: hasRegisteredHandler || canGoBackInHistory,
  }
}

function notifyBackStateListeners(): void {
  const state = getBackNavigationState()
  for (const listener of backStateListeners) {
    listener(state)
  }
}

/** Subscribe to the combined JS-layer and router history back state. */
export function subscribeMobileBackNavigationState(listener: (state: MobileBackNavigationState) => void): () => void {
  backStateListeners.add(listener)
  listener(getBackNavigationState())
  return () => {
    backStateListeners.delete(listener)
  }
}

/** Keep the native back-button callback aligned with the hash router history. */
export function setMobileBackHistoryState(canGoBack: boolean): void {
  if (canGoBackInHistory === canGoBack) {
    return
  }
  canGoBackInHistory = canGoBack
  notifyBackStateListeners()
}

/**
 * Register a UI layer in the Android back stack. Higher priorities run first;
 * registration order breaks ties so nested overlays close before their parents.
 */
export function registerMobileBackHandler(handler: MobileBackHandler, priority = 0): () => void {
  const registered: RegisteredHandler = { handler, id: nextHandlerId++, priority }
  handlers.push(registered)
  notifyBackStateListeners()

  return () => {
    const index = handlers.indexOf(registered)
    if (index >= 0) {
      handlers.splice(index, 1)
      notifyBackStateListeners()
    }
  }
}

export function dispatchMobileBack(event: MobileBackButtonEvent): boolean {
  const ordered = [...handlers].sort((left, right) => right.priority - left.priority || right.id - left.id)
  for (const { handler } of ordered) {
    if (handler(event)) {
      return true
    }
  }
  return false
}

/** React helper for components whose visibility represents a back-stack layer. */
export function useMobileBackHandler(handler: MobileBackHandler, enabled: boolean, priority = 0): void {
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    if (!enabled) {
      return
    }
    return registerMobileBackHandler((event) => handlerRef.current(event), priority)
  }, [enabled, priority])
}

/** Test-only reset that does not leak registrations between isolated suites. */
export function clearMobileBackHandlers(): void {
  handlers.length = 0
  nextHandlerId = 0
  canGoBackInHistory = false
  backStateListeners.clear()
}
