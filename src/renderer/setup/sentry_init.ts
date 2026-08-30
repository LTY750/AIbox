import { initSettingsStore } from '@/stores/settingsStore'

/**
 * Historical entry point retained so startup imports remain backwards
 * compatible. Error diagnostics are local-only; there is no remote DSN or SDK
 * initialization in any build target.
 */
export async function initSentry(): Promise<boolean> {
  await initSettingsStore()
  return false
}

export default undefined
