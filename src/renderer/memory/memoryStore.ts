import {
  createMemory,
  MEMORY_MAX_ENTRIES,
  normalizeMemories,
  sanitizeMemoryContent,
  validateMemoryContent,
  type MemoryEntry,
  type MemoryImportItem,
} from '@shared/memory'
import storage from '@/storage'

export const MEMORIES_STORAGE_KEY = 'memories'

export type MemoryStorage = Pick<typeof storage, 'getItem' | 'setItemNow' | 'removeItem'>

export class MemoryStore {
  private writeQueue: Promise<void> = Promise.resolve()

  constructor(private readonly store: MemoryStorage = storage) {}

  async listMemories(): Promise<MemoryEntry[]> {
    const value = await this.store.getItem<unknown>(MEMORIES_STORAGE_KEY, [])
    return normalizeMemories(value)
  }

  addMemory(content: string): Promise<MemoryEntry> {
    const normalized = sanitizeMemoryContent(content)
    const validationError = validateMemoryContent(normalized)
    if (validationError) throw new Error(validationError)

    return this.enqueue(async () => {
      const memories = await this.listMemories()
      if (memories.some((memory) => memory.content === normalized)) {
        throw new Error('This memory already exists')
      }
      const next = createMemory(normalized)
      if (memories.length >= MEMORY_MAX_ENTRIES) throw new Error('Memory limit reached')
      await this.store.setItemNow(MEMORIES_STORAGE_KEY, [...memories, next])
      return next
    })
  }

  async deleteMemory(id: string): Promise<void> {
    await this.enqueue(async () => {
      const memories = await this.listMemories()
      await this.store.setItemNow(
        MEMORIES_STORAGE_KEY,
        memories.filter((memory) => memory.id !== id)
      )
    })
  }

  async clearMemories(): Promise<void> {
    await this.enqueue(() => this.store.removeItem(MEMORIES_STORAGE_KEY))
  }

  importMemories(items: MemoryImportItem[]): Promise<MemoryEntry[]> {
    return this.enqueue(async () => {
      const existing = await this.listMemories()
      const existingContents = new Set(existing.map((memory) => memory.content))
      const imported = normalizeMemories(items).filter((memory) => !existingContents.has(memory.content))
      const next = [...existing, ...imported].slice(0, MEMORY_MAX_ENTRIES)
      await this.store.setItemNow(MEMORIES_STORAGE_KEY, next)
      return next
    })
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.writeQueue.then(operation)
    this.writeQueue = result.then(
      () => undefined,
      () => undefined
    )
    return result
  }
}

export const memoryStore = new MemoryStore()