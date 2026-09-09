import { ApiError } from '@shared/models/errors'
import { readZipFileEntries } from '@/packages/backup/zip'
import { handleMobileRequest } from '@/utils/mobile-request'
import { CHATBOX_BUILD_TARGET } from '@/variables'

export const MINERU_API_ORIGIN = 'https://mineru.net/api/v4'
export const MINERU_MAX_FILE_SIZE = 200 * 1024 * 1024

const POLL_INTERVAL_MS = 3000
const POLL_TIMEOUT_MS = 5 * 60 * 1000

type MineruApiResponse<T> = {
  code?: number | string
  msg?: string
  msgCode?: string
  data?: T
}

type MineruBatchUploadData = {
  batch_id?: string
  file_urls?: string[]
}

type MineruExtractResult = {
  data_id?: string
  state?: string
  full_zip_url?: string
  err_msg?: string
}

type MineruBatchResultData = {
  extract_result?: MineruExtractResult[] | MineruExtractResult
}

type MineruResponseType = 'text' | 'arraybuffer'

export type MineruTransport = (url: string, init: RequestInit, responseType?: MineruResponseType) => Promise<Response>

export interface MineruConfig {
  apiToken: string
  modelVersion?: 'pipeline' | 'vlm' | 'MinerU-HTML'
  language?: string
  enableFormula?: boolean
  enableTable?: boolean
  isOcr?: boolean
  pageRanges?: string
}

function requestMineru(url: string, init: RequestInit = {}, responseType?: MineruResponseType): Promise<Response> {
  if (CHATBOX_BUILD_TARGET === 'mobile_app') {
    return handleMobileRequest(
      url,
      init.method || 'GET',
      new Headers(init.headers),
      init.body,
      init.signal || undefined,
      responseType
    )
  }
  return fetch(url, init)
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    throwIfAborted(signal)

    const timeout = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timeout)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

async function readJsonResponse<T>(response: Response, errorCode: string): Promise<MineruApiResponse<T>> {
  const body = await response.text().catch(() => '')
  if (!response.ok) {
    throw new Error(errorCode)
  }

  try {
    const payload = JSON.parse(body) as MineruApiResponse<T>
    if (payload && typeof payload === 'object') return payload
  } catch {
    // Fall through to the stable parser error below.
  }
  throw new Error(errorCode)
}

function isSuccessCode(code: number | string | undefined): boolean {
  return code === 0 || code === '0'
}

function getApiErrorMessage(payload: MineruApiResponse<unknown>, fallback: string): string {
  return typeof payload.msg === 'string' && payload.msg.trim() ? payload.msg : fallback
}

function getModelVersion(file: File, config: MineruConfig): 'pipeline' | 'vlm' | 'MinerU-HTML' {
  if (config.modelVersion) return config.modelVersion
  return /\.html?$/i.test(file.name) ? 'MinerU-HTML' : 'vlm'
}

function createDataId(file: File): string {
  const randomPart =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Math.random()}`
  return `chatbox-${Date.now()}-${randomPart.replace(/[^a-zA-Z0-9_-]/g, '')}-${file.name
    .replace(/[^a-zA-Z0-9_.-]/g, '-')
    .slice(-64)}`.slice(0, 128)
}

async function submitUploadTask(
  file: File,
  config: MineruConfig,
  dataId: string,
  signal: AbortSignal | undefined,
  transport: MineruTransport
): Promise<{ batchId: string; uploadUrl: string }> {
  throwIfAborted(signal)
  const response = await transport(`${MINERU_API_ORIGIN}/file-urls/batch`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      files: [
        {
          name: file.name,
          data_id: dataId,
          ...(config.isOcr !== undefined ? { is_ocr: config.isOcr } : {}),
          ...(config.pageRanges ? { page_ranges: config.pageRanges } : {}),
        },
      ],
      model_version: getModelVersion(file, config),
      enable_formula: config.enableFormula ?? true,
      enable_table: config.enableTable ?? true,
      ...(config.language ? { language: config.language } : {}),
    }),
    signal,
  })
  const payload = await readJsonResponse<MineruBatchUploadData>(response, 'mineru_submit_failed')
  if (!isSuccessCode(payload.code)) {
    throw new Error(getApiErrorMessage(payload, 'mineru_submit_failed'))
  }

  const batchId = payload.data?.batch_id?.trim() || ''
  const uploadUrl = payload.data?.file_urls?.[0]?.trim() || ''
  if (!batchId || !uploadUrl) throw new Error('mineru_upload_url_missing')
  return { batchId, uploadUrl }
}

async function uploadFile(file: File, uploadUrl: string, signal: AbortSignal | undefined, transport: MineruTransport) {
  throwIfAborted(signal)
  // MinerU's signed URL does not require a Content-Type header.
  const response = await transport(uploadUrl, { method: 'PUT', body: file, signal })
  if (!response.ok) throw new Error('mineru_upload_failed')
}

function normalizeExtractResults(extractResult: MineruBatchResultData['extract_result']): MineruExtractResult[] {
  if (Array.isArray(extractResult)) return extractResult
  return extractResult ? [extractResult] : []
}

async function pollTaskResult(
  batchId: string,
  dataId: string,
  apiToken: string,
  signal: AbortSignal | undefined,
  transport: MineruTransport
): Promise<string> {
  const startedAt = Date.now()
  let firstRequest = true

  while (Date.now() - startedAt < POLL_TIMEOUT_MS) {
    if (!firstRequest) await sleep(POLL_INTERVAL_MS, signal)
    firstRequest = false
    throwIfAborted(signal)

    const response = await transport(`${MINERU_API_ORIGIN}/extract-results/batch/${encodeURIComponent(batchId)}`, {
      headers: { Authorization: `Bearer ${apiToken}` },
      signal,
    })
    const payload = await readJsonResponse<MineruBatchResultData>(response, 'mineru_status_failed')
    if (!isSuccessCode(payload.code)) {
      throw new Error(getApiErrorMessage(payload, 'mineru_status_failed'))
    }

    const result = normalizeExtractResults(payload.data?.extract_result).find((entry) => entry.data_id === dataId)
    if (!result) continue

    const state = result.state?.toLowerCase()
    if (state === 'done') {
      const zipUrl = result.full_zip_url?.trim()
      if (!zipUrl) throw new Error('mineru_result_url_missing')
      return zipUrl
    }
    if (state === 'failed') throw new Error(result.err_msg?.trim() || 'mineru_parse_failed')
  }

  throw new Error('mineru_timeout')
}

async function downloadMarkdown(
  zipUrl: string,
  signal: AbortSignal | undefined,
  transport: MineruTransport
): Promise<string> {
  throwIfAborted(signal)
  const response = await transport(zipUrl, { signal }, 'arraybuffer')
  if (!response.ok) throw new Error('mineru_result_download_failed')

  const archiveBytes = new Uint8Array(await response.arrayBuffer())
  const archive = new File([archiveBytes], 'mineru-result.zip', { type: 'application/zip' })
  const decoder = new TextDecoder()
  let fullMarkdown: string | undefined
  let fallbackMarkdown: string | undefined

  await readZipFileEntries(
    archive,
    (entry) => {
      if (!entry.path.toLowerCase().endsWith('.md')) return
      const content = decoder.decode(entry.data)
      if (!fallbackMarkdown) fallbackMarkdown = content
      if (entry.path.toLowerCase().endsWith('/full.md') || entry.path.toLowerCase() === 'full.md') {
        fullMarkdown = content
      }
    },
    { signal, allowDirectoryEntries: true }
  )

  const markdown = fullMarkdown || fallbackMarkdown
  if (!markdown?.trim()) throw new Error('mineru_result_empty')
  return markdown
}

export async function parseFileWithMineru(
  file: File,
  config: MineruConfig,
  signal?: AbortSignal,
  transport: MineruTransport = requestMineru
): Promise<string> {
  const apiToken = config.apiToken.trim()
  if (!apiToken) throw new Error('mineru_api_token_required')
  if (file.size > MINERU_MAX_FILE_SIZE) {
    throw new Error(`MinerU file too large: ${file.size} bytes (max: ${MINERU_MAX_FILE_SIZE})`)
  }

  const normalizedConfig = { ...config, apiToken }
  const dataId = createDataId(file)
  const { batchId, uploadUrl } = await submitUploadTask(file, normalizedConfig, dataId, signal, transport)
  await uploadFile(file, uploadUrl, signal, transport)
  const zipUrl = await pollTaskResult(batchId, dataId, apiToken, signal, transport)
  return downloadMarkdown(zipUrl, signal, transport)
}

function parseErrorBody(error: unknown): MineruApiResponse<unknown> | undefined {
  if (!(error instanceof ApiError) || !error.responseBody) return undefined
  try {
    return JSON.parse(error.responseBody) as MineruApiResponse<unknown>
  } catch {
    return undefined
  }
}

/** Validate a MinerU token without creating a real parsing task. */
export async function testMineruConnection(
  apiToken: string,
  transport: MineruTransport = requestMineru
): Promise<{ success: boolean; error?: string }> {
  const token = apiToken.trim()
  if (!token) return { success: false, error: 'mineru_api_token_required' }

  try {
    const response = await transport(`${MINERU_API_ORIGIN}/file-urls/batch`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ files: [], model_version: 'vlm' }),
    })
    // Parse the body before applying the HTTP status check. MinerU may return
    // authentication failures as either a JSON error with HTTP 200 or a 401/403
    // response, depending on the gateway handling the request.
    const body = await response.text().catch(() => '')
    let payload: MineruApiResponse<unknown> | undefined
    try {
      const parsed = JSON.parse(body) as MineruApiResponse<unknown>
      if (parsed && typeof parsed === 'object') payload = parsed
    } catch {
      // A non-JSON successful response cannot prove that the token was accepted.
    }
    const upstreamCode = String(payload?.msgCode ?? payload?.code ?? '')
    if (upstreamCode === 'A0202' || upstreamCode === 'A0211' || response.status === 401 || response.status === 403) {
      return { success: false, error: 'mineru_token_invalid' }
    }
    if (!response.ok || !payload) return { success: false, error: 'mineru_connection_failed' }
    // An empty file list may be rejected as a parameter error, but that still
    // proves the token reached MinerU and was accepted by its auth layer.
    return { success: true }
  } catch (error) {
    const payload = parseErrorBody(error)
    const upstreamCode = String(payload?.msgCode ?? payload?.code ?? '')
    if (
      upstreamCode === 'A0202' ||
      upstreamCode === 'A0211' ||
      (error instanceof ApiError && (error.statusCode === 401 || error.statusCode === 403))
    ) {
      return { success: false, error: 'mineru_token_invalid' }
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'mineru_connection_failed',
    }
  }
}
