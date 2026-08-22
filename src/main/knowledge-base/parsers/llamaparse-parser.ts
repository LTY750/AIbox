import fs from 'node:fs'
import type { DocumentParserType } from '../../../shared/types/settings'
import { getLogger } from '../../util'
import type { DocumentParser, ParserFileMeta } from './types'

const log = getLogger('knowledge-base:llamaparse-parser')
const LLAMAPARSE_ORIGIN = 'https://api.cloud.llamaindex.ai'
const POLL_INTERVAL_MS = 1500
const POLL_TIMEOUT_MS = 120000

type LlamaResponse = {
  id?: string
  job_id?: string
  status?: string
  markdown_full?: string
  markdown?: string | { pages?: Array<{ markdown?: string }> }
  result?: { markdown?: string }
  job?: { id?: string; status?: string; error_message?: string }
  error?: string
  error_message?: string
}

function extractMarkdown(payload: LlamaResponse): string | undefined {
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

async function readError(response: Response): Promise<string> {
  return (await response.text().catch(() => '')).slice(0, 500)
}

export class LlamaParseParser implements DocumentParser {
  readonly type: DocumentParserType = 'llamaparse'

  constructor(private readonly apiKey: string) {}

  async parse(filePath: string, meta: ParserFileMeta): Promise<string> {
    const apiKey = this.apiKey.trim()
    if (!apiKey) throw new Error('llama_parse_api_key_required')

    const buffer = await fs.promises.readFile(filePath)
    const form = new FormData()
    form.append('purpose', 'parse')
    const fileBytes = new Uint8Array(buffer)
    form.append('file', new Blob([fileBytes], { type: meta.mimeType }), meta.filename)

    const uploadResponse = await fetch(`${LLAMAPARSE_ORIGIN}/api/v1/beta/files`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    })
    if (!uploadResponse.ok) {
      throw new Error(`LlamaParse upload failed (${uploadResponse.status}): ${await readError(uploadResponse)}`)
    }
    const upload = (await uploadResponse.json()) as LlamaResponse
    const fileId = upload.id
    if (!fileId) throw new Error('LlamaParse upload response did not contain a file id')

    try {
      const jobResponse = await fetch(`${LLAMAPARSE_ORIGIN}/api/v2/parse`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_id: fileId, tier: 'cost_effective', version: 'latest' }),
      })
      if (!jobResponse.ok) {
        throw new Error(`LlamaParse job creation failed (${jobResponse.status}): ${await readError(jobResponse)}`)
      }
      const job = (await jobResponse.json()) as LlamaResponse
      const jobId = job.id || job.job_id || job.job?.id
      if (!jobId) throw new Error('LlamaParse job response did not contain a job id')

      const startedAt = Date.now()
      while (Date.now() - startedAt < POLL_TIMEOUT_MS) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
        const pollResponse = await fetch(
          `${LLAMAPARSE_ORIGIN}/api/v2/parse/${encodeURIComponent(jobId)}?expand=markdown`,
          { headers: { Authorization: `Bearer ${apiKey}` } }
        )
        if (!pollResponse.ok) {
          throw new Error(`LlamaParse polling failed (${pollResponse.status}): ${await readError(pollResponse)}`)
        }
        const payload = (await pollResponse.json()) as LlamaResponse
        const status = String(payload.job?.status || payload.status || '').toUpperCase()
        if (status === 'SUCCESS' || status === 'COMPLETED') {
          const content = extractMarkdown(payload)
          if (!content) throw new Error('LlamaParse completed without Markdown content')
          log.info(`[LLAMA] Parse completed for ${meta.filename}`)
          return content
        }
        if (status === 'ERROR' || status === 'FAILED' || status === 'CANCELLED') {
          throw new Error(`LlamaParse parse failed: ${payload.job?.error_message || payload.error_message || payload.error || status}`)
        }
      }
      throw new Error('LlamaParse timed out after 2 minutes')
    } finally {
      await fetch(`${LLAMAPARSE_ORIGIN}/api/v1/beta/files/${encodeURIComponent(fileId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${apiKey}` },
      }).catch(() => undefined)
    }
  }
}
