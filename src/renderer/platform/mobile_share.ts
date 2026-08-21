import { Share } from '@capacitor/share'

/** Share a native file/remote URL through the mobile system share sheet. */
export async function shareMobileUrl(url: string, title: string): Promise<boolean> {
  try {
    const { value: supported } = await Share.canShare()
    if (!supported) return false
    await Share.share({
      title,
      url,
      dialogTitle: title,
    })
    return true
  } catch (error) {
    // A dismissed share sheet is not an application failure. Callers can
    // surface unexpected errors if they need to retry the action.
    if (error instanceof DOMException && error.name === 'AbortError') return false
    throw error
  }
}
