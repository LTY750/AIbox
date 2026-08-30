import { useCallback, useEffect, useState } from 'react'
import { BUILTIN_MCP_SERVERS } from '@/packages/mcp/builtin'
import { mcpController } from '@/packages/mcp/controller'
import type { MCPServerStatus } from '@/packages/mcp/types'
import { useSettingsStore } from '@/stores/settingsStore'

export function useMCPServerStatus(id: string) {
  const [status, setStatus] = useState<MCPServerStatus | null>(null)
  useEffect(() => {
    return mcpController.subscribeToServerStatus(id, setStatus)
  }, [id])
  return status
}

export function useToggleMCPServer() {
  const setSettings = useSettingsStore((state) => state.setSettings)
  return useCallback(
    (id: string, enabled: boolean) => {
      const isBuiltin = BUILTIN_MCP_SERVERS.some((s) => s.id === id)
      if (isBuiltin) {
        setSettings((draft) => {
          const enabledBuiltinServers = draft.mcp.enabledBuiltinServers
          if (enabled) {
            if (!enabledBuiltinServers.includes(id)) {
              enabledBuiltinServers.push(id)
            }
          } else {
            const index = enabledBuiltinServers.indexOf(id)
            if (index !== -1) {
              enabledBuiltinServers.splice(index, 1)
            }
          }
        })
      } else {
        setSettings((draft) => {
          draft.mcp.servers.forEach((s) => {
            // Legacy stdio entries remain parseable for migrations, but are
            // never a supported runtime or UI target.
            if (s.id === id && s.transport.type === 'http') {
              s.enabled = enabled
            }
          })
        })
      }
    },
    [setSettings]
  )
}

export function useSetMCPEnabled() {
  const setSettings = useSettingsStore((state) => state.setSettings)
  return useCallback(
    (enabled: boolean) => {
      setSettings((draft) => {
        draft.mcp.enabled = enabled
      })
    },
    [setSettings]
  )
}
