import type { ModelDependencies } from '../../types/adapters'

/**
 * Creates a fetch function that uses proxy when enabled,
 * or falls back to apiRequest for mobile CORS handling
 */
export function createFetchWithProxy(useProxy: boolean | undefined, dependencies: ModelDependencies) {
  return async (url: RequestInfo | URL, init?: RequestInit) => {
    const method = (init?.method || 'GET').toUpperCase()
    const headers = (init?.headers as Record<string, string>) || {}
    // `useProxy` doubles as the native-transport selector on mobile. The mobile
    // implementation does not rewrite the target URL, so this keeps direct
    // provider SSE streams out of the WebView.
    const shouldUseNativeTransport = useProxy === true || dependencies.platformType === 'mobile'

    if (method === 'POST') {
      // POST to AI providers may be billable; a transient network error can occur
      // after the server already processed the request. Retrying would double-charge.
      const response = await dependencies.request.apiRequest({
        url: url.toString(),
        method: 'POST',
        headers,
        body: init?.body,
        signal: init?.signal || undefined,
        useProxy: shouldUseNativeTransport,
        retry: 0,
      })
      return response
    } else {
      const response = await dependencies.request.apiRequest({
        url: url.toString(),
        method: 'GET',
        headers,
        signal: init?.signal || undefined,
        useProxy: shouldUseNativeTransport,
      })
      return response
    }
  }
}
