import type { FetchLike } from '@modelcontextprotocol/sdk/shared/transport.js'
import platform from '@/platform'
import { handleMobileRequest } from '@/utils/mobile-request'
import { normalizeMcpHeaders, validateRemoteMcpUrl, validateRemoteMcpUrlWithDns } from './security'
import type { MCPServerConfig } from './types'

function mergeHeaders(base?: Record<string, string>, requestHeaders?: HeadersInit): Headers {
  // Transport-generated headers (session ids, Accept, Content-Type) are
  // allowed to be added by the MCP SDK, but a configured authentication header
  // must not be replaced by a request-level value.
  const headers = new Headers(requestHeaders)
  new Headers(normalizeMcpHeaders(base)).forEach((value, key) => headers.set(key, value))
  return headers
}

function toRequestUrl(input: Parameters<FetchLike>[0]): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.toString()
  const requestLike = input as unknown as { url?: unknown }
  if (typeof requestLike.url === 'string') return requestLike.url
  throw new Error('Remote MCP request has no URL.')
}

export function createRemoteMcpFetch(serverConfig: MCPServerConfig): FetchLike {
  if (serverConfig.transport.type !== 'http') return globalThis.fetch
  const transport = serverConfig.transport
  const configuredUrl = new URL(validateRemoteMcpUrl(transport.url))
  const lookup = platform.resolveHostname?.bind(platform)

  return async (input, init) => {
    const requestLike = input as unknown as {
      headers?: HeadersInit
      method?: string
      body?: unknown
      signal?: AbortSignal
    }
    const requestUrl = new URL(await validateRemoteMcpUrlWithDns(toRequestUrl(input), lookup))
    if (requestUrl.origin !== configuredUrl.origin) {
      throw new Error('Remote MCP requests cannot leave the configured server origin.')
    }

    const headers = mergeHeaders(transport.headers, requestLike.headers)
    new Headers(init?.headers).forEach((value, key) => headers.set(key, value))
    // Re-apply the configured transport headers after SDK request headers so
    // Authorization, API keys, and other user-supplied credentials remain
    // authoritative for every MCP request.
    new Headers(normalizeMcpHeaders(transport.headers)).forEach((value, key) => headers.set(key, value))
    const method = init?.method || requestLike.method || 'GET'
    const body = init?.body ?? (typeof requestLike.body === 'string' ? requestLike.body : undefined)
    if (body !== undefined && body !== null && typeof body !== 'string') {
      throw new Error('Remote MCP requests only support text request bodies.')
    }
    const signal = init?.signal ?? requestLike.signal

    if (platform.type !== 'mobile') {
      return globalThis.fetch(requestUrl, { ...init, method, headers, body, signal, redirect: 'error' })
    }
    return handleMobileRequest(requestUrl.toString(), method, headers, body, signal, undefined, true, true)
  }
}
