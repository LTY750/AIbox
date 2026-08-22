import { describe, expect, it, vi } from 'vitest'
import type { ModelDependencies } from '../../types/adapters'
import { createFetchWithProxy } from './fetch-proxy'

function createDependencies(platformType: 'desktop' | 'mobile') {
  const apiRequest = vi.fn().mockResolvedValue(new Response('ok'))
  return {
    dependencies: {
      platformType,
      request: { apiRequest },
    } as unknown as ModelDependencies,
    apiRequest,
  }
}

describe('createFetchWithProxy', () => {
  it('uses the native transport for mobile providers even when proxy is disabled', async () => {
    const { dependencies, apiRequest } = createDependencies('mobile')

    await createFetchWithProxy(false, dependencies)('https://api.example.com/v1/chat', {
      method: 'POST',
      headers: { Authorization: 'Bearer test' },
      body: JSON.stringify({ stream: true }),
    })

    expect(apiRequest).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'POST', retry: 0, useProxy: true })
    )
  })

  it('preserves the desktop proxy setting', async () => {
    const { dependencies, apiRequest } = createDependencies('desktop')

    await createFetchWithProxy(false, dependencies)('https://api.example.com/v1/chat', { method: 'POST' })

    expect(apiRequest).toHaveBeenCalledWith(expect.objectContaining({ useProxy: false }))
  })
})
