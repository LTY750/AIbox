import type { Settings } from '@shared/types'
import platform from '@/platform'
import { getBuiltinServerConfig } from './builtin'
import { mcpController } from './controller'
import type { MCPServerConfig } from './types'

export function getEnabledMcpServerConfigs(settings: Settings): MCPServerConfig[] {
  if (!settings.mcp.enabled) return []
  return [
    ...(platform.type === 'mobile'
      ? []
      : settings.mcp.enabledBuiltinServers
          .map((id) => getBuiltinServerConfig(id, settings.licenseKey))
          .filter((server): server is MCPServerConfig => Boolean(server))),
    // Stdio remains in the persisted schema only for backwards compatibility.
    // It must never be started: all supported MCP connections are remote.
    ...settings.mcp.servers.filter((server) => server.enabled && server.transport.type === 'http'),
  ]
}

export async function reconcileMcpServers(settings: Settings, appActive = true): Promise<void> {
  await mcpController.stopAll()
  if (!appActive || !settings.mcp.enabled) return
  await Promise.all(getEnabledMcpServerConfigs(settings).map((server) => mcpController.startServer(server)))
}
