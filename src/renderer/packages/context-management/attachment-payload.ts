import type { CompactionPoint, Message, Settings } from '@shared/types'

export const MAX_INLINE_FILE_LINES = 500
export const PREVIEW_LINES = 100

export interface AttachmentWrapperPrefixParams {
  attachmentIndex: number
  fileName: string
  fileKey: string
  fileLines: number
  fileSize: number
}

export interface AttachmentWrapperSuffixParams {
  isTruncated: boolean
  previewLines?: number
  totalLines?: number
  fileKey?: string
}

export interface SelectMessagesForSendContextParams {
  settings: Partial<Settings>
  msgs: Message[]
  compactionPoints?: CompactionPoint[]
  preserveLastUserMessage?: boolean
  keepToolCallRounds?: number
}

export function buildAttachmentWrapperPrefix(params: AttachmentWrapperPrefixParams): string {
  const { attachmentIndex, fileName, fileKey, fileLines, fileSize } = params

  let prefix = '\n\n<ATTACHMENT_FILE>\n'
  prefix += `<FILE_INDEX>${attachmentIndex}</FILE_INDEX>\n`
  prefix += `<FILE_NAME>${fileName}</FILE_NAME>\n`
  prefix += `<FILE_KEY>${fileKey}</FILE_KEY>\n`
  prefix += `<FILE_LINES>${fileLines}</FILE_LINES>\n`
  prefix += `<FILE_SIZE>${fileSize} bytes</FILE_SIZE>\n`
  prefix += '<FILE_CONTENT>\n'

  return prefix
}

export function buildAttachmentWrapperSuffix(params: AttachmentWrapperSuffixParams): string {
  const { isTruncated, previewLines, totalLines, fileKey } = params

  let suffix = '</FILE_CONTENT>\n'

  if (isTruncated && previewLines !== undefined && totalLines !== undefined && fileKey !== undefined) {
    suffix += `<TRUNCATED>Content truncated. Showing first ${previewLines} of ${totalLines} lines. Use read_file or search_file_content tool with FILE_KEY="${fileKey}" to read more content.</TRUNCATED>\n`
  }

  suffix += '</ATTACHMENT_FILE>\n'

  return suffix
}

export function selectMessagesForSendContext(params: SelectMessagesForSendContextParams): Message[] {
  const { settings, msgs, compactionPoints, preserveLastUserMessage = true, keepToolCallRounds = 2 } = params

  if (msgs.length === 0) {
    return []
  }

  const maxContextMessageCount = settings.maxContextMessageCount ?? Number.MAX_SAFE_INTEGER

  const filtered: Message[] = []
  for (const msg of msgs) {
    if (msg.error || msg.errorCode) {
      continue
    }
    if (msg.generating === true) {
      continue
    }
    filtered.push(msg)
  }

  if (filtered.length === 0) {
    return []
  }

  const systemMessage = filtered.find((message) => message.role === 'system')
  const summaryMessages = filtered.filter((message) => message.isSummary && message !== systemMessage)
  const history = filtered.filter((message) => message.role !== 'system' && !message.isSummary)
  const limit = Math.max(0, maxContextMessageCount) + (preserveLastUserMessage ? 1 : 0)
  const recent = limit > 0 ? history.slice(-limit) : []

  // Compaction summaries stand in for the omitted prefix. Preserve them even
  // when the recent-message limit is small, otherwise the model silently loses
  // the compressed conversation state.
  return [
    ...(systemMessage ? [systemMessage] : []),
    ...summaryMessages,
    ...recent,
  ]
}
