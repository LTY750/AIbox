import { ActionIcon, Anchor, Badge, Flex, Paper, SimpleGrid, Switch, Text } from '@mantine/core'
import { spotlight } from '@mantine/spotlight'
import { IconClipboard, IconPlus } from '@tabler/icons-react'
import { type FC, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { v4 as uuid } from 'uuid'
import { ScalableIcon } from '@/components/common/ScalableIcon'
import { AppTooltip as Tooltip } from '@/components/ui/tooltip'
import { useMCPServerStatus, useToggleMCPServer } from '@/hooks/mcp'
import type { MCPServerConfig } from '@/packages/mcp/types'
import { toastError } from '@/packages/toast'
import platform from '@/platform'
import { useMcpSettings, useSettingsStore } from '@/stores/settingsStore'
import { trackEvent } from '@/utils/track'
import { ConfigModal } from './ConfigModal'
import ServerRegistrySpotlight from './ServerRegistrySpotlight'
import { parseServersFromJson } from './utils'

const ServerCard: FC<{
  config: MCPServerConfig
  triggerEdit: (serverConfig: MCPServerConfig) => void
  onEnabledChange: (id: string, enabled: boolean) => void
  mcpEnabled: boolean
}> = (props) => {
  const { t } = useTranslation()
  const { config, triggerEdit, onEnabledChange } = props
  const status = useMCPServerStatus(config.id)
  const statusLabel = status?.error
    ? t('Failed')
    : status?.state === 'running'
      ? t('Running')
      : config.enabled
        ? t('On')
        : t('Off')
  return (
    <Paper shadow="xs" radius="md" withBorder p="sm">
      <Flex justify="space-between" align="center">
        <Text size="sm" fw={600}>
          {config.name}
        </Text>
        <Switch
          size="xs"
          checked={config.enabled}
          onChange={(e) => onEnabledChange(config.id, e.currentTarget.checked)}
          disabled={!props.mcpEnabled}
        />
      </Flex>
      <Flex justify="space-between" align="center" mt="lg">
        <Flex gap="xs">
          <Badge size="sm" variant="light" color="chatbox-brand">
            {config.transport.type}
          </Badge>
          <Badge
            size="sm"
            variant="light"
            color={status?.error ? 'red' : status?.state === 'running' ? 'green' : 'gray'}
          >
            {statusLabel}
          </Badge>
        </Flex>
        <Anchor size="xs" c="chatbox-brand" onClick={() => triggerEdit(config)}>
          {t('Edit')}
        </Anchor>
      </Flex>
    </Paper>
  )
}

type Props = {
  installConfig?: MCPServerConfig
}

const CustomServersSection: FC<Props> = (props) => {
  const { t } = useTranslation()
  const setSettings = useSettingsStore((state) => state.setSettings)
  const mcpSettings = useMcpSettings()
  const onEnabledChange = useToggleMCPServer()
  const remoteServers = mcpSettings.servers.filter((server) => server.transport.type === 'http')
  const [modal, setModal] = useState<{ config: MCPServerConfig; mode: 'add' | 'edit' } | null>(null)

  useEffect(() => {
    if (props.installConfig) {
      setModal({ mode: 'add', config: props.installConfig })
    }
  }, [props.installConfig])

  const handleServerUpdate = (config: MCPServerConfig) => {
    const normalizedConfig = { ...config, disabledTools: config.disabledTools ?? [] }
    setSettings((draft) => {
      const index = draft.mcp.servers.findIndex((s) => s.id === normalizedConfig.id)
      if (index !== -1) {
        draft.mcp.servers[index] = normalizedConfig
      } else {
        draft.mcp.servers.push(normalizedConfig)
      }
    })
    if (modal?.mode === 'add') {
      toast.success(t('MCP server added'))
    }
    setModal(null)
  }

  const handleServerDelete = (id: string) => {
    if (!window.confirm(String(t('Are you sure you want to delete this server?')))) {
      return
    }
    setSettings((draft) => {
      draft.mcp.servers = draft.mcp.servers.filter((s) => s.id !== id)
    })
    setModal(null)
  }

  const triggerAddServer = useCallback(() => {
    setModal({
      mode: 'add',
      config: {
        id: uuid(),
        name: '',
        enabled: true,
        disabledTools: [],
        transport: { type: 'http', url: '' },
      },
    })
  }, [])

  const triggerImportJson = async () => {
    try {
      const content = await navigator.clipboard.readText()
      const servers = parseServersFromJson(content)
      trackEvent('import_mcp_servers_from_json', { count: servers.length })
      if (!servers.length) {
        toastError(t('No MCP servers parsed from clipboard'))
        return
      }
      setSettings((draft) => {
        draft.mcp.servers.push(...servers.map((server) => ({ ...server, disabledTools: server.disabledTools ?? [] })))
      })
      toast.success(
        t('{{count}} MCP servers imported', { count: servers.length }) +
          ': ' +
          servers.map((server) => server.name).join(', ')
      )
    } catch {
      toastError(t('No MCP servers parsed from clipboard'))
    }
  }

  return (
    <>
      <Flex justify="space-between" align="center" mb={12}>
        <Text size="sm" fw={600}>
          {t('Custom MCP Servers')}
        </Text>
        {platform.type === 'mobile' && (
          <Tooltip label={t('Import from Clipboard')}>
            <ActionIcon
              variant="subtle"
              onClick={() => void triggerImportJson()}
              aria-label={t('Import from Clipboard')}
            >
              <IconClipboard size={18} />
            </ActionIcon>
          </Tooltip>
        )}
      </Flex>
      <SimpleGrid type="container" cols={{ base: 1, '450px': 2, '800px': 3, '1200px': 4 }}>
        <Paper
          tabIndex={-1}
          shadow="xs"
          radius="md"
          withBorder
          bd="1px dashed var(--chatbox-border-primary)"
          p="sm"
          className="cursor-pointer"
          onClick={platform.type === 'mobile' ? () => triggerAddServer() : spotlight.open}
        >
          <Flex direction="column" justify="center" align="center" h="100%" gap={4}>
            <ActionIcon variant="filled" size="sm">
              <ScalableIcon icon={IconPlus} />
            </ActionIcon>
            <Text size="xs" c="chatbox-brand">
              {t('Add Server')}
            </Text>
          </Flex>
        </Paper>
        {remoteServers.map((server) => (
          <ServerCard
            key={server.id}
            config={server}
            triggerEdit={(config) => setModal({ mode: 'edit', config })}
            onEnabledChange={onEnabledChange}
            mcpEnabled={mcpSettings.enabled}
          />
        ))}
      </SimpleGrid>
      {platform.type === 'desktop' && (
        <ServerRegistrySpotlight triggerAddServer={triggerAddServer} triggerImportJson={triggerImportJson} />
      )}
      <ConfigModal
        mode={modal?.mode}
        config={modal ? modal.config : null}
        onClose={() => setModal(null)}
        onSave={handleServerUpdate}
        onDelete={handleServerDelete}
      />
    </>
  )
}

export default CustomServersSection
