import { registerPlugin } from '@capacitor/core'
import type { SQLiteDBConnection } from '@capacitor-community/sqlite'
import { getSharedSQLiteDatabase } from '../storage/sqliteConnection'

interface SecureStoragePlugin {
  set(options: { key: string; value: string }): Promise<void>
  get(options: { key: string }): Promise<{ value: string | null }>
  remove(options: { key: string }): Promise<void>
}

const SecureStorage = registerPlugin<SecureStoragePlugin>('SecureStorage')

// Keep the fallback in a separate database. It is used on iOS until its
// Keychain plugin is generated, in web previews, and with old native binaries.
// It prevents credentials from being mixed with chat/session rows and gives
// us a durable migration path instead of losing settings on reload.
let fallbackDatabase: Promise<SQLiteDBConnection> | undefined
const fallbackMemory = new Map<string, string>()
function getFallbackDatabase(): Promise<SQLiteDBConnection> {
  if (!fallbackDatabase) {
    fallbackDatabase = (async () => {
      const database = await getSharedSQLiteDatabase('chatbox-credentials.db', 1)
      await database.execute(
        'CREATE TABLE IF NOT EXISTS key_value (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)'
      )
      return database
    })()
  }
  return fallbackDatabase
}

export async function setSecureValue(key: string, value: string): Promise<void> {
  try {
    await SecureStorage.set({ key, value })
  } catch {
    try {
      const database = await getFallbackDatabase()
      await database.run('INSERT OR REPLACE INTO key_value (key, value) VALUES (?, ?)', [key, value])
    } catch {
      fallbackMemory.set(key, value)
    }
  }
}

export async function getSecureValue(key: string): Promise<string | null> {
  try {
    const result = await SecureStorage.get({ key })
    return result.value ?? null
  } catch {
    try {
      const database = await getFallbackDatabase()
      const result = await database.query('SELECT value FROM key_value WHERE key = ?', [key])
      return result.values?.[0]?.value ?? null
    } catch {
      return fallbackMemory.get(key) ?? null
    }
  }
}

export async function removeSecureValue(key: string): Promise<void> {
  try {
    await SecureStorage.remove({ key })
  } catch {
    try {
      const database = await getFallbackDatabase()
      await database.run('DELETE FROM key_value WHERE key = ?', [key])
    } catch {
      fallbackMemory.delete(key)
    }
  }
}
