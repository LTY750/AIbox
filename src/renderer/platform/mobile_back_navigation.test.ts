import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearMobileBackHandlers,
  dispatchMobileBack,
  type MobileBackButtonEvent,
  registerMobileBackHandler,
  setMobileBackHistoryState,
  shouldUseMobileHistoryBack,
  subscribeMobileBackNavigationState,
} from './mobile_back_navigation'

const event: MobileBackButtonEvent = { canGoBack: true }

describe('mobile back navigation registry', () => {
  afterEach(() => {
    clearMobileBackHandlers()
  })

  it('stops consuming history once the chat route is reached', () => {
    expect(shouldUseMobileHistoryBack('/settings/provider', true)).toBe(true)
    expect(shouldUseMobileHistoryBack('/', true)).toBe(false)
    expect(shouldUseMobileHistoryBack('/session/session-1', true)).toBe(false)
    expect(shouldUseMobileHistoryBack('/settings/provider', false)).toBe(false)
  })

  it('dispatches the highest priority handler first', () => {
    const calls: string[] = []
    registerMobileBackHandler(() => {
      calls.push('base')
      return true
    }, 10)
    registerMobileBackHandler(() => {
      calls.push('overlay')
      return true
    }, 20)

    expect(dispatchMobileBack(event)).toBe(true)
    expect(calls).toEqual(['overlay'])
  })

  it('uses newest registration for equally prioritized nested layers', () => {
    const calls: string[] = []
    registerMobileBackHandler(() => {
      calls.push('parent')
      return true
    }, 10)
    registerMobileBackHandler(() => {
      calls.push('child')
      return true
    }, 10)

    dispatchMobileBack(event)
    expect(calls).toEqual(['child'])
  })

  it('continues until a handler consumes the event', () => {
    const consumingHandler = vi.fn(() => true)
    const newestHandler = vi.fn(() => false)
    registerMobileBackHandler(consumingHandler)
    registerMobileBackHandler(newestHandler)

    expect(dispatchMobileBack(event)).toBe(true)
    expect(newestHandler).toHaveBeenCalledOnce()
    expect(consumingHandler).toHaveBeenCalledOnce()
  })

  it('unregisters handlers without affecting other layers', () => {
    const removed = vi.fn(() => true)
    const remaining = vi.fn(() => true)
    const unregister = registerMobileBackHandler(removed)
    registerMobileBackHandler(remaining)

    unregister()
    expect(dispatchMobileBack(event)).toBe(true)
    expect(removed).not.toHaveBeenCalled()
    expect(remaining).toHaveBeenCalledOnce()
  })

  it('publishes the combined handler and history state', () => {
    const states: Array<{ hasRegisteredHandler: boolean; canGoBackInHistory: boolean; shouldInterceptBack: boolean }> =
      []
    const unsubscribe = subscribeMobileBackNavigationState((state) => states.push(state))
    expect(states.at(-1)).toEqual({
      hasRegisteredHandler: false,
      canGoBackInHistory: false,
      shouldInterceptBack: false,
    })

    const unregister = registerMobileBackHandler(() => true)
    expect(states.at(-1)?.shouldInterceptBack).toBe(true)

    unregister()
    setMobileBackHistoryState(true)
    expect(states.at(-1)).toEqual({
      hasRegisteredHandler: false,
      canGoBackInHistory: true,
      shouldInterceptBack: true,
    })

    setMobileBackHistoryState(false)
    expect(states.at(-1)?.shouldInterceptBack).toBe(false)
    unsubscribe()
  })
})
