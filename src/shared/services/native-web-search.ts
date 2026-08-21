/**
 * Native-safe web search for the RN mobile shell.
 *
 * Uses JSON HTTP APIs only (no DOMParser/HTML scraping), so it runs on React
 * Native `fetch`. Tavily is the first provider; `apiHost` is injectable so the
 * Android emulator can verify against a local mock without credentials.
 */

export interface NativeWebSearchResultItem {
  title: string
  link: string
  snippet: string
}

/** Same provider set the renderer's Web Search settings expose. */
export type NativeWebSearchProvider = 'tavily' | 'bocha'

export const nativeWebSearchProviderOptions: Array<{ id: NativeWebSearchProvider; label: string }> = [
  { id: 'tavily', label: 'Tavily' },
  { id: 'bocha', label: 'BoCha' },
]

export interface NativeWebSearchSettings {
  enabled?: boolean
  provider: NativeWebSearchProvider
  apiKey: string
  apiHost: string
}

export const defaultNativeWebSearchSettings: NativeWebSearchSettings = {
  provider: 'tavily',
  apiKey: '',
  apiHost: '',
}

export function normalizeNativeWebSearchSettings(
  settings: Partial<NativeWebSearchSettings> | undefined
): NativeWebSearchSettings {
  const provider = nativeWebSearchProviderOptions.some((option) => option.id === settings?.provider)
    ? (settings?.provider as NativeWebSearchProvider)
    : defaultNativeWebSearchSettings.provider
  return {
    enabled: settings?.enabled,
    provider,
    apiKey: settings?.apiKey ?? '',
    apiHost: settings?.apiHost ?? '',
  }
}

export interface NativeWebSearchOptions {
  provider?: NativeWebSearchProvider
  apiKey?: string
  apiHost?: string
  signal?: AbortSignal
  fetchFn?: typeof fetch
  maxResults?: number
}

const TAVILY_DEFAULT_HOST = 'https://api.tavily.com'

interface TavilyResponseItem {
  title?: string
  url?: string
  content?: string
}

export function hasNativeWebSearchConfiguration(
  settings: Pick<NativeWebSearchSettings, 'provider' | 'apiKey'>,
): boolean {
  return Boolean(settings.apiKey.trim())
}

export async function searchNativeWeb(
  query: string,
  options: NativeWebSearchOptions
): Promise<NativeWebSearchResultItem[]> {
  const provider = options.provider ?? 'tavily'
  if (provider === 'bocha') return searchNativeBocha(query, options)
  return searchNativeTavily(query, options)
}

// BoCha is a plain JSON API, shared with the renderer provider shell.

interface BochaResponse {
  code?: number | string
  msg?: string | null
  message?: string | null
  data?: { webPages?: { value?: Array<{ name: string; url: string; summary?: string; snippet?: string }> } }
  webPages?: { value?: Array<{ name: string; url: string; summary?: string; snippet?: string }> }
}

const BOCHA_ENDPOINTS = ['https://api.bocha.cn/v1/web-search', 'https://api.bochaai.com/v1/web-search']

async function searchNativeBocha(query: string, options: NativeWebSearchOptions): Promise<NativeWebSearchResultItem[]> {
  const fetchFn = options.fetchFn ?? fetch
  let payload: BochaResponse | undefined
  let lastError: unknown

  for (const endpoint of BOCHA_ENDPOINTS) {
    try {
      const response = await fetchFn(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${options.apiKey ?? ''}`,
        },
        body: JSON.stringify({ query, freshness: 'noLimit', summary: true, count: 10 }),
        signal: options.signal,
      })
      if (!response.ok) {
        lastError = new Error(`BoCha API error: ${response.status}`)
        continue
      }
      const res = (await response.json()) as BochaResponse
      const responseCode = Number(res.code)
      if (!Number.isNaN(responseCode) && responseCode !== 200) {
        lastError = new Error(res.msg || res.message || `BoCha API error: ${res.code}`)
        continue
      }
      if ((res.code ?? null) !== null && Number.isNaN(responseCode)) {
        lastError = new Error(res.msg || res.message || `BoCha API error: ${res.code}`)
        continue
      }
      const results = res.data?.webPages?.value ?? res.webPages?.value
      if (!Array.isArray(results)) {
        lastError = new Error('BoCha API malformed payload: webPages.value is not an array')
        continue
      }
      payload = res
      break
    } catch (error) {
      lastError = error
    }
  }

  if (!payload) {
    throw lastError || new Error('BoCha API request failed on all endpoints')
  }

  const results = payload.data?.webPages?.value || payload.webPages?.value || []
  return results.map((result) => ({
    title: result.name,
    link: result.url,
    snippet: result.summary || result.snippet || '',
  }))
}

async function searchNativeTavily(
  query: string,
  options: NativeWebSearchOptions
): Promise<NativeWebSearchResultItem[]> {
  const fetchFn = options.fetchFn ?? fetch
  const host = (options.apiHost?.trim() || TAVILY_DEFAULT_HOST).replace(/\/+$/, '')
  // Cap is opt-in: the renderer Tavily provider passes no maxResults, preserving the
  // pre-extraction behavior of returning every result Tavily sent (its own server-side
  // default). Native callers can pass maxResults to bound both request and response.
  const maxResults = options.maxResults

  const body: {
    query: string
    search_depth: string
    include_domains: string[]
    exclude_domains: string[]
    max_results?: number
  } = {
    query,
    search_depth: 'basic',
    include_domains: [],
    exclude_domains: [],
  }
  if (maxResults !== undefined) {
    body.max_results = maxResults
  }

  const response = await fetchFn(`${host}/search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${options.apiKey ?? ''}`,
    },
    body: JSON.stringify(body),
    signal: options.signal,
  })
  if (!response.ok) {
    throw new Error(`Web search failed with status ${response.status}`)
  }

  const payload = (await response.json()) as { results?: TavilyResponseItem[] }
  const results = Array.isArray(payload.results) ? payload.results : []
  // No link filtering: matches the old renderer Tavily provider, which returned every
  // result Tavily sent (link-less items included) for the model to use.
  const items = results.map((item) => ({
    title: item.title ?? '',
    link: item.url ?? '',
    snippet: item.content ?? '',
  }))
  return maxResults !== undefined ? items.slice(0, maxResults) : items
}

export function formatNativeWebSearchContext(query: string, items: NativeWebSearchResultItem[]): string {
  if (items.length === 0) return ''
  const entries = items
    .map((item, index) => `${index + 1}. ${item.title}\n${item.link}\n${item.snippet}`.trim())
    .join('\n\n')
  return [
    '<WEB_SEARCH_RESULTS>',
    `The following are web search results for the query: ${query}`,
    'Use them to ground your answer and cite sources by their URLs when relevant.',
    '',
    entries,
    '</WEB_SEARCH_RESULTS>',
  ].join('\n')
}
