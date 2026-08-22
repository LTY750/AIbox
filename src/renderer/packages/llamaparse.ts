import { getLogger } from '@/lib/utils'
import { handleMobileRequest } from '@/utils/mobile-request'
import { CHATBOX_BUILD_TARGET } from '@/variables'

const log = getLogger('llamaparse')
const LLAMAPARSE_ORIGIN = 'https://api.cloud.llamaindex.ai'
const POLL_INTERVAL_MS = 1500
const POLL_TIMEOUT_MS = 120000

export interface LlamaParseConfig {
  apiKey: string
}

type LlamaJobResponse = {
  id?: string
  job_id?: string
  status?: string
  markdown_full?: string
  markdown?: string | { pages?: Array<{ markdown?: string }> }
  result?: { markdown?: string }
  job?: {
    id?: string
    status?: string
    error_message?: string
  }
  error?: string
  error_message?: string
}

function requestLlamaParse(url: string, init: RequestInit = {}): Promise<Response> {
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

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const timeout = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timeout)
        reject(new DOMException('Aborted', 'AbortError'))
      },
      { once: true }
    )
  })
}

async function readError(response: Response): Promise<string> {
  const text = await response.text().catch(() => '')
  return text.slice(0, 500)
}

async function uploadFile(file: File, apiKey: string, signal?: AbortSignal): Promise<string> {
  const form = new FormData()
  form.append('purpose', 'parse')
  form.append('file', file, file.name)

  const response = await requestLlamaParse(`${LLAMAPARSE_ORIGIN}/api/v1/beta/files`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal,
  })
  if (!response.ok) {
    throw new Error(`LlamaParse upload failed (${response.status}): ${await readError(response)}`)
  }
  const payload = (await response.json()) as LlamaJobResponse
  const fileId = payload.id
  if (!fileId) throw new Error('LlamaParse upload response did not contain a file id')
  return fileId
}

async function createJob(fileId: string, apiKey: string, signal?: AbortSignal): Promise<string> {
  const response = await requestLlamaParse(`${LLAMAPARSE_ORIGIN}/api/v2/parse`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ file_id: fileId, tier: 'cost_effective', version: 'latest' }),
    signal,
  })
  if (!response.ok) {
    throw new Error(`LlamaParse job creation failed (${response.status}): ${await readError(response)}`)
  }
  const payload = (await response.json()) as LlamaJobResponse
  const jobId = payload.id || payload.job_id || payload.job?.id
  if (!jobId) throw new Error('LlamaParse job response did not contain a job id')
  return jobId
}

function extractMarkdown(payload: LlamaJobResponse): string | undefined {
  if (typeof payload.markdown_full === 'string' && payload.markdown_full.trim()) return payload.markdown_full
  if (typeof payload.markdown === 'string' && payload.markdown.trim()) return payload.markdown
  if (payload.markdown && typeof payload.markdown === 'object' && Array.isArray(payload.markdown.pages)) {
    const markdown = payload.markdown.pages
      .map((page) => page.markdown || '')
      .filter(Boolean)
      .join('\n\n')
    if (markdown) return markdown
  }
  if (typeof payload.result?.markdown === 'string' && payload.result.markdown.trim()) return payload.result.markdown
  return undefined
}

async function pollJob(jobId: string, apiKey: string, signal?: AbortSignal): Promise<string> {
  const startedAt = Date.now()
  while (Date.now() - startedAt < POLL_TIMEOUT_MS) {
    await sleep(POLL_INTERVAL_MS, signal)
    const response = await requestLlamaParse(
      `${LLAMAPARSE_ORIGIN}/api/v2/parse/${encodeURIComponent(jobId)}?expand=markdown`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal,
      }
    )
    if (!response.ok) {
      throw new Error(`LlamaParse polling failed (${response.status}): ${await readError(response)}`)
    }
    const payload = (await response.json()) as LlamaJobResponse
    const status = String(payload.job?.status || payload.status || '').toUpperCase()
    if (status === 'SUCCESS' || status === 'COMPLETED') {
      const markdown = extractMarkdown(payload)
      if (!markdown) throw new Error('LlamaParse completed without Markdown content')
      return markdown
    }
    if (status === 'ERROR' || status === 'FAILED' || status === 'CANCELLED') {
      throw new Error(
        `LlamaParse parse failed: ${payload.job?.error_message || payload.error_message || payload.error || status}`
      )
    }
  }
  throw new Error('LlamaParse timed out after 2 minutes')
}

export async function parseFileWithLlamaParse(
  file: File,
  config: LlamaParseConfig,
  signal?: AbortSignal
): Promise<string> {
  const apiKey = config.apiKey.trim()
  if (!apiKey) throw new Error('llama_parse_api_key_required')

  let fileId: string | undefined
  try {
    fileId = await uploadFile(file, apiKey, signal)
    const jobId = await createJob(fileId, apiKey, signal)
    const content = await pollJob(jobId, apiKey, signal)
    log.info(`Parsed ${file.name} with LlamaParse`)
    return content
  } finally {
    if (fileId) {
      await requestLlamaParse(`${LLAMAPARSE_ORIGIN}/api/v1/beta/files/${encodeURIComponent(fileId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${apiKey}` },
      }).catch(() => undefined)
    }
  }
}
