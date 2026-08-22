import type { ModelDependencies } from '@shared/types/adapters'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AzureOpenAI from './azure'
import Bedrock from './bedrock'
import Claude from './claude'
import DeepSeek from './deepseek'
import Gemini from './gemini'
import MistralAI from './mistral-ai'
import OpenRouter from './openrouter'
import Perplexity from './perplexity'
import VolcEngine from './volcengine'

const factories = vi.hoisted(() => ({
  anthropic: vi.fn(),
  azure: vi.fn(),
  bedrock: vi.fn(),
  deepseek: vi.fn(),
  gemini: vi.fn(),
  mistral: vi.fn(),
  openrouter: vi.fn(),
  perplexity: vi.fn(),
  volcengine: vi.fn(),
}))

vi.mock('@ai-sdk/anthropic', () => ({ createAnthropic: factories.anthropic }))
vi.mock('@ai-sdk/azure', () => ({ createAzure: factories.azure }))
vi.mock('@ai-sdk/amazon-bedrock', () => ({ createAmazonBedrock: factories.bedrock }))
vi.mock('@ai-sdk/deepseek', () => ({ createDeepSeek: factories.deepseek }))
vi.mock('@ai-sdk/google', () => ({ createGoogleGenerativeAI: factories.gemini }))
vi.mock('@ai-sdk/mistral', () => ({ createMistral: factories.mistral }))
vi.mock('@openrouter/ai-sdk-provider', () => ({ createOpenRouter: factories.openrouter }))
vi.mock('@ai-sdk/perplexity', () => ({ createPerplexity: factories.perplexity }))
vi.mock('@ai-sdk/openai-compatible', () => ({ createOpenAICompatible: factories.volcengine }))

type ProviderHarness = {
  getProvider(): unknown
}

type ProviderOptions = {
  fetch?: typeof globalThis.fetch
}

function createDependencies() {
  const apiRequest = vi.fn().mockResolvedValue(new Response('{}'))
  return {
    dependencies: {
      platformType: 'mobile',
      request: {
        apiRequest,
        fetchWithOptions: vi.fn(),
      },
    } as unknown as ModelDependencies,
    apiRequest,
  }
}

function getProviderFetch(model: object, factory: ReturnType<typeof vi.fn>): typeof globalThis.fetch {
  ;(model as ProviderHarness).getProvider()
  const options = factory.mock.calls.at(-1)?.[0] as ProviderOptions | undefined
  expect(options?.fetch).toEqual(expect.any(Function))
  return options?.fetch as typeof globalThis.fetch
}

describe('built-in provider mobile transport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    factories.mistral.mockReturnValue(Object.assign(vi.fn(), { embedding: vi.fn() }))
  })

  it('routes every SDK provider through the native request adapter on mobile', async () => {
    const { dependencies, apiRequest } = createDependencies()
    const model = { modelId: 'test-model', type: 'chat' as const }
    const providers = [
      {
        factory: factories.anthropic,
        model: new Claude(
          {
            claudeApiKey: 'test-key',
            claudeApiHost: 'https://api.anthropic.com/v1',
            model,
          },
          dependencies
        ),
        url: 'https://api.anthropic.com/v1/messages',
      },
      {
        factory: factories.openrouter,
        model: new OpenRouter({ apiKey: 'test-key', model }, dependencies),
        url: 'https://openrouter.ai/api/v1/chat/completions',
      },
      {
        factory: factories.volcengine,
        model: new VolcEngine({ apiKey: 'test-key', model }, dependencies),
        url: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
      },
      {
        factory: factories.gemini,
        model: new Gemini(
          {
            geminiAPIKey: 'test-key',
            geminiAPIHost: 'https://generativelanguage.googleapis.com/v1beta',
            model,
          },
          dependencies
        ),
        url: 'https://generativelanguage.googleapis.com/v1beta/models/test-model:streamGenerateContent?alt=sse',
      },
      {
        factory: factories.deepseek,
        model: new DeepSeek({ apiKey: 'test-key', model }, dependencies),
        url: 'https://api.deepseek.com/chat/completions',
      },
      {
        factory: factories.mistral,
        model: new MistralAI({ apiKey: 'test-key', model }, dependencies),
        url: 'https://api.mistral.ai/v1/chat/completions',
      },
      {
        factory: factories.perplexity,
        model: new Perplexity({ perplexityApiKey: 'test-key', model }, dependencies),
        url: 'https://api.perplexity.ai/chat/completions',
      },
      {
        factory: factories.azure,
        model: new AzureOpenAI(
          {
            azureEndpoint: 'https://test.openai.azure.com',
            azureDalleDeploymentName: 'dall-e',
            azureApikey: 'test-key',
            azureApiVersion: '2025-01-01-preview',
            dalleStyle: 'vivid',
            imageGenerateNum: 1,
            injectDefaultMetadata: false,
            model,
          },
          dependencies
        ),
        url: 'https://test.openai.azure.com/openai/v1/chat/completions',
      },
      {
        factory: factories.bedrock,
        model: new Bedrock(
          {
            region: 'us-east-1',
            accessKey: 'test-access-key',
            secretKey: 'test-secret-key',
            model,
          },
          dependencies
        ),
        url: 'https://bedrock-runtime.us-east-1.amazonaws.com/model/test-model/invoke-with-response-stream',
      },
    ]

    for (const provider of providers) {
      const fetch = getProviderFetch(provider.model, provider.factory)
      await fetch(provider.url, {
        method: 'POST',
        body: JSON.stringify({ stream: true }),
      })
    }

    expect(apiRequest).toHaveBeenCalledTimes(providers.length)
    for (const provider of providers) {
      expect(apiRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          url: provider.url,
          useProxy: true,
          retry: 0,
        })
      )
    }
  })

  it('keeps custom provider fetch implementations ahead of the fallback transport', async () => {
    const { dependencies, apiRequest } = createDependencies()
    const customFetch = vi.fn().mockResolvedValue(new Response('{}')) as typeof globalThis.fetch
    const model = { modelId: 'test-model', type: 'chat' as const }

    const claudeFetch = getProviderFetch(
      new Claude(
        {
          claudeApiKey: 'test-key',
          claudeApiHost: 'https://api.anthropic.com/v1',
          customFetch,
          model,
        },
        dependencies
      ),
      factories.anthropic
    )
    await claudeFetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      body: JSON.stringify({ stream: true }),
    })

    const openRouterFetch = getProviderFetch(
      new OpenRouter({ apiKey: 'test-key', customFetch, model }, dependencies),
      factories.openrouter
    )
    await openRouterFetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      body: JSON.stringify({ stream: true }),
    })

    expect(customFetch).toHaveBeenCalledTimes(2)
    expect(apiRequest).not.toHaveBeenCalled()
  })
})
