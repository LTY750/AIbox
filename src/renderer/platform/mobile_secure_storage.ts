import { registerPlugin } from '@capacitor/core'

interface SecureStoragePlugin {
  set(options: { key: string; value: string }): Promise<void>
  get(options: { key: string }): Promise<{ value: string | null }>
  remove(options: { key: string }): Promise<void>
}

const SecureStorage = registerPlugin<SecureStoragePlugin>('SecureStorage')

// A native secure-storage failure must never downgrade credentials to a
// plaintext database or localStorage. The in-memory fallback only keeps a
// running preview usable; values disappear when the WebView process exits.
const fallbackMemory = new Map<string, string>()

function clearFallbackValue(key: string): void {
  fallbackMemory.delete(key)
}

export async function setSecureValue(key: string, value: string): Promise<void> {
  try {
    await SecureStorage.set({ key, value })
    clearFallbackValue(key)
  } catch {
    // Keep previews and older native shells usable without persisting a
    // credential outside the platform secure-storage implementation.
    fallbackMemory.set(key, value)
  }
}

export async function getSecureValue(key: string): Promise<string | null> {
  try {
    const result = await SecureStorage.get({ key })
    const nativeValue = result.value ?? null
    if (nativeValue !== null) return nativeValue

    return fallbackMemory.get(key) ?? nativeValue
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
    return fallbackMemory.get(key) ?? null
  }
}

export async function removeSecureValue(key: string): Promise<void> {
  try {
    await SecureStorage.remove({ key })
  } catch {
    // The fallback is still removed below when the native plugin is unavailable.
  }
  clearFallbackValue(key)
}
