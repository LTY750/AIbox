import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'
import platform from '@/platform'

export type HapticEvent = 'light' | 'success' | 'warning' | 'error'

const fallbackDurations: Record<HapticEvent, number> = {
  light: 10,
  success: 20,
  warning: 15,
  error: 30,
}

/**
 * Trigger a lightweight haptic feedback signal without letting haptic
 * failures affect the surrounding user interaction or generation flow.
 */
export async function triggerHaptic(event: HapticEvent): Promise<void> {
  if (platform.type !== 'mobile' && platform.type !== 'web') {
    return
  }

  try {
    if (platform.type === 'mobile') {
      if (event === 'success') {
        await Haptics.notification({ type: NotificationType.Success })
        return
      }
      if (event === 'error') {
        await Haptics.notification({ type: NotificationType.Error })
        return
      }
      if (event === 'warning') {
        await Haptics.notification({ type: NotificationType.Warning })
        return
      }
      await Haptics.impact({ style: ImpactStyle.Light })
      return
    }
  } catch {
    // Fall through to the browser vibration API when Capacitor is unavailable
    // or the device has haptics disabled.
  }

  if (typeof navigator !== 'undefined') {
    try {
      navigator.vibrate?.(fallbackDurations[event])
    } catch {
      // Vibration is an optional enhancement and must never break the caller.
    }
  }
}
