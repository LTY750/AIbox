import fs from 'node:fs'
import type { DocumentParserType } from '../../../shared/types/settings'
import { getLogger } from '../../util'
import type { DocumentParser, ParserFileMeta } from './types'

const log = getLogger('knowledge-base:textin-parser')
const TEXTIN_PARSE_URL = 'https://api.textin.com/api/v1/xparse/parse/sync'
const TEXTIN_MAX_FILE_SIZE = 500 * 1024 * 1024

type TextInResponse = {
  code?: number | string
  message?: string
  data?: {
    markdown?: string
  }
}

async function readResponse(response: Response): Promise<{ payload?: TextInResponse; body: string }> {
  const body = await response.text().catch(() => '')
  if (!body) return { body }

  try {
    return { payload: JSON.parse(body) as TextInResponse, body }
  } catch {
    return { body }
  }
}

export class TextInParser implements DocumentParser {
  readonly type: DocumentParserType = 'textin'

  constructor(
    private readonly appId: string,
    private readonly secretCode: string
  ) {}

  async parse(filePath: string, meta: ParserFileMeta, signal?: AbortSignal): Promise<string> {
    const appId = this.appId.trim()
    const secretCode = this.secretCode.trim()
    if (!appId || !secretCode) throw new Error('textin_credentials_required')

    const stats = await fs.promises.stat(filePath)
    if (stats.size > TEXTIN_MAX_FILE_SIZE) {
      throw new Error(`TextIn file too large: ${stats.size} bytes (max: ${TEXTIN_MAX_FILE_SIZE})`)
    }

    const buffer = await fs.promises.readFile(filePath)
    const form = new FormData()
    form.append('file', new Blob([new Uint8Array(buffer)], { type: meta.mimeType }), meta.filename)
    form.append(
      'config',
      JSON.stringify({
        capabilities: {
          include_table_structure: true,
          title_tree: true,
        },
      })
    )

    const response = await fetch(TEXTIN_PARSE_URL, {
      method: 'POST',
      headers: {
        'x-ti-app-id': appId,
        'x-ti-secret-code': secretCode,
      },
      body: form,
      signal,
    })
    const { payload, body } = await readResponse(response)

    if (!response.ok) {
      throw new Error(`TextIn request failed (${response.status}): ${(payload?.message || body).slice(0, 500)}`)
    }
    if (!payload) {
      throw new Error('TextIn parse failed: Invalid JSON response')
    }
    if (String(payload.code) !== '200') {
      throw new Error(`TextIn parse failed (${payload.code ?? 'unknown'}): ${payload.message || 'Unknown error'}`)
    }

    const markdown = payload.data?.markdown?.trim()
    if (!markdown) throw new Error('TextIn completed without Markdown content')

    log.info(`[TEXTIN] Parse completed for ${meta.filename}, content length=${markdown.length}`)
    return markdown
  }
}
