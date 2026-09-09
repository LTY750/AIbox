import { isPdfFilePath } from '@shared/file-extensions'
import { EMPTY_ATTACHMENT_CONTENT_ERROR } from '@shared/file-parse-errors'
import { getLogger } from '@/lib/utils'
import { handleMobileRequest } from '@/utils/mobile-request'
import { CHATBOX_BUILD_TARGET } from '@/variables'

const log = getLogger('doc2x')
export const DOC2X_API_ORIGIN = 'https://v2.doc2x.noedgeai.com'
const POLL_INTERVAL_MS = 1500
const POLL_TIMEOUT_MS = 15 * 60 * 1000

export interface Doc2xConfig {
  apiKey: string
}

type Doc2xPage = Record<string, unknown>
type Doc2xRecord = Record<string, unknown>

function asRecord(value: unknown): Doc2xRecord | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Doc2xRecord) : undefined
}

function requestDoc2x(url: string, init: RequestInit = {}): Promise<Response> {
  if (CHATBOX_BUILD_TARGET === 'mobile_app') {
    return handleMobileRequest(
      url,
      init.method || 'GET',
      new Headers(init.headers),
      init.body,
      init.signal || undefined
    )
  }
  return fetch(url, init)
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timeout)
      reject(new DOMException('Aborted', 'AbortError'))
    }

    throwIfAborted(signal)
    const timeout = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
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

async function preupload(apiKey: string, signal?: AbortSignal): Promise<{ uid: string; url: string }> {
  throwIfAborted(signal)
  // Leaving model unset selects the documented v2 default.
  const response = await requestDoc2x(`${DOC2X_API_ORIGIN}/api/v2/parse/preupload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    signal,
  })
  const payload = await readJsonResponse(response, 'doc2x_preupload_failed')
  const data = asRecord(payload.data)
  const uid = typeof data?.uid === 'string' ? data.uid : ''
  const url = typeof data?.url === 'string' ? data.url : ''
  if (payload.code !== 'success' || !uid || !url) throw new Error('doc2x_preupload_failed')
  return { uid, url }
}

async function uploadFile(file: File, url: string, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal)
  const response = await requestDoc2x(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/pdf' },
    body: file,
    signal,
  })
  if (!response.ok) throw new Error('doc2x_upload_failed')
}

async function getStatus(uid: string, apiKey: string, signal?: AbortSignal): Promise<Doc2xRecord> {
  throwIfAborted(signal)
  const response = await requestDoc2x(`${DOC2X_API_ORIGIN}/api/v2/parse/status?uid=${encodeURIComponent(uid)}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal,
  })
  const payload = await readJsonResponse(response, 'doc2x_status_failed')
  if (payload.code !== 'success' || !asRecord(payload.data)) throw new Error('doc2x_status_failed')
  return payload.data as Doc2xRecord
}

function extractMarkdown(statusData: Doc2xRecord): string {
  const result = asRecord(statusData.result)
  const pages = Array.isArray(result?.pages)
    ? result.pages
        .map((page, index) => ({ page: asRecord(page) as Doc2xPage | undefined, index }))
        .filter((entry): entry is { page: Doc2xPage; index: number } => Boolean(entry.page))
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

async function pollStatus(uid: string, apiKey: string, signal?: AbortSignal): Promise<string> {
  const startedAt = Date.now()
  while (Date.now() - startedAt < POLL_TIMEOUT_MS) {
    const statusData = await getStatus(uid, apiKey, signal)
    const status = typeof statusData.status === 'string' ? statusData.status.toLowerCase() : ''
    if (status === 'success') return extractMarkdown(statusData)
    if (status === 'failed') throw new Error('doc2x_parse_failed')
    if (status !== 'processing') throw new Error('doc2x_parse_failed')
    await sleep(POLL_INTERVAL_MS, signal)
  }
  throw new Error('doc2x_timeout')
}

export async function parseFileWithDoc2x(file: File, config: Doc2xConfig, signal?: AbortSignal): Promise<string> {
  const apiKey = config.apiKey.trim()
  if (!apiKey) throw new Error('doc2x_api_key_required')
  if (!isPdfFilePath(file.name)) throw new Error('doc2x_file_not_pdf')

  const { uid, url } = await preupload(apiKey, signal)
  await uploadFile(file, url, signal)
  const content = await pollStatus(uid, apiKey, signal)
  log.info(`Parsed ${file.name} with Doc2X`)
  return content
}
