import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { extractReasoningMiddleware, wrapLanguageModel } from 'ai'
import AbstractAISDKModel from '../../../models/abstract-ai-sdk'
import { ApiError } from '../../../models/errors'
import { fetchRemoteModels, getOpenAICompatibleProviderOptionsKey } from '../../../models/openai-compatible'
import type { CallChatCompletionOptions } from '../../../models/types'
import { createFetchWithProxy } from '../../../models/utils/fetch-proxy'
import type { ProviderModelInfo } from '../../../types'
import type { ModelDependencies } from '../../../types/adapters'
import { normalizeOpenAIApiHostAndPath } from '../../../utils/llm_utils'
import { pickOpenAICompatibleReasoningOptions } from '../../../utils/reasoning-control'

interface Options {
  apiKey: string
  apiHost: string
  apiPath: string
  model: ProviderModelInfo
  temperature?: number
  topP?: number
  maxOutputTokens?: number
  stream?: boolean
  useProxy?: boolean
}

type FetchFunction = typeof globalThis.fetch

interface OpenAIImageResponseItem {
  b64_json?: string
  url?: string
  mime_type?: string
}

interface OpenAIImageResponse {
  data?: OpenAIImageResponseItem[]
}

const OPENAI_IMAGE_SIZE_BY_RATIO: Record<string, string> = {
  '1:1': '1024x1024',
  '3:2': '1536x1024',
  '2:3': '1024x1536',
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return btoa(binary)
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  const mediaType = blob.type || 'image/png'
  return `data:${mediaType};base64,${bytesToBase64(new Uint8Array(await blob.arrayBuffer()))}`
}

function dataUrlToBlob(dataUrl: string): Blob {
  const separator = dataUrl.indexOf(',')
  const metadata = separator >= 0 ? dataUrl.slice(0, separator) : ''
  if (separator < 0 || !metadata.includes(';base64')) {
    throw new ApiError('Reference image must be a base64 data URL or an HTTP URL')
  }

  const mediaType = metadata.match(/^data:([^;]+)/)?.[1] || 'image/png'
  const binary = atob(dataUrl.slice(separator + 1))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mediaType })
}

function imageFilename(index: number, mediaType: string): string {
  const extension =
    mediaType === 'image/jpeg' ? 'jpg' : mediaType === 'image/webp' ? 'webp' : mediaType === 'image/gif' ? 'gif' : 'png'
  return `image-${index + 1}.${extension}`
}

export default class CustomOpenAI extends AbstractAISDKModel {
  public name = 'Custom OpenAI'

  constructor(
    public options: Options,
    dependencies: ModelDependencies
  ) {
    super(options, dependencies)
    const { apiHost, apiPath } = normalizeOpenAIApiHostAndPath(options)
    this.options = { ...options, apiHost, apiPath }
  }

  protected getCallSettings(options: CallChatCompletionOptions) {
    const openAICompatibleOptions = pickOpenAICompatibleReasoningOptions(
      this.options.model.modelId,
      options.providerOptions
    )
    return {
      temperature: this.options.temperature,
      topP: this.options.topP,
      maxOutputTokens: this.options.maxOutputTokens,
      stream: this.options.stream,
      providerOptions: openAICompatibleOptions
        ? {
            openaiCompatible: openAICompatibleOptions,
            [getOpenAICompatibleProviderOptionsKey(this.name)]: openAICompatibleOptions,
          }
        : undefined,
    }
  }

  static isSupportTextEmbedding() {
    return true
  }

  protected getProvider(_options: CallChatCompletionOptions, fetchFunction?: FetchFunction) {
    return createOpenAICompatible({
      name: this.name,
      apiKey: this.options.apiKey,
      baseURL: this.options.apiHost,
      fetch: fetchFunction,
      headers: this.options.apiHost.includes('openrouter.ai')
        ? {
            'HTTP-Referer': 'https://chatboxai.app',
            'X-Title': 'Chatbox AI',
          }
        : this.options.apiHost.includes('aihubmix.com')
          ? {
              'APP-Code': 'VAFU9221',
            }
          : undefined,
    })
  }

  protected getChatModel(options: CallChatCompletionOptions) {
    const { apiHost, apiPath } = this.options
    const provider = this.getProvider(options, async (_input, init) => {
      return createFetchWithProxy(this.getRequestUseProxy(), this.dependencies)(`${apiHost}${apiPath}`, init)
    })
    return wrapLanguageModel({
      model: provider.languageModel(this.options.model.modelId),
      middleware: extractReasoningMiddleware({ tagName: 'think' }),
    })
  }

  public listModels() {
    return fetchRemoteModels(
      {
        apiHost: this.options.apiHost,
        apiKey: this.options.apiKey,
        useProxy: this.getRequestUseProxy(),
      },
      this.dependencies
    )
  }

  private getRequestUseProxy(): boolean {
    return this.options.useProxy === true || this.dependencies.platformType === 'mobile'
  }

  public async paint(
    params: {
      prompt: string
      images?: { imageUrl: string }[]
      num: number
      aspectRatio?: string
    },
    signal?: AbortSignal,
    callback?: (imageDataUrl: string) => void | Promise<void>
  ): Promise<string[]> {
    const size = OPENAI_IMAGE_SIZE_BY_RATIO[params.aspectRatio || ''] || '1024x1024'
    const response = params.images?.length
      ? await this.editImages(params.prompt, params.images, params.num, size, signal)
      : await this.generateImages(params.prompt, params.num, size, signal)
    const images = await this.normalizeImageResponse(response, signal)

    for (const imageDataUrl of images) {
      await callback?.(imageDataUrl)
    }
    return images
  }

  private getImageRequestHeaders(contentType?: string): Record<string, string> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.options.apiKey}`,
    }
    if (contentType) headers['Content-Type'] = contentType
    if (this.options.apiHost.includes('openrouter.ai')) {
      headers['HTTP-Referer'] = 'https://chatboxai.app'
      headers['X-Title'] = 'Chatbox AI'
    } else if (this.options.apiHost.includes('aihubmix.com')) {
      headers['APP-Code'] = 'VAFU9221'
    }
    return headers
  }

  private async generateImages(prompt: string, num: number, size: string, signal?: AbortSignal): Promise<Response> {
    return this.dependencies.request.apiRequest({
      url: `${this.options.apiHost.replace(/\/$/, '')}/images/generations`,
      method: 'POST',
      headers: this.getImageRequestHeaders('application/json'),
      body: JSON.stringify({
        model: this.options.model.modelId,
        prompt,
        size,
        quality: 'auto',
        n: num,
      }),
      signal,
      useProxy: this.getRequestUseProxy(),
      retry: 0,
    })
  }

  private async editImages(
    prompt: string,
    images: { imageUrl: string }[],
    num: number,
    size: string,
    signal?: AbortSignal
  ): Promise<Response> {
    const form = new FormData()
    form.append('model', this.options.model.modelId)
    form.append('prompt', prompt)
    form.append('size', size)
    form.append('quality', 'auto')
    form.append('n', String(num))

    for (let index = 0; index < images.length; index++) {
      const blob = await this.resolveImageBlob(images[index].imageUrl, signal)
      form.append('image', blob, imageFilename(index, blob.type))
    }

    return this.dependencies.request.apiRequest({
      url: `${this.options.apiHost.replace(/\/$/, '')}/images/edits`,
      method: 'POST',
      headers: this.getImageRequestHeaders(),
      body: form,
      signal,
      useProxy: this.getRequestUseProxy(),
      retry: 0,
    })
  }

  private async resolveImageBlob(imageUrl: string, signal?: AbortSignal): Promise<Blob> {
    if (imageUrl.startsWith('data:')) return dataUrlToBlob(imageUrl)
    if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
      throw new ApiError('Reference image must be a base64 data URL or an HTTP URL')
    }

    const response = await this.dependencies.request.apiRequest({
      url: imageUrl,
      method: 'GET',
      headers: { Accept: 'image/*' },
      signal,
      useProxy: this.getRequestUseProxy(),
      responseType: 'arraybuffer',
    })
    return response.blob()
  }

  private async normalizeImageResponse(response: Response, signal?: AbortSignal): Promise<string[]> {
    const contentType = response.headers.get('content-type') || ''
    if (contentType.startsWith('image/')) {
      return [await blobToDataUrl(await response.blob())]
    }

    let payload: OpenAIImageResponse
    try {
      payload = (await response.json()) as OpenAIImageResponse
    } catch {
      throw new ApiError('Image API returned invalid JSON')
    }
    if (!payload.data?.length) {
      throw new ApiError('Image API response contains no image data')
    }

    const results: string[] = []
    for (const item of payload.data) {
      if (item.b64_json) {
        results.push(
          item.b64_json.startsWith('data:')
            ? item.b64_json
            : `data:${item.mime_type || 'image/png'};base64,${item.b64_json}`
        )
      } else if (item.url) {
        results.push(await blobToDataUrl(await this.resolveImageBlob(item.url, signal)))
      } else {
        throw new ApiError('Image API item contains neither b64_json nor url')
      }
    }
    return results
  }
}
