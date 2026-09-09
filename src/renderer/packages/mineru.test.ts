import { strToU8, zipSync } from 'fflate'
import { describe, expect, it, vi } from 'vitest'
import {
  MINERU_API_ORIGIN,
  MINERU_MAX_FILE_SIZE,
  type MineruTransport,
  parseFileWithMineru,
  testMineruConnection,
} from './mineru'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function zipResponse(entries: Record<string, Uint8Array>): Response {
  const archive = zipSync(entries)
  return new Response(archive.buffer as ArrayBuffer, {
    status: 200,
    headers: { 'Content-Type': 'application/zip' },
  })
}

function resolved(response: Response): Promise<Response> {
  return Promise.resolve(response)
}

describe('parseFileWithMineru', () => {
  it('submits, uploads, polls, downloads the ZIP, and returns full.md', async () => {
    let dataId = ''
    const transport = vi.fn<MineruTransport>((url, init, responseType) => {
      if (url === `${MINERU_API_ORIGIN}/file-urls/batch`) {
        const request = JSON.parse(String(init.body)) as { files: Array<{ data_id: string }> }
        dataId = request.files[0].data_id
        return resolved(
          jsonResponse({ code: 0, data: { batch_id: 'batch-1', file_urls: ['https://oss.example/upload'] } })
        )
      }
      if (url === 'https://oss.example/upload') return resolved(new Response(null, { status: 200 }))
      if (url === `${MINERU_API_ORIGIN}/extract-results/batch/batch-1`) {
        return resolved(
          jsonResponse({
            code: 0,
            data: { extract_result: [{ data_id: dataId, state: 'done', full_zip_url: 'https://oss.example/result' }] },
          })
        )
      }
      if (url === 'https://oss.example/result' && responseType === 'arraybuffer') {
        return resolved(
          zipResponse({
            'result/': new Uint8Array(),
            'result/page-1.md': strToU8('# Page one'),
            'result/full.md': strToU8('# Complete report\n\nParsed by MinerU'),
          })
        )
      }
      throw new Error(`Unexpected MinerU request: ${url}`)
    })

    const file = new File(['PDF bytes'], 'report.pdf', { type: 'application/pdf' })
    await expect(parseFileWithMineru(file, { apiToken: ' mineru-token ' }, undefined, transport)).resolves.toBe(
      '# Complete report\n\nParsed by MinerU'
    )

    expect(transport).toHaveBeenCalledTimes(4)
    const [submitUrl, submitInit] = transport.mock.calls[0] as [string, RequestInit]
    expect(submitUrl).toBe(`${MINERU_API_ORIGIN}/file-urls/batch`)
    expect(submitInit).toMatchObject({
      method: 'POST',
      headers: {
        Authorization: 'Bearer mineru-token',
        'Content-Type': 'application/json',
      },
    })
    expect(JSON.parse(String(submitInit.body))).toMatchObject({
      files: [{ name: 'report.pdf', data_id: expect.stringContaining('chatbox-') }],
      model_version: 'vlm',
      enable_formula: true,
      enable_table: true,
    })

    const [uploadUrl, uploadInit] = transport.mock.calls[1] as [string, RequestInit]
    expect(uploadUrl).toBe('https://oss.example/upload')
    expect(uploadInit).toMatchObject({ method: 'PUT', body: file })

    const [statusUrl, statusInit] = transport.mock.calls[2] as [string, RequestInit]
    expect(statusUrl).toBe(`${MINERU_API_ORIGIN}/extract-results/batch/batch-1`)
    expect(statusInit).toMatchObject({ headers: { Authorization: 'Bearer mineru-token' } })
    expect(transport.mock.calls[3]?.[2]).toBe('arraybuffer')
  })

  it('accepts a root full.md when the result archive has no nested output directory', async () => {
    let dataId = ''
    const transport = vi.fn<MineruTransport>((url, init, responseType) => {
      if (url === `${MINERU_API_ORIGIN}/file-urls/batch`) {
        const request = JSON.parse(String(init.body)) as { files: Array<{ data_id: string }> }
        dataId = request.files[0].data_id
        return resolved(jsonResponse({ code: 0, data: { batch_id: 'batch-2', file_urls: ['https://oss/upload'] } }))
      }
      if (url === 'https://oss/upload') return resolved(new Response(null, { status: 200 }))
      if (url === `${MINERU_API_ORIGIN}/extract-results/batch/batch-2`) {
        return resolved(
          jsonResponse({
            code: 0,
            data: { extract_result: { data_id: dataId, state: 'done', full_zip_url: 'https://oss/result' } },
          })
        )
      }
      if (url === 'https://oss/result' && responseType === 'arraybuffer') {
        return resolved(zipResponse({ 'full.md': strToU8('root markdown') }))
      }
      throw new Error(`Unexpected MinerU request: ${url}`)
    })

    const file = new File(['content'], 'note.docx')
    await expect(parseFileWithMineru(file, { apiToken: 'token' }, undefined, transport)).resolves.toBe('root markdown')
  })

  it('returns a stable error when MinerU reports a failed task', async () => {
    let dataId = ''
    const transport = vi.fn<MineruTransport>((url, init) => {
      if (url === `${MINERU_API_ORIGIN}/file-urls/batch`) {
        const request = JSON.parse(String(init.body)) as { files: Array<{ data_id: string }> }
        dataId = request.files[0].data_id
        return resolved(jsonResponse({ code: 0, data: { batch_id: 'batch-3', file_urls: ['https://oss/upload'] } }))
      }
      if (url === 'https://oss/upload') return resolved(new Response(null, { status: 200 }))
      if (url === `${MINERU_API_ORIGIN}/extract-results/batch/batch-3`) {
        return resolved(jsonResponse({ code: 0, data: { extract_result: [{ data_id: dataId, state: 'failed' }] } }))
      }
      throw new Error(`Unexpected MinerU request: ${url}`)
    })

    const file = new File(['content'], 'failed.pdf')
    await expect(parseFileWithMineru(file, { apiToken: 'token' }, undefined, transport)).rejects.toThrow(
      'mineru_parse_failed'
    )
  })

  it('rejects missing tokens and files larger than the upload limit before making requests', async () => {
    const transport = vi.fn<MineruTransport>()
    const file = new File(['content'], 'report.pdf')

    await expect(parseFileWithMineru(file, { apiToken: ' ' }, undefined, transport)).rejects.toThrow(
      'mineru_api_token_required'
    )
    expect(transport).not.toHaveBeenCalled()

    const largeFile = new File(['content'], 'large.pdf')
    Object.defineProperty(largeFile, 'size', { value: MINERU_MAX_FILE_SIZE + 1 })
    await expect(parseFileWithMineru(largeFile, { apiToken: 'token' }, undefined, transport)).rejects.toThrow(
      'MinerU file too large'
    )
    expect(transport).not.toHaveBeenCalled()
  })

  it('rejects result archives that contain no Markdown', async () => {
    let dataId = ''
    const transport = vi.fn<MineruTransport>((url, init, responseType) => {
      if (url === `${MINERU_API_ORIGIN}/file-urls/batch`) {
        const request = JSON.parse(String(init.body)) as { files: Array<{ data_id: string }> }
        dataId = request.files[0].data_id
        return resolved(jsonResponse({ code: 0, data: { batch_id: 'batch-4', file_urls: ['https://oss/upload'] } }))
      }
      if (url === 'https://oss/upload') return resolved(new Response(null, { status: 200 }))
      if (url === `${MINERU_API_ORIGIN}/extract-results/batch/batch-4`) {
        return resolved(
          jsonResponse({
            code: 0,
            data: { extract_result: [{ data_id: dataId, state: 'done', full_zip_url: 'https://oss/result' }] },
          })
        )
      }
      if (url === 'https://oss/result' && responseType === 'arraybuffer') {
        return resolved(zipResponse({ 'result/data.json': strToU8('{}') }))
      }
      throw new Error(`Unexpected MinerU request: ${url}`)
    })

    const file = new File(['content'], 'empty.pdf')
    await expect(parseFileWithMineru(file, { apiToken: 'token' }, undefined, transport)).rejects.toThrow(
      'mineru_result_empty'
    )
  })
})

describe('testMineruConnection', () => {
  it('accepts a token when the API responds successfully', async () => {
    const transport = vi.fn<MineruTransport>().mockResolvedValue(jsonResponse({ code: 0, data: {} }))

    await expect(testMineruConnection(' token ', transport)).resolves.toEqual({ success: true })
    expect(transport.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      headers: { Authorization: 'Bearer token' },
    })
  })

  it('recognizes both JSON and HTTP authentication failures', async () => {
    const jsonTransport = vi.fn<MineruTransport>().mockResolvedValue(jsonResponse({ code: 1, msgCode: 'A0202' }))
    await expect(testMineruConnection('token', jsonTransport)).resolves.toEqual({
      success: false,
      error: 'mineru_token_invalid',
    })

    const httpTransport = vi.fn<MineruTransport>().mockResolvedValue(jsonResponse({ msgCode: 'A0211' }, 401))
    await expect(testMineruConnection('token', httpTransport)).resolves.toEqual({
      success: false,
      error: 'mineru_token_invalid',
    })
  })

  it('rejects an empty token without making a request', async () => {
    const transport = vi.fn<MineruTransport>()
    await expect(testMineruConnection('  ', transport)).resolves.toEqual({
      success: false,
      error: 'mineru_api_token_required',
    })
    expect(transport).not.toHaveBeenCalled()
  })
})
