import { beforeEach, describe, expect, it, vi } from 'vitest'

const mobileRequestMock = vi.hoisted(() => vi.fn())

vi.mock('@/variables', () => ({
  CHATBOX_BUILD_TARGET: 'mobile_app',
}))

vi.mock('@/utils/mobile-request', () => ({
  handleMobileRequest: mobileRequestMock,
}))

vi.mock('@/lib/utils', () => ({
  getLogger: () => ({ info: vi.fn() }),
}))

import { parseFileWithLlamaParse } from './llamaparse'

describe('LlamaParse mobile transport', () => {
  beforeEach(() => {
    mobileRequestMock.mockReset()
  })

  it('uploads files through Capacitor native HTTP instead of WebView fetch', async () => {
    mobileRequestMock.mockResolvedValueOnce(
      new Response('{}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )
    const file = new File(['docx-content'], 'report.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    })

    await expect(parseFileWithLlamaParse(file, { apiKey: ' llama-key ' })).rejects.toThrow(
      'LlamaParse upload response did not contain a file id'
    )

    expect(mobileRequestMock).toHaveBeenCalledOnce()
    const [url, method, headers, body] = mobileRequestMock.mock.calls[0] as [string, string, Headers, FormData]
    expect(url).toBe('https://api.cloud.llamaindex.ai/api/v1/beta/files')
    expect(method).toBe('POST')
    expect(headers.get('authorization')).toBe('Bearer llama-key')
    expect(body).toBeInstanceOf(FormData)
    expect((body.get('file') as File).name).toBe('report.docx')
    expect(body.get('purpose')).toBe('parse')
  })
})
