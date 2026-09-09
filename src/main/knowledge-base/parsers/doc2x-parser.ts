import fs from 'node:fs'
import { isPdfFilePath } from '../../../shared/file-extensions'
import { EMPTY_ATTACHMENT_CONTENT_ERROR } from '../../../shared/file-parse-errors'
import type { DocumentParserType } from '../../../shared/types/settings'
import { getLogger } from '../../util'
import type { DocumentParser, ParserFileMeta } from './types'

const log = getLogger('knowledge-base:doc2x-parser')
const DOC2X_API_ORIGIN = 'https://v2.doc2x.noedgeai.com'
const POLL_INTERVAL_MS = 1500
const POLL_TIMEOUT_MS = 15 * 60 * 1000

type Doc2xRecord = Record<string, unknown>

function asRecord(value: unknown): Doc2xRecord | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Doc2xRecord) : undefined
}

async function readJsonResponse(response: Response, errorCode: string): Promise<Doc2xRecord> {
  const body = await response.text().catch(() => '')
  if (!response.ok) throw new Error(errorCode)

  try {
    const payload = asRecord(JSON.parse(body))
    if (payload) return payload
  } catch {
    // Fall through to the stable parser error below.
  }
  throw new Error(errorCode)
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

async function preupload(apiKey: string): Promise<{ uid: string; url: string }> {
  const response = await fetch(`${DOC2X_API_ORIGIN}/api/v2/parse/preupload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  const payload = await readJsonResponse(response, 'doc2x_preupload_failed')
  const data = asRecord(payload.data)
  const uid = typeof data?.uid === 'string' ? data.uid : ''
  const url = typeof data?.url === 'string' ? data.url : ''
  if (payload.code !== 'success' || !uid || !url) throw new Error('doc2x_preupload_failed')
  return { uid, url }
}

async function uploadFile(filePath: string, url: string): Promise<void> {
  const buffer = await fs.promises.readFile(filePath)
  const response = await fetch(url, {
    method: 'PUT',
    body: new Uint8Array(buffer),
  })
  if (!response.ok) throw new Error('doc2x_upload_failed')
}

async function getStatus(uid: string, apiKey: string): Promise<Doc2xRecord> {
  const response = await fetch(`${DOC2X_API_ORIGIN}/api/v2/parse/status?uid=${encodeURIComponent(uid)}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  const payload = await readJsonResponse(response, 'doc2x_status_failed')
  if (payload.code !== 'success' || !asRecord(payload.data)) throw new Error('doc2x_status_failed')
  return payload.data as Doc2xRecord
}

function extractMarkdown(statusData: Doc2xRecord): string {
  const result = asRecord(statusData.result)
  const pages = Array.isArray(result?.pages)
    ? result.pages
        .map((page, index) => ({ page: asRecord(page), index }))
        .filter((entry): entry is { page: Doc2xRecord; index: number } => Boolean(entry.page))
        .sort((left, right) => {
          const leftIndex = left.page.page_idx
          const rightIndex = right.page.page_idx
          if (typeof leftIndex === 'number' && typeof rightIndex === 'number') return leftIndex - rightIndex
          return left.index - right.index
        })
    : []
  const content = pages
    .map(({ page }) => (typeof page.md === 'string' ? page.md : ''))
    .filter((page) => page.trim())
    .join('\n\n')
  if (!content.trim()) throw new Error(EMPTY_ATTACHMENT_CONTENT_ERROR)
  return content
}

async function pollStatus(uid: string, apiKey: string): Promise<string> {
  const startedAt = Date.now()
  while (Date.now() - startedAt < POLL_TIMEOUT_MS) {
    const statusData = await getStatus(uid, apiKey)
    const status = typeof statusData.status === 'string' ? statusData.status.toLowerCase() : ''
    if (status === 'success') return extractMarkdown(statusData)
    if (status === 'failed') throw new Error('doc2x_parse_failed')
    if (status !== 'processing') throw new Error('doc2x_parse_failed')
    await sleep(POLL_INTERVAL_MS)
  }
  throw new Error('doc2x_timeout')
}

export class Doc2xParser implements DocumentParser {
  readonly type: DocumentParserType = 'doc2x'

  constructor(private readonly apiKey: string) {}

  async parse(filePath: string, meta: ParserFileMeta): Promise<string> {
    const apiKey = this.apiKey.trim()
    if (!apiKey) throw new Error('doc2x_api_key_required')
    if (!isPdfFilePath(meta.filename)) throw new Error('doc2x_file_not_pdf')

    const { uid, url } = await preupload(apiKey)
    await uploadFile(filePath, url)
    const content = await pollStatus(uid, apiKey)
    log.info(`[DOC2X] Parse completed for ${meta.filename}, content length=${content.length}`)
    return content
  }
}
