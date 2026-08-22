import { describe, expect, it, vi } from 'vitest'
import { parseFileWithTextIn } from './textin'

describe('parseFileWithTextIn', () => {
  it('uploads a mobile-compatible multipart request and returns Markdown', async () => {
    const transport = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ code: 200, data: { markdown: '# Parsed on mobile' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )
    const file = new File(['pdf-content'], 'report.pdf', { type: 'application/pdf' })

    await expect(
      parseFileWithTextIn(file, { appId: ' app-id ', secretCode: ' secret-code ' }, undefined, transport)
    ).resolves.toBe('# Parsed on mobile')

    const [url, init] = transport.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.textin.com/api/v1/xparse/parse/sync')
    expect(init.headers).toEqual({ 'x-ti-app-id': 'app-id', 'x-ti-secret-code': 'secret-code' })
    expect(init.body).toBeInstanceOf(FormData)
    const form = init.body as FormData
    expect((form.get('file') as File).name).toBe('report.pdf')
    expect(JSON.parse(String(form.get('config')))).toEqual({
      capabilities: { include_table_structure: true, title_tree: true },
    })
  })

  it('rejects missing credentials before making a request', async () => {
    const transport = vi.fn()
    const file = new File(['content'], 'report.pdf', { type: 'application/pdf' })

    await expect(parseFileWithTextIn(file, { appId: '', secretCode: 'secret' }, undefined, transport)).rejects.toThrow(
      'textin_credentials_required'
    )
    expect(transport).not.toHaveBeenCalled()
  })
})
