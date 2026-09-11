import { describe, expect, it, vi } from 'vitest'

const { createHighlighterMock, createJavaScriptRegexEngineMock } = vi.hoisted(() => ({
  createHighlighterMock: vi.fn(),
  createJavaScriptRegexEngineMock: vi.fn(),
}))

vi.mock('shiki', () => ({
  createHighlighter: createHighlighterMock,
  createJavaScriptRegexEngine: createJavaScriptRegexEngineMock,
}))

vi.mock('../variables', () => ({
  CHATBOX_BUILD_TARGET: 'mobile_app',
}))

describe('mobile Shiki configuration', () => {
  it('uses the JavaScript regex engine instead of WASM', async () => {
    const engine = { name: 'javascript-regex' }
    createJavaScriptRegexEngineMock.mockReturnValue(engine)
    createHighlighterMock.mockResolvedValue({})

    await import('./shiki')

    expect(createJavaScriptRegexEngineMock).toHaveBeenCalledWith({ target: 'ES2018', forgiving: true })
    expect(createHighlighterMock).toHaveBeenCalledWith(
      expect.objectContaining({
        engine,
      })
    )
  })
})
