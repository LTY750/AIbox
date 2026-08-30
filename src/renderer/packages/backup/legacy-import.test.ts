import type { SessionMetaRecord } from '@shared/types'
import { describe, expect, it, vi } from 'vitest'
import { importLegacyJsonBackup, MAX_LEGACY_JSON_BACKUP_BYTES } from './legacy-import'
import type { BackupMetaStorage, BackupStorage } from './types'

class LegacyMemoryStorage implements BackupStorage {
  readonly values = new Map<string, unknown>()

  getAllKeys(): Promise<string[]> {
    return Promise.resolve(Array.from(this.values.keys()))
  }
  getItem<T>(key: string, initialValue: T): Promise<T> {
    return Promise.resolve((this.values.get(key) ?? initialValue) as T)
  }
  setItemNow<T>(key: string, value: T): Promise<void> {
    this.values.set(key, value)
    return Promise.resolve()
  }
  removeItem(key: string): Promise<void> {
    this.values.delete(key)
    return Promise.resolve()
  }
  getBlob(): Promise<string | null> {
    return Promise.resolve(null)
  }
  setBlob(): Promise<void> {
    return Promise.resolve()
  }
  delBlob(): Promise<void> {
    return Promise.resolve()
  }
}

class LegacyMemoryMetaStorage implements BackupMetaStorage {
  readonly records = new Map<string, SessionMetaRecord>()

  getAllIncludingHidden(): Promise<SessionMetaRecord[]> {
    return Promise.resolve(Array.from(this.records.values()))
  }
  getById(id: string): Promise<SessionMetaRecord | null> {
    return Promise.resolve(this.records.get(id) ?? null)
  }
  create(record: SessionMetaRecord): Promise<void> {
    this.records.set(record.id, record)
    return Promise.resolve()
  }
  update(id: string, updates: Partial<SessionMetaRecord>): Promise<SessionMetaRecord | null> {
    const existing = this.records.get(id)
    if (!existing) return Promise.resolve(null)
    const updated = { ...existing, ...updates }
    this.records.set(id, updated)
    return Promise.resolve(updated)
  }
  delete(id: string): Promise<void> {
    this.records.delete(id)
    return Promise.resolve()
  }
}

function asJsonFile(value: unknown): File {
  return new File([JSON.stringify(value)], 'legacy.json', { type: 'application/json' })
}

describe('legacy JSON backup import', () => {
  it('imports legacy key/value data, migrates it, and creates or updates session metadata', async () => {
    const storage = new LegacyMemoryStorage()
    const metaStorage = new LegacyMemoryMetaStorage()
    metaStorage.records.set('existing', { id: 'existing', name: 'Old name', sortOrder: 1, createdAt: 1 })
    const recoverSessionList = vi.fn(() => Promise.resolve())
    const result = await importLegacyJsonBackup(
      asJsonFile({
        __exported_at: '2025-01-01T00:00:00.000Z',
        configVersion: 14,
        settings: { language: 'en' },
        'session:existing': { id: 'existing', name: 'Updated', messages: [] },
        'chat-sessions-list': [
          { id: 'existing', name: 'Updated', sortOrder: 2, createdAt: 2 },
          { id: 'new', name: 'New session' },
        ],
      }),
      {
        storage,
        metaStorage,
        recoverSessionList,
        migrateData: async (dataStore) => {
          const settings = await dataStore.getData<Record<string, unknown>>('settings', {})
          await dataStore.setData('settings', { ...settings, fontSize: 16 })
        },
      }
    )

    expect(storage.values.get('settings')).toMatchObject({ language: 'en', fontSize: 16 })
    expect(storage.values.get('configVersion')).toBeUndefined()
    expect(metaStorage.records.get('existing')?.name).toBe('Updated')
    expect(metaStorage.records.get('new')).toMatchObject({ id: 'new', name: 'New session' })
    expect(result).toEqual({ importedKeyCount: 2, importedMetaCount: 2, recoveredSessionList: false })
    expect(recoverSessionList).not.toHaveBeenCalled()
  })

  it('rebuilds metadata for older backups that only contain session keys', async () => {
    const recoverSessionList = vi.fn(() => Promise.resolve())
    const result = await importLegacyJsonBackup(
      asJsonFile({ 'session:old': { id: 'old', name: 'Old', messages: [] } }),
      {
        storage: new LegacyMemoryStorage(),
        metaStorage: new LegacyMemoryMetaStorage(),
        recoverSessionList,
        migrateData: () => Promise.resolve(),
      }
    )
    expect(result.recoveredSessionList).toBe(true)
    expect(recoverSessionList).toHaveBeenCalledOnce()
  })

  it('rejects non-object JSON backups', async () => {
    await expect(
      importLegacyJsonBackup(asJsonFile([]), {
        storage: new LegacyMemoryStorage(),
        metaStorage: new LegacyMemoryMetaStorage(),
        recoverSessionList: () => Promise.resolve(),
        migrateData: () => Promise.resolve(),
      })
    ).rejects.toThrow('Unsupported legacy backup data format')
  })

  it('rejects oversized files before reading their contents', async () => {
    const text = vi.fn(() => Promise.resolve('{}'))
    const oversizedFile = { size: MAX_LEGACY_JSON_BACKUP_BYTES + 1, text } as unknown as File

    await expect(
      importLegacyJsonBackup(oversizedFile, {
        storage: new LegacyMemoryStorage(),
        metaStorage: new LegacyMemoryMetaStorage(),
        recoverSessionList: () => Promise.resolve(),
        migrateData: () => Promise.resolve(),
      })
    ).rejects.toThrow('Legacy JSON backup is too large')
    expect(text).not.toHaveBeenCalled()
  })
})
