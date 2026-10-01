import { describe, expect, it } from 'vitest'
import en from './locales/en/translation.json'
import zhHans from './locales/zh-Hans/translation.json'
import zhHant from './locales/zh-Hant/translation.json'

const settingsTranslationKeys = [
  'Interface',
  'Data',
  'Not configured',
  'Configured',
  'Haptic feedback during generation',
  'Vibration intensity',
  'Light',
  'Medium',
  'Strong',
  'Display and Typography',
] as const

const localizedTranslations = {
  'zh-Hans': zhHans,
  'zh-Hant': zhHant,
} satisfies Record<string, Record<string, string>>

describe('mobile settings translations', () => {
  for (const [locale, translations] of Object.entries(localizedTranslations)) {
    it(`${locale} contains every mobile settings label`, () => {
      for (const key of settingsTranslationKeys) {
        expect(translations[key]).toBeTruthy()
        expect(translations[key]).not.toBe(en[key])
      }
    })
  }
})
