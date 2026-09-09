import type { CopilotDetail } from '@shared/types'
import { describe, expect, it } from 'vitest'
import { DEFAULT_COPILOTS, seedDefaultCopilots } from './defaults'

describe('default copilots', () => {
  it('provides independent practical copilots with complete prompts', () => {
    const ids = DEFAULT_COPILOTS.map((copilot) => copilot.id)

    expect(new Set(ids).size).toBe(DEFAULT_COPILOTS.length)
    expect(DEFAULT_COPILOTS.length).toBeGreaterThanOrEqual(10)
    expect(
      DEFAULT_COPILOTS.every((copilot) => copilot.name && copilot.description && copilot.prompt.length > 100)
    ).toBe(true)
  })

  it('preserves existing copilots and does not seed duplicates', () => {
    const existing: CopilotDetail = {
      id: DEFAULT_COPILOTS[0].id,
      name: '我的自定义文案搭档',
      prompt: '保留这条本地提示词',
    }
    const seeded = seedDefaultCopilots([existing], 123)

    expect(seeded.filter((copilot) => copilot.id === existing.id)).toHaveLength(1)
    expect(seeded.find((copilot) => copilot.id === existing.id)?.name).toBe(existing.name)
    expect(seeded.every((copilot) => copilot.createdAt === 123 || copilot.id === existing.id)).toBe(true)
  })
})
