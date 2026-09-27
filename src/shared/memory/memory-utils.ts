import { v4 as uuidv4 } from 'uuid'
import {
  MEMORY_ENTRY_MAX_CHARS,
  MEMORY_MAX_ENTRIES,
  type MemoryEntry,
  type MemoryImportItem,
} from './types'

export function sanitizeMemoryContent(content: string): string {
  return content.trim()
}

export function validateMemoryContent(content: string): string | undefined {
  const normalized = sanitizeMemoryContent(content)
  if (!normalized) return 'Memory content cannot be empty'
  if (normalized.length > MEMORY_ENTRY_MAX_CHARS) {
    return `Memory content cannot exceed ${MEMORY_ENTRY_MAX_CHARS} characters`
  }
  return undefined
}

export function createMemory(content: string, now = Date.now()): MemoryEntry {
  const normalized = sanitizeMemoryContent(content)
  const error = validateMemoryContent(normalized)
  if (error) throw new Error(error)
  return { id: uuidv4(), content: normalized, createdAt: now }
}

export function normalizeMemories(value: unknown): MemoryEntry[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const memories: MemoryEntry[] = []
  for (const item of value as MemoryImportItem[]) {
    if (!item || typeof item.content !== 'string') continue
    const content = sanitizeMemoryContent(item.content)
    if (validateMemoryContent(content) || seen.has(content)) continue
    seen.add(content)
    memories.push({
      id: typeof item.id === 'string' && item.id ? item.id : uuidv4(),
      content,
      createdAt: typeof item.createdAt === 'number' && Number.isFinite(item.createdAt) ? item.createdAt : Date.now(),
    })
    if (memories.length >= MEMORY_MAX_ENTRIES) break
  }
  return memories
}