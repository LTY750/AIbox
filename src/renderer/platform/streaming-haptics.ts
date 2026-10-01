import { triggerHaptic, type HapticIntensity } from './haptics'

export const STREAM_HAPTIC_MIN_INTERVAL_MS = 220
export const STREAM_HAPTIC_CHAR_THRESHOLD = 10

export interface StreamingHapticControllerOptions {
  enabled: boolean
  intensity?: HapticIntensity
  minIntervalMs?: number
  charThreshold?: number
  now?: () => number
}

export interface StreamingHapticController {
  consumeTextDelta(text: string): void
  reset(): void
  dispose(): void
}

function countTextUnits(text: string): number {
  return Array.from(text).length
}

/**
 * Rate-limits light haptic feedback while visible assistant text is streaming.
 * The first non-whitespace delta receives an immediate pulse; subsequent pulses
 * require both enough new text and enough elapsed time to avoid overwhelming the user.
 */
export function createStreamingHapticController({
  enabled,
  intensity = 'medium',
  minIntervalMs = STREAM_HAPTIC_MIN_INTERVAL_MS,
  charThreshold = STREAM_HAPTIC_CHAR_THRESHOLD,
  now = Date.now,
}: StreamingHapticControllerOptions): StreamingHapticController {
  let pendingTextUnits = 0
  let lastPulseAt: number | undefined
  let disposed = false

  const pulse = (timestamp: number) => {
    lastPulseAt = timestamp
    pendingTextUnits = 0
    try {
      void triggerHaptic('light', intensity).catch(() => {})
    } catch {
      // Haptics are optional and must never break stream processing.
    }
  }

  return {
    consumeTextDelta(text: string) {
      if (disposed || !enabled || !text.trim()) {
        return
      }

      const timestamp = now()
      if (lastPulseAt === undefined) {
        pulse(timestamp)
        return
      }

      pendingTextUnits += countTextUnits(text)
      if (pendingTextUnits < charThreshold || timestamp - lastPulseAt < minIntervalMs) {
        return
      }

      pulse(timestamp)
    },

    reset() {
      if (disposed) {
        return
      }
      pendingTextUnits = 0
      lastPulseAt = undefined
    },

    dispose() {
      disposed = true
      pendingTextUnits = 0
      lastPulseAt = undefined
    },
  }
}
