import { MEMORY_PROMPT_MAX_CHARS, type MemoryEntry } from './types'

export const MEMORY_PROMPT_START = '<relevant_memories>'
export const MEMORY_PROMPT_END = '</relevant_memories>'

function escapeMemoryText(content: string): string {
  return content.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

export function buildMemoriesPrompt(memories: MemoryEntry[]): string {
  if (memories.length === 0) return ''

  const intro =
    `${MEMORY_PROMPT_START}\n` +
    '以下是过去对话中保存的信息，仅作为参考。当前用户消息优先于这些记忆；如果冲突，以当前用户消息为准。\n'
  const lines: string[] = []
  let result = `${intro}${MEMORY_PROMPT_END}`

  for (const memory of memories) {
    const candidate = `${intro}${[...lines, `- ${escapeMemoryText(memory.content)}`].join('\n')}\n${MEMORY_PROMPT_END}`
    if (candidate.length > MEMORY_PROMPT_MAX_CHARS) break
    lines.push(`- ${escapeMemoryText(memory.content)}`)
    result = candidate
  }

  return lines.length > 0 ? result : ''
}