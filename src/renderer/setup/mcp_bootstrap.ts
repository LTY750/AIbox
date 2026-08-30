import { reconcileMcpServers } from '@/packages/mcp/runtime'
import platform from '@/platform'
import { initSettingsStore, settingsStore } from '@/stores/settingsStore'

let appActive = true
let reconciliation = Promise.resolve()

function scheduleReconciliation() {
  const settings = settingsStore.getState().getSettings()
  reconciliation = reconciliation
    .then(() => reconcileMcpServers(settings, appActive))
    .catch(() => undefined)
}

initSettingsStore()
  .then((settings) => {
    reconciliation = reconcileMcpServers(settings, appActive).catch(() => undefined)
    settingsStore.subscribe((state, previousState) => {
      if (state.mcp !== previousState.mcp || state.licenseKey !== previousState.licenseKey) {
        scheduleReconciliation()
      }
    })
    platform.onAppStateChange?.(({ isActive }) => {
      if (appActive === isActive) return
      appActive = isActive
      scheduleReconciliation()
    })
  })
  .catch((err) => {
    console.error('mcp bootstrap error', err)
  })
