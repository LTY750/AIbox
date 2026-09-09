import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseFileWithDoc2x } from './doc2x'

describe('parseFileWithDoc2x', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('preuploads, uploads the PDF, polls status, and merges page Markdown', async () => {
    const uploadUrl = 'https://oss.example.com/signed-upload'
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ code: 'success', data: { uid: 'task-1', url: uploadUrl } }), { status: 200 })
      )
      .mockResolvedValueOnce(new Response('', { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 'success',
            data: {
              status: 'success',
              result: {
                pages: [
                  { page_idx: 1, md: '## Second page' },
                  { page_idx: 0, md: '# First page' },
                ],
              },
            },
          }),
          { status: 200 }
        )
      )

    const file = new File(['pdf bytes'], 'report.pdf', { type: 'application/pdf' })
    const content = await parseFileWithDoc2x(file, { apiKey: ' sk-test ' })

    expect(content).toBe('# First page\n\n## Second page')
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock.mock.calls[0][0]).toBe('https://v2.doc2x.noedgeai.com/api/v2/parse/preupload')
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: 'POST',
      headers: { Authorization: 'Bearer sk-test' },
    })
    expect(fetchMock.mock.calls[1][0]).toBe(uploadUrl)
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      method: 'PUT',
      headers: { 'Content-Type': 'application/pdf' },
      body: file,
    })
    expect(fetchMock.mock.calls[2][0]).toBe('https://v2.doc2x.noedgeai.com/api/v2/parse/status?uid=task-1')
    expect(fetchMock.mock.calls[2][1]).toMatchObject({
      headers: { Authorization: 'Bearer sk-test' },
    })
  })

  it('rejects non-PDF files before making a request', async () => {
    const file = new File(['office bytes'], 'report.docx')

    await expect(parseFileWithDoc2x(file, { apiKey: 'sk-test' })).rejects.toThrow('doc2x_file_not_pdf')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('surfaces a failed Doc2X status as a stable parser error', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ code: 'success', data: { uid: 'task-2', url: 'https://oss.example.com/upload' } }),
          {
            status: 200,
          }
        )
      )
      .mockResolvedValueOnce(new Response('', { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ code: 'success', data: { status: 'failed', detail: 'parse_error' } }), {
          status: 200,
        })
      )

    const file = new File(['pdf bytes'], 'report.pdf', { type: 'application/pdf' })
    await expect(parseFileWithDoc2x(file, { apiKey: 'sk-test' })).rejects.toThrow('doc2x_parse_failed')
  })
})
