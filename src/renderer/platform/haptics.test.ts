import { afterEach, describe, expect, it, vi } from 'vitest'
import platform from '@/platform'

const hapticsMocks = vi.hoisted(() => ({
  impact: vi.fn().mockResolvedValue(undefined),
  notification: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@capacitor/haptics', () => ({
  Haptics: hapticsMocks,
  ImpactStyle: { Light: 'LIGHT', Medium: 'MEDIUM', Heavy: 'HEAVY' },
  NotificationType: {
    Error: 'ERROR',
    Success: 'SUCCESS',
    Warning: 'WARNING',
  },
}))

import { triggerHaptic } from './haptics'

describe('triggerHaptic', () => {
  const originalPlatformType = platform.type

  afterEach(() => {
    platform.type = originalPlatformType
    hapticsMocks.impact.mockClear()
    hapticsMocks.notification.mockClear()
  })

  it('uses Capacitor impact feedback for mobile generation progress', async () => {
    platform.type = 'mobile'

    await triggerHaptic('light')

    expect(hapticsMocks.impact).toHaveBeenCalledWith({ style: 'MEDIUM' })
    expect(hapticsMocks.notification).not.toHaveBeenCalled()
  })

  it('maps configured intensity to the native impact style', async () => {
    platform.type = 'mobile'

    await triggerHaptic('light', 'strong')

    expect(hapticsMocks.impact).toHaveBeenCalledWith({ style: 'HEAVY' })
  })

  it('uses Capacitor notification feedback for terminal generation states', async () => {
    platform.type = 'mobile'

    await triggerHaptic('success')
    await triggerHaptic('warning')
    await triggerHaptic('error')

    expect(hapticsMocks.notification.mock.calls).toEqual([
      [{ type: 'SUCCESS' }],
      [{ type: 'WARNING' }],
      [{ type: 'ERROR' }],
    ])
  })

  it('does not call native haptics on desktop', async () => {
    platform.type = 'desktop'

    await triggerHaptic('success')

    expect(hapticsMocks.impact).not.toHaveBeenCalled()
    expect(hapticsMocks.notification).not.toHaveBeenCalled()
  })
})
