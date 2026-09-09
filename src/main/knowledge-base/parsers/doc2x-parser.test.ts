import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Doc2xParser } from './doc2x-parser'

describe('Doc2xParser', () => {
  let tempDir: string
  let filePath: string
  const fetchMock = vi.fn()

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'doc2x-parser-test-'))
    filePath = path.join(tempDir, 'report.pdf')
    await fs.promises.writeFile(filePath, 'pdf-content')
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(async () => {
    vi.unstubAllGlobals()
    await fs.promises.rm(tempDir, { recursive: true, force: true })
  })

  it('uses the documented preupload and status endpoints', async () => {
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
              result: { pages: [{ page_idx: 0, md: '# Parsed report' }] },
            },
          }),
          { status: 200 }
        )
      )

    const parser = new Doc2xParser(' sk-test ')
    await expect(
      parser.parse(filePath, { fileId: 1, filename: 'report.pdf', mimeType: 'application/pdf' })
    ).resolves.toBe('# Parsed report')

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock.mock.calls[0][0]).toBe('https://v2.doc2x.noedgeai.com/api/v2/parse/preupload')
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: 'POST',
      headers: { Authorization: 'Bearer sk-test' },
    })
    expect(fetchMock.mock.calls[1][0]).toBe(uploadUrl)
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: 'PUT' })
    expect(fetchMock.mock.calls[2][0]).toBe('https://v2.doc2x.noedgeai.com/api/v2/parse/status?uid=task-1')
  })

  it('requires an API key and a PDF filename before reading the file', async () => {
    const parser = new Doc2xParser(' ')
    await expect(
      parser.parse(filePath, { fileId: 1, filename: 'report.pdf', mimeType: 'application/pdf' })
    ).rejects.toThrow('doc2x_api_key_required')
    expect(fetchMock).not.toHaveBeenCalled()

    const configuredParser = new Doc2xParser('sk-test')
    await expect(
      configuredParser.parse(filePath, {
        fileId: 1,
        filename: 'report.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      })
    ).rejects.toThrow('doc2x_file_not_pdf')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
