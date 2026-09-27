import { afterEach, describe, expect, it, vi } from 'vitest'

const triggerHapticMock = vi.hoisted(() => vi.fn())

vi.mock('./haptics', () => ({
  triggerHaptic: triggerHapticMock,
}))

import {
  createStreamingHapticController,
  STREAM_HAPTIC_CHAR_THRESHOLD,
  STREAM_HAPTIC_MIN_INTERVAL_MS,
} from './streaming-haptics'

describe('createStreamingHapticController', () => {
  it('does not vibrate when disabled', () => {
    const controller = createStreamingHapticController({ enabled: false })

    controller.consumeTextDelta('Hello world')

    expect(triggerHapticMock).not.toHaveBeenCalled()
  })

  it('vibrates immediately on the first non-whitespace text delta', () => {
    const controller = createStreamingHapticController({ enabled: true })

    controller.consumeTextDelta('Hi')

    expect(triggerHapticMock).toHaveBeenCalledTimes(1)
    expect(triggerHapticMock).toHaveBeenCalledWith('light')
  })

  it('ignores whitespace until visible text arrives', () => {
    const controller = createStreamingHapticController({ enabled: true })

    controller.consumeTextDelta('  \n')
    expect(triggerHapticMock).not.toHaveBeenCalled()

    controller.consumeTextDelta('Hello')
    expect(triggerHapticMock).toHaveBeenCalledTimes(1)
  })

  it('rate-limits subsequent pulses by text volume and time', () => {
    let timestamp = 1_000
    const controller = createStreamingHapticController({
      enabled: true,
      now: () => timestamp,
    })

    controller.consumeTextDelta('Hello')
    expect(triggerHapticMock).toHaveBeenCalledTimes(1)

    timestamp += STREAM_HAPTIC_MIN_INTERVAL_MS
    controller.consumeTextDelta('123456789')
    expect(triggerHapticMock).toHaveBeenCalledTimes(1)

    controller.consumeTextDelta('0')
    expect(triggerHapticMock).toHaveBeenCalledTimes(2)

    timestamp += STREAM_HAPTIC_MIN_INTERVAL_MS - 1
    controller.consumeTextDelta('abcdefghij')
    expect(triggerHapticMock).toHaveBeenCalledTimes(2)

    timestamp += 1
    controller.consumeTextDelta('k')
    expect(triggerHapticMock).toHaveBeenCalledTimes(3)
  })

  it('accumulates text while the minimum interval has not elapsed', () => {
    let timestamp = 1_000
    const controller = createStreamingHapticController({
      enabled: true,
      now: () => timestamp,
    })

    controller.consumeTextDelta('Hello')
    controller.consumeTextDelta('123456789')
    expect(triggerHapticMock).toHaveBeenCalledTimes(1)

    timestamp += STREAM_HAPTIC_MIN_INTERVAL_MS
    controller.consumeTextDelta('!')
    expect(triggerHapticMock).toHaveBeenCalledTimes(2)
  })

  it('does not vibrate after disposal', () => {
    const controller = createStreamingHapticController({ enabled: true })

    controller.dispose()
    controller.consumeTextDelta('Hello world')

    expect(triggerHapticMock).not.toHaveBeenCalled()
  })

  it('resets the stream state without disposing the controller', () => {
    const controller = createStreamingHapticController({
      enabled: true,
      charThreshold: STREAM_HAPTIC_CHAR_THRESHOLD,
    })

    controller.consumeTextDelta('Hello')
    controller.reset()
    controller.consumeTextDelta('World')

    expect(triggerHapticMock).toHaveBeenCalledTimes(2)
  })

  it('does not expose the haptic failure to the caller', () => {
    triggerHapticMock.mockImplementationOnce(() => {
      throw new Error('haptics unavailable')
    })
    const controller = createStreamingHapticController({ enabled: true })

    expect(() => controller.consumeTextDelta('Hello')).not.toThrow()
  })
})


afterEach(() => {
  triggerHapticMock.mockReset()
})
