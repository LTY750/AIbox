import type { ApiRequestOptions, ModelDependencies } from '../../../types/adapters'
import type { SentryScope } from '../../../utils/sentry_adapter'
import { describe, expect, it, vi } from 'vitest'
import CustomOpenAIResponses from './custom-openai-responses'

function createDependencies(
  apiRequest: ModelDependencies['request']['apiRequest'],
  platformType: ModelDependencies['platformType'] = 'mobile'
): ModelDependencies {
  const scope: SentryScope = { setTag: vi.fn(), setExtra: vi.fn() }
  return {
    request: { apiRequest, fetchWithOptions: vi.fn() },
    storage: { saveImage: vi.fn(), getImage: vi.fn() },
    sentry: { captureException: vi.fn(), withScope: vi.fn((callback: (value: SentryScope) => void) => callback(scope)) },
    getRemoteConfig: vi.fn(),
    platformType,
  }
}

function createModel(
  apiRequest: ModelDependencies['request']['apiRequest'],
  platformType: ModelDependencies['platformType'] = 'mobile'
) {
  return new CustomOpenAIResponses(
    {
      apiKey: 'test-key',
      apiHost: 'https://example.com',
      apiPath: '/responses',
      model: { modelId: 'gpt-image-2', type: 'chat' },
      useProxy: false,
    },
    createDependencies(apiRequest, platformType)
  )
}

describe('CustomOpenAIResponses image support', () => {
  it('uses native HTTP to fetch models on mobile even when compatibility mode is disabled', async () => {
    const apiRequest = vi.fn(async (_options: ApiRequestOptions) => new Response(JSON.stringify({ data: [] })))
    const model = createModel(apiRequest)

    await expect(model.listModels()).resolves.toEqual([])
    expect(apiRequest).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://example.com/v1/models', method: 'GET', useProxy: true })
    )
  })

  it('uses the OpenAI Images API instead of the Responses API for generation', async () => {
    const apiRequest = vi.fn(
      async (_options: ApiRequestOptions) =>
        new Response(JSON.stringify({ data: [{ b64_json: 'AAAA' }] }), {
          headers: { 'content-type': 'application/json' },
        })
    )
    const model = createModel(apiRequest)

    await expect(model.paint({ prompt: 'draw a lighthouse', num: 1 })).resolves.toEqual(['data:image/png;base64,AAAA'])
    expect(apiRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://example.com/v1/images/generations',
        method: 'POST',
        useProxy: true,
        retry: 0,
      })
    )
  })
})
