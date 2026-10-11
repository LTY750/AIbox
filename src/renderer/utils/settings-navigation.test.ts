import { describe, expect, it } from 'vitest'
import { getSettingsBackPath } from './settings-navigation'

describe('settings navigation', () => {
  it('returns to chat from the settings root', () => {
    expect(getSettingsBackPath('/settings')).toBe('/')
  })

  it('returns from a provider detail page to the provider list', () => {
    expect(getSettingsBackPath('/settings/provider/deepseek')).toBe('/settings/provider')
  })

  it('returns other settings pages to the settings root', () => {
    expect(getSettingsBackPath('/settings/general')).toBe('/settings')
    expect(getSettingsBackPath('/settings/font-size')).toBe('/settings')
  })
})
