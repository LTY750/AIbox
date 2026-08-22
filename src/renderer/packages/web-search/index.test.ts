import { describe, expect, it, vi, beforeEach } from 'vitest'

// Mock the settings actions before importing the module under test
vi.mock('@/stores/settingActions', () => ({
  getExtensionSettings: vi.fn(),
  getLanguage: vi.fn(() => 'en'),
  getLicenseKey: vi.fn(() => 'test-license-key'),
}))

vi.mock('./tavily', () => {
  return {
    TavilySearch: class {
      search = vi.fn().mockResolvedValue({
        items: [{ title: 'Tavily Result', snippet: 'test', link: 'https://example.com' }],
      })
    },
  }
})

vi.mock('./bocha', () => {
  return {
    BochaSearch: class {
      search = vi.fn().mockResolvedValue({
        items: [{ title: 'BoCha Result', snippet: 'test', link: 'https://example.com' }],
      })
    },
  }
})

import { getExtensionSettings } from '@/stores/settingActions'
import { webSearchExecutor } from './index'

const mockGetExtensionSettings = vi.mocked(getExtensionSettings)

describe('webSearchExecutor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns different results for different providers with same query', async () => {
    // First call with Tavily
    mockGetExtensionSettings.mockReturnValue({
      webSearch: { provider: 'tavily', tavilyApiKey: 'test-key' },
    } as ReturnType<typeof getExtensionSettings>)

    const tavilyResult = await webSearchExecutor({ query: 'test query' }, {})
    expect(tavilyResult.searchResults).toHaveLength(1)
    expect(tavilyResult.searchResults[0].title).toBe('Tavily Result')

    // Same query but different provider should NOT return cached Tavily results
    mockGetExtensionSettings.mockReturnValue({
      webSearch: { provider: 'bocha', bochaApiKey: 'test-key' },
    } as ReturnType<typeof getExtensionSettings>)

    const bochaResult = await webSearchExecutor({ query: 'test query' }, {})
    expect(bochaResult.searchResults).toHaveLength(1)
    expect(bochaResult.searchResults[0].title).toBe('BoCha Result')
  })

  it('returns cached results for same provider and query', async () => {
    mockGetExtensionSettings.mockReturnValue({
      webSearch: { provider: 'tavily', tavilyApiKey: 'test-key' },
    } as ReturnType<typeof getExtensionSettings>)

    const result1 = await webSearchExecutor({ query: 'cached query' }, {})
    const result2 = await webSearchExecutor({ query: 'cached query' }, {})

    // Both should return same results (cached)
    expect(result1.searchResults).toEqual(result2.searchResults)
  })
})
