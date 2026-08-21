import { beforeEach, describe, expect, it, vi } from 'vitest'

const { openUrlMock, openLinkMock } = vi.hoisted(() => ({
  openUrlMock: vi.fn(),
  openLinkMock: vi.fn(),
}))

vi.mock('@capacitor/app-launcher', () => ({ AppLauncher: { openUrl: openUrlMock } }))
vi.mock('@/platform', () => ({ default: { type: 'mobile', openLink: openLinkMock } }))
vi.mock('./remote', () => ({ getChatboxOrigin: () => 'https://chatboxai.app' }))

describe('openLinkWithAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('opens external pages without putting an authentication token in the URL', async () => {
    const { openLinkWithAuth } = await import('./openLinkWithAuth')

    await openLinkWithAuth('/en/license')

    expect(openUrlMock).toHaveBeenCalledWith({ url: 'https://chatboxai.app/en/license' })
    expect(openUrlMock.mock.calls[0][0].url).not.toContain('web_auth_token')
    expect(openLinkMock).not.toHaveBeenCalled()
  })

  it('strips URL userinfo before handing a link to the native browser', async () => {
    const { openLinkWithAuth } = await import('./openLinkWithAuth')

    await openLinkWithAuth('https://alice:secret@example.com/account')

    expect(openUrlMock).toHaveBeenCalledWith({ url: 'https://example.com/account' })
  })

  it('strips credential query parameters before handing a link to the native browser', async () => {
    const { openLinkWithAuth } = await import('./openLinkWithAuth')

    await openLinkWithAuth('https://example.com/account?token=secret&next=%2Fhome&api_key=private')

    expect(openUrlMock).toHaveBeenCalledWith({ url: 'https://example.com/account?next=%2Fhome' })
  })
})
