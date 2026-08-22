import platform from '@/platform'
import { getChatboxOrigin } from './remote'

function normalizeTargetUrl(url: string) {
  const targetUrl = new URL(url, getChatboxOrigin())
  // URL userinfo is an authentication credential. Never hand it to a native
  // browser, app handler, history database, or proxy.
  targetUrl.username = ''
  targetUrl.password = ''
  for (const key of [
    'access_token',
    'api_key',
    'apikey',
    'authorization',
    'password',
    'secret',
    'token',
    'web_auth_token',
  ]) {
    targetUrl.searchParams.delete(key)
  }
  return targetUrl
}

async function openExternalLink(url: string) {
  if (platform.type === 'mobile') {
    try {
      const { AppLauncher } = await import('@capacitor/app-launcher')
      await AppLauncher.openUrl({ url })
      return
    } catch (error) {
      console.warn('Failed to open link with AppLauncher, falling back to platform browser:', error)
    }
  }

  await platform.openLink(url)
}

export async function openLinkWithAuth(url: string): Promise<void> {
  const targetUrl = normalizeTargetUrl(url)
  // Never place a bearer or one-time authentication credential in an external
  // URL. Mobile browsers keep URLs in history and may expose them to logging
  // and third-party handlers; users can authenticate in the target browser.
  await openExternalLink(targetUrl.toString())
}
