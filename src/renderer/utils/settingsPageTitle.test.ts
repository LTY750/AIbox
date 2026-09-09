import { describe, expect, it } from 'vitest'
import { getSettingsPageTitle } from './settingsPageTitle'

const translate = (key: string) => `translated:${key}`

describe('getSettingsPageTitle', () => {
  it('resolves a settings section title', () => {
    expect(getSettingsPageTitle('/settings/document-parser', translate)).toBe('translated:Document Parser')
  })

  it('resolves a provider detail title from the provider list', () => {
    expect(getSettingsPageTitle('/settings/provider/openai', translate, [{ id: 'openai', name: 'OpenAI' }])).toBe(
      'translated:OpenAI'
    )
  })

  it('falls back to the section when a provider is unknown', () => {
    expect(getSettingsPageTitle('/settings/provider/missing', translate)).toBe('translated:Model Provider')
  })
})
