import platform from '@/platform'
import { ApiError, BaseError, NetworkError } from '../../shared/models/errors'
import { isLocalHost } from '../../shared/utils/network_utils'
import { handleMobileRequest } from './mobile-request'

interface RequestOptions {
  method: string
  headers?: RequestInit['headers']
  body?: RequestInit['body']
  signal?: AbortSignal
  retry?: number
  useProxy?: boolean
  connectTimeout?: number
  readTimeout?: number
  disableRedirects?: boolean
  responseType?: 'text' | 'json' | 'blob' | 'arraybuffer'
}

function isAbortError(error: unknown, signal?: AbortSignal): boolean {
  return signal?.aborted === true || (error instanceof DOMException && error.name === 'AbortError')
}

async function retryRequest<T>(fn: () => Promise<T>, retry: number, url: string, signal?: AbortSignal): Promise<T> {
  let requestError: BaseError | null = null

  for (let i = 0; i <= retry; i++) {
    try {
      return await fn()
    } catch (e) {
      if (isAbortError(e, signal)) {
        throw e
      }
      // 对 ApiError（通常代表 4xx/业务错误）不重试
      if (e instanceof ApiError) {
        throw e
      }
      let origin = 'unknown'
      try {
        origin = new URL(url, typeof window !== 'undefined' ? window.location.origin : 'http://localhost').origin
      } catch {
        // Intentionally ignore - origin will remain 'unknown' for error context
      }
      requestError = e instanceof BaseError ? e : new NetworkError((e as Error).message, origin)

      if (i < retry) {
        const delay = Math.min(4_000, 500 * 2 ** i)
        await new Promise<void>((resolve, reject) => {
          const onAbort = () => {
            signal?.removeEventListener('abort', onAbort)
            reject(new DOMException('Aborted', 'AbortError'))
          }
          if (!signal) {
            setTimeout(resolve, delay)
            return
          }
          const timeout = setTimeout(() => {
            signal.removeEventListener('abort', onAbort)
            resolve()
          }, delay)
          if (signal.aborted) {
            clearTimeout(timeout)
            onAbort()
            return
          }
          signal.addEventListener('abort', onAbort, { once: true })
        })
      }
    }
  }

  throw requestError || new Error('Unknown error')
}

function buildHeaders(options: RequestOptions, url: string): Headers {
  const headers = new Headers(options.headers)
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData
  if (!headers.has('Content-Type') && !isFormData) {
    headers.set('Content-Type', 'application/json')
  }

  if (options.useProxy && !isLocalHost(url) && platform.type !== 'mobile') {
    headers.set('CHATBOX-TARGET-URI', url)
    headers.set('CHATBOX-PLATFORM', platform.type)
  }

  return headers
}

async function doRequest(url: string, options: RequestOptions): Promise<Response> {
  const {
    signal,
    retry: requestedRetry,
    useProxy = false,
    body,
    method,
    connectTimeout,
    readTimeout,
    disableRedirects,
    responseType,
  } = options
  const retry = requestedRetry ?? (platform.type === 'mobile' && method.toUpperCase() !== 'GET' ? 0 : 3)
  let requestUrl = url
  const headers = buildHeaders(options, url)

  if (useProxy && !isLocalHost(url) && platform.type !== 'mobile') {
    const version = await platform.getVersion()
    headers.set('CHATBOX-VERSION', version || 'unknown')
    requestUrl = 'https://cors-proxy.chatboxai.app/proxy-api/completions'
  }

  const makeRequest = async () => {
    if (platform.type === 'mobile') {
      return handleMobileRequest(requestUrl, method, headers, body, signal, responseType, false, disableRedirects, {
        connectTimeout,
        readTimeout,
      })
    }

    const res = await fetch(requestUrl, { method, headers, body, signal })
    if (!res.ok) {
      const err = await res.text().catch(() => null)
      throw new ApiError(`Status Code ${res.status}`, err ?? undefined)
    }
    return res
  }

  return retryRequest(makeRequest, retry, requestUrl, signal)
}

export const apiRequest = {
  post(url: string, headers: Record<string, string>, body: RequestInit['body'], options?: Partial<RequestOptions>) {
    return doRequest(url, { ...options, method: 'POST', headers, body })
  },

  get(url: string, headers: Record<string, string>, options?: Partial<RequestOptions>) {
    return doRequest(url, { ...options, method: 'GET', headers })
  },
}

export function fetchWithProxy(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return doRequest(input.toString(), {
    method: init?.method || 'GET',
    headers: init?.headers,
    body: init?.body,
    signal: init?.signal || undefined,
    useProxy: true,
  })
}
