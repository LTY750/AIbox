import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TextInParser } from './textin-parser'

describe('TextInParser', () => {
  let tempDir: string
  let filePath: string
  const fetchMock = vi.fn()

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'textin-parser-test-'))
    filePath = path.join(tempDir, 'report.pdf')
    await fs.promises.writeFile(filePath, 'pdf-content')
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(async () => {
    vi.unstubAllGlobals()
    await fs.promises.rm(tempDir, { recursive: true, force: true })
  })

  it('uploads the file with TextIn credentials and returns Markdown', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ code: 200, message: 'success', data: { markdown: '# Parsed report' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const parser = new TextInParser(' app-id ', ' secret-code ')
    const content = await parser.parse(filePath, {
      fileId: 1,
      filename: 'report.pdf',
      mimeType: 'application/pdf',
    })

    expect(content).toBe('# Parsed report')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.textin.com/api/v1/xparse/parse/sync')
    expect(request.method).toBe('POST')
    expect(request.headers).toEqual({
      'x-ti-app-id': 'app-id',
      'x-ti-secret-code': 'secret-code',
    })

    const form = request.body as FormData
    expect((form.get('file') as File).name).toBe('report.pdf')
    expect(JSON.parse(String(form.get('config')))).toEqual({
      capabilities: {
        include_table_structure: true,
        title_tree: true,
      },
    })
  })

  it('rejects TextIn business errors returned with HTTP 200', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ code: 40102, message: 'invalid credentials' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const parser = new TextInParser('app-id', 'secret-code')
    await expect(
      parser.parse(filePath, { fileId: 1, filename: 'report.pdf', mimeType: 'application/pdf' })
    ).rejects.toThrow('TextIn parse failed (40102): invalid credentials')
  })

  it('requires both TextIn credentials before reading the file', async () => {
    const parser = new TextInParser('app-id', ' ')
    await expect(
      parser.parse(filePath, { fileId: 1, filename: 'report.pdf', mimeType: 'application/pdf' })
    ).rejects.toThrow('textin_credentials_required')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
