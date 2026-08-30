import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRemoteMcpFetch } from './remote-fetch'
import type { MCPServerConfig } from './types'

vi.mock('@/platform', () => ({
  default: { type: 'web' },
}))

function createServer(): MCPServerConfig {
  return {
    id: 'modelscope',
    name: 'ModelScope',
    enabled: true,
    disabledTools: [],
    transport: {
      type: 'http',
      url: 'https://mcp.example.com/mcp',
      headers: {
        Authorization: 'Bearer configured-token',
        'X-API-Key': 'configured-api-key',
      },
    },
  }
}

describe('remote MCP fetch', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('keeps configured authentication headers authoritative over SDK headers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}'))
    vi.stubGlobal('fetch', fetchMock)

    const fetchRemote = createRemoteMcpFetch(createServer())
    await fetchRemote('https://mcp.example.com/mcp', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer sdk-token',
        'X-API-Key': 'sdk-api-key',
        Accept: 'application/json',
      },
      body: '{}',
    })

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit
    const headers = new Headers(request.headers)
    expect(headers.get('authorization')).toBe('Bearer configured-token')
    expect(headers.get('x-api-key')).toBe('configured-api-key')
    expect(headers.get('accept')).toBe('application/json')
    expect(request.redirect).toBe('error')
  })

  it('rejects requests that leave the configured server origin', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const fetchRemote = createRemoteMcpFetch(createServer())
    await expect(Promise.resolve().then(() => fetchRemote('https://other.example.com/mcp'))).rejects.toThrow(
      'cannot leave'
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
