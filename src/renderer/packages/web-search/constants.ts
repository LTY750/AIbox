export const WEB_SEARCH_PROVIDERS = [
  { value: 'tavily', label: 'Tavily' },
  { value: 'bocha', label: 'BoCha' },
] as const

export type WebSearchProviderValue = (typeof WEB_SEARCH_PROVIDERS)[number]['value']
