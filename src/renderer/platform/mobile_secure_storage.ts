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
    // Schema (key_value table) is created by the versioned migration runner
    // invoked from getSharedSQLiteDatabase.
    fallbackDatabase = getSharedSQLiteDatabase('chatbox-credentials.db', 1)
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
  } catch (pluginError) {
    // A registered native plugin reporting a present-but-unreadable value is
    // materially different from an unavailable plugin (iOS/web fallback).
    const errorCode =
      typeof pluginError === 'object' && pluginError !== null && 'code' in pluginError
        ? String((pluginError as { code?: unknown }).code)
        : ''
    const errorMessage = pluginError instanceof Error ? pluginError.message : String(pluginError)
    if (errorCode === 'SECURE_STORAGE_READ_FAILED' || errorMessage.includes('Unable to read secure value')) {
      console.error(`Secure storage read failed for key "${key}"`, pluginError)
      throw new Error(`Unable to decrypt secure value for ${key}`, { cause: pluginError })
    }
    try {
      const database = await getFallbackDatabase()
      const result = await database.query('SELECT value FROM key_value WHERE key = ?', [key])
      const fallbackValue = result.values?.[0]?.value ?? null
      if (fallbackValue !== null) return fallbackValue
    } catch {
      const fallbackValue = fallbackMemory.get(key)
      if (fallbackValue !== undefined) return fallbackValue
    }
    return null
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
