// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { getInterfaceFontFamily, getThemeDesign } from './useAppTheme'

describe('getThemeDesign', () => {
  it('uses the interface brand color for MUI primary controls', () => {
    expect(getThemeDesign('light', 'en').palette?.primary).toEqual({ main: '#228be6' })
    expect(getThemeDesign('dark', 'en').palette?.primary).toEqual({ main: '#228be6' })
    expect(getThemeDesign('light', 'en', '#d97757').palette?.primary).toEqual({ main: '#d97757' })
  })

  it('uses the selected interface font for MUI typography', () => {
    expect(getThemeDesign('light', 'en', '#228be6', 'claude').typography).toMatchObject({
      fontFamily: expect.stringContaining('Lora Variable'),
    })
    expect(getThemeDesign('light', 'en', '#228be6', 'serif').typography).toMatchObject({
      fontFamily: expect.stringContaining('Baskerville'),
    })
  })

  it('keeps the Arabic font fallback for the system font option', () => {
    expect(getInterfaceFontFamily('system', 'ar')).toBe('Cairo, Arial, sans-serif')
  })
})
