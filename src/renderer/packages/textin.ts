import { ApiError } from '@shared/models/errors'

const TEXTIN_PARSE_URL = 'https://api.textin.com/api/v1/xparse/parse/sync'
export const TEXTIN_MAX_FILE_SIZE = 500 * 1024 * 1024

type TextInResponse = {
  code?: number | string
  message?: string
  data?: {
    markdown?: string
  }
}

type TextInTransport = (url: string, init: RequestInit) => Promise<Response>

async function readResponse(response: Response): Promise<{ payload?: TextInResponse; body: string }> {
  const body = await response.text().catch(() => '')
  if (!body) return { body }

  try {
    return { payload: JSON.parse(body) as TextInResponse, body }
  } catch {
    return { body }
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.responseBody) {
    try {
      const payload = JSON.parse(error.responseBody) as TextInResponse
      return payload.message || error.responseBody
    } catch {
      return error.responseBody
    }
  }
  return error instanceof Error ? error.message : String(error)
}

export async function parseFileWithTextIn(
  file: File,
  credentials: { appId: string; secretCode: string },
  signal?: AbortSignal,
  transport: TextInTransport = (url, init) => fetch(url, init)
): Promise<string> {
  const appId = credentials.appId.trim()
  const secretCode = credentials.secretCode.trim()
  if (!appId || !secretCode) throw new Error('textin_credentials_required')
  if (file.size > TEXTIN_MAX_FILE_SIZE) {
    throw new Error(`TextIn file too large: ${file.size} bytes (max: ${TEXTIN_MAX_FILE_SIZE})`)
  }

  const form = new FormData()
  form.append('file', file, file.name)
  form.append(
    'config',
    JSON.stringify({
      capabilities: {
        include_table_structure: true,
        title_tree: true,
      },
    })
  )

  let response: Response
  try {
    response = await transport(TEXTIN_PARSE_URL, {
      method: 'POST',
      headers: {
        'x-ti-app-id': appId,
        'x-ti-secret-code': secretCode,
      },
      body: form,
      signal,
    })
  } catch (error) {
    throw new Error(`TextIn request failed: ${getErrorMessage(error)}`)
  }

  const { payload, body } = await readResponse(response)
  if (!response.ok) {
    throw new Error(`TextIn request failed (${response.status}): ${(payload?.message || body).slice(0, 500)}`)
  }
  if (!payload) throw new Error('TextIn parse failed: Invalid JSON response')
  if (String(payload.code) !== '200') {
    throw new Error(`TextIn parse failed (${payload.code ?? 'unknown'}): ${payload.message || 'Unknown error'}`)
  }

  const markdown = payload.data?.markdown?.trim()
  if (!markdown) throw new Error('TextIn completed without Markdown content')
  return markdown
}
