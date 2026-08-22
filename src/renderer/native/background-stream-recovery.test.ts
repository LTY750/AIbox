import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  notifyNativeStreamCancelled,
  recoverNativeStreamsAfterForeground,
  registerNativeStreamCancellationHandler,
  registerNativeStreamRecoveryHandler,
  resetNativeStreamRecoveryForTests,
} from './background-stream-recovery'

describe('native background stream recovery', () => {
  beforeEach(() => {
    resetNativeStreamRecoveryForTests()
  })

  afterEach(() => {
    resetNativeStreamRecoveryForTests()
  })

  it('does nothing until the stream bridge has registered a recovery handler', async () => {
    await expect(recoverNativeStreamsAfterForeground()).resolves.toBeUndefined()
  })

  it('coalesces simultaneous foreground recoveries into one bridge call', async () => {
    let resolveRecovery!: () => void
    const handler = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRecovery = resolve
        })
    )
    registerNativeStreamRecoveryHandler(handler)

    const first = recoverNativeStreamsAfterForeground()
    const second = recoverNativeStreamsAfterForeground()

    await vi.waitFor(() => expect(handler).toHaveBeenCalledOnce())
    expect(first).toBe(second)

    resolveRecovery()
    await expect(first).resolves.toBeUndefined()
  })

  it('keeps the newest registered bridge handler when an older one is removed', async () => {
    const first = vi.fn(async () => {})
    const second = vi.fn(async () => {})
    const removeFirst = registerNativeStreamRecoveryHandler(first)
    registerNativeStreamRecoveryHandler(second)

    removeFirst()
    await recoverNativeStreamsAfterForeground()

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledOnce()
  })

  it('allows a later foreground transition to retry after recovery fails', async () => {
    const handler = vi.fn().mockRejectedValueOnce(new Error('bridge unavailable')).mockResolvedValueOnce(undefined)
    registerNativeStreamRecoveryHandler(handler)

    await expect(recoverNativeStreamsAfterForeground()).rejects.toThrow('bridge unavailable')
    await expect(recoverNativeStreamsAfterForeground()).resolves.toBeUndefined()

    expect(handler).toHaveBeenCalledTimes(2)
  })

  it('forwards a native foreground-service cancellation to the active generation handler', () => {
    const handler = vi.fn()
    registerNativeStreamCancellationHandler(handler)

    notifyNativeStreamCancelled()

    expect(handler).toHaveBeenCalledOnce()
  })
})
