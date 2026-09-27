export const MEMORY_MAX_ENTRIES = 100
export const MEMORY_ENTRY_MAX_CHARS = 1000
export const MEMORY_PROMPT_MAX_CHARS = 8000

export type MemoryEntry = {
  id: string
  content: string
  createdAt: number
}

export type MemoryImportItem = Pick<MemoryEntry, 'content'> & Partial<Pick<MemoryEntry, 'id' | 'createdAt'>>