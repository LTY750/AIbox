export function getSettingsBackPath(pathname: string): '/settings' | '/settings/provider' | '/' {
  if (pathname === '/settings') {
    return '/'
  }
  if (pathname.startsWith('/settings/provider/')) {
    return '/settings/provider'
  }
  return '/settings'
}
