import { describe, expect, it } from 'vitest'
import { getMessageModelLabel } from './message-model-label'

describe('getMessageModelLabel', () => {
  it('hides missing and placeholder model names', () => {
    expect(getMessageModelLabel(undefined)).toBeUndefined()
    expect(getMessageModelLabel('  ')).toBeUndefined()
    expect(getMessageModelLabel('unknown')).toBeUndefined()
  })

  it('trims and preserves a real model name', () => {
    expect(getMessageModelLabel('  gpt-4o-mini  ')).toBe('gpt-4o-mini')
  })
})
