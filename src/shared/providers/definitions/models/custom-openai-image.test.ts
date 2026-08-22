import type { ApiRequestOptions, ModelDependencies } from '@shared/types/adapters'
import type { SentryScope } from '@shared/utils/sentry_adapter'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CustomOpenAI from './custom-openai'

const mockScope: SentryScope = {
  setTag: vi.fn(),
  setExtra: vi.fn(),
}

function createDependencies(
  apiRequest: ModelDependencies['request']['apiRequest'],
  platformType: ModelDependencies['platformType'] = 'mobile'
): ModelDependencies {
  return {
    request: {
      apiRequest,
      fetchWithOptions: vi.fn(),
    },
    storage: {
      saveImage: vi.fn(),
      getImage: vi.fn(),
    },
    sentry: {
      captureException: vi.fn(),
      withScope: vi.fn((callback: (scope: SentryScope) => void) => callback(mockScope)),
    },
    getRemoteConfig: vi.fn(),
    platformType,
  }
}

function createModel(
  apiRequest: ModelDependencies['request']['apiRequest'],
  options: { useProxy?: boolean; platformType?: ModelDependencies['platformType'] } = {}
) {
  return new CustomOpenAI(
    {
      apiKey: 'test-key',
      apiHost: 'https://example.com/v1',
      apiPath: '/chat/completions',
      model: { modelId: 'gpt-image-2', type: 'image' },
      useProxy: options.useProxy ?? true,
    },
    createDependencies(apiRequest, options.platformType)
  )
}

describe('CustomOpenAI image generation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses native HTTP for model discovery on mobile even when the proxy switch is off', async () => {
    const apiRequest = vi.fn(
      async (_options: ApiRequestOptions) =>
        new Response(
          JSON.stringify({
            object: 'list',
            data: [{ id: 'gpt-image-2', object: 'model', created: 0 }],
          })
        )
    )
    const model = createModel(apiRequest, { useProxy: false, platformType: 'mobile' })

    await expect(model.listModels()).resolves.toEqual([{ modelId: 'gpt-image-2', type: 'chat' }])
    expect(apiRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://example.com/v1/models',
        method: 'GET',
        useProxy: true,
      })
    )
  })

  it('keeps the proxy switch disabled for model discovery on desktop', async () => {
    const apiRequest = vi.fn(
      async (_options: ApiRequestOptions) => new Response(JSON.stringify({ object: 'list', data: [] }))
    )
    const model = createModel(apiRequest, { useProxy: false, platformType: 'desktop' })

    await expect(model.listModels()).resolves.toEqual([])
    expect(apiRequest).toHaveBeenCalledWith(expect.objectContaining({ useProxy: false }))
  })

  it('generates images through the OpenAI-compatible images endpoint', async () => {
    const apiRequest = vi.fn(
      async (_options: ApiRequestOptions) =>
        new Response(JSON.stringify({ data: [{ b64_json: 'AAAA' }] }), {
          headers: { 'content-type': 'application/json' },
        })
    )
    const callback = vi.fn()
    const model = createModel(apiRequest)

    await expect(
      model.paint({ prompt: 'draw a lighthouse', num: 2, aspectRatio: '3:2' }, undefined, callback)
    ).resolves.toEqual(['data:image/png;base64,AAAA'])

    expect(apiRequest).toHaveBeenCalledOnce()
    const request = apiRequest.mock.calls[0][0] as ApiRequestOptions
    expect(request).toMatchObject({
      url: 'https://example.com/v1/images/generations',
      method: 'POST',
      useProxy: true,
      retry: 0,
      headers: {
        Authorization: 'Bearer test-key',
        'Content-Type': 'application/json',
      },
    })
    expect(JSON.parse(request.body as string)).toEqual({
      model: 'gpt-image-2',
      prompt: 'draw a lighthouse',
      size: '1536x1024',
      quality: 'auto',
      n: 2,
    })
    expect(callback).toHaveBeenCalledWith('data:image/png;base64,AAAA')
  })

  it('uses multipart image edits when reference images are present', async () => {
    const apiRequest = vi.fn(
      async (_options: ApiRequestOptions) =>
        new Response(JSON.stringify({ data: [{ b64_json: 'BBBB', mime_type: 'image/webp' }] }), {
          headers: { 'content-type': 'application/json' },
        })
    )
    const model = createModel(apiRequest)

    await expect(
      model.paint({
        prompt: 'replace the background',
        images: [{ imageUrl: 'data:image/png;base64,AAAA' }],
        num: 1,
        aspectRatio: '2:3',
      })
    ).resolves.toEqual(['data:image/webp;base64,BBBB'])

    const request = apiRequest.mock.calls[0][0] as ApiRequestOptions
    expect(request).toMatchObject({
      url: 'https://example.com/v1/images/edits',
      method: 'POST',
      useProxy: true,
      retry: 0,
      headers: { Authorization: 'Bearer test-key' },
    })
    expect(request.headers).not.toHaveProperty('Content-Type')

    const form = request.body as FormData
    expect(form.get('model')).toBe('gpt-image-2')
    expect(form.get('prompt')).toBe('replace the background')
    expect(form.get('size')).toBe('1024x1536')
    expect(form.get('quality')).toBe('auto')
    expect(form.get('n')).toBe('1')
    expect(form.getAll('image')).toHaveLength(1)
    expect((form.get('image') as File).type).toBe('image/png')
  })

  it('downloads URL responses and returns stable data URLs', async () => {
    const apiRequest = vi.fn(async (options: ApiRequestOptions) => {
      if (options.method === 'GET') {
        return new Response(new Uint8Array([1, 2, 3]), {
          headers: { 'content-type': 'image/jpeg' },
        })
      }
      return new Response(JSON.stringify({ data: [{ url: 'https://cdn.example.com/image.jpg' }] }), {
        headers: { 'content-type': 'application/json' },
      })
    })
    const model = createModel(apiRequest)

    await expect(model.paint({ prompt: 'draw a lighthouse', num: 1 })).resolves.toEqual(['data:image/jpeg;base64,AQID'])
    expect(apiRequest).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        url: 'https://cdn.example.com/image.jpg',
        method: 'GET',
        responseType: 'arraybuffer',
        useProxy: true,
      })
    )
  })
})
