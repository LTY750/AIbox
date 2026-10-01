import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'
import platform from '@/platform'

export type HapticEvent = 'light' | 'success' | 'warning' | 'error'
export type HapticIntensity = 'light' | 'medium' | 'strong'

const fallbackDurations: Record<HapticEvent, Record<HapticIntensity, number>> = {
  light: { light: 8, medium: 10, strong: 15 },
  success: { light: 15, medium: 20, strong: 30 },
  warning: { light: 12, medium: 15, strong: 22 },
  error: { light: 20, medium: 30, strong: 40 },
}

const impactStyles: Record<HapticIntensity, ImpactStyle> = {
  light: ImpactStyle.Light,
  medium: ImpactStyle.Medium,
  strong: ImpactStyle.Heavy,
}

/**
 * Trigger a lightweight haptic feedback signal without letting haptic
 * failures affect the surrounding user interaction or generation flow.
 */
export async function triggerHaptic(event: HapticEvent, intensity: HapticIntensity = 'medium'): Promise<void> {
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
      await Haptics.impact({ style: impactStyles[intensity] })
      return
    }
  } catch {
    // Fall through to the browser vibration API when Capacitor is unavailable
    // or the device has haptics disabled.
  }

  if (typeof navigator !== 'undefined') {
    try {
      navigator.vibrate?.(fallbackDurations[event][intensity])
    } catch {
      // Vibration is an optional enhancement and must never break the caller.
    }
  }
}
