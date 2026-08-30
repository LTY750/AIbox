import { Box, Flex, Stack, Switch, Text, Title } from '@mantine/core'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { zodValidator } from '@tanstack/zod-adapter'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { BuiltinServersSection } from '@/components/settings/mcp/BuiltinServersSection'
import CustomServersSection from '@/components/settings/mcp/CustomServersSection'
import { parseServerFromJson } from '@/components/settings/mcp/utils'
import { useSetMCPEnabled } from '@/hooks/mcp'
import type { MCPServerConfig } from '@/packages/mcp/types'
import platform from '@/platform'
import { useMcpSettings } from '@/stores/settingsStore'
import { decodeBase64 } from '@/utils/base64'

const searchSchema = z.object({
  install: z.string().optional(), // b64 encoded config
})

export const Route = createFileRoute('/settings/mcp')({
  component: RouteComponent,
  validateSearch: zodValidator(searchSchema),
})

export function RouteComponent() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const searchParams = Route.useSearch()
  const [installConfig, setInstallConfig] = useState<MCPServerConfig | undefined>(undefined)
  const mcpSettings = useMcpSettings()
  const setMcpEnabled = useSetMCPEnabled()

  // Handle install parameter from search params
  useEffect(() => {
    if (searchParams.install) {
      try {
        const config = parseServerFromJson(decodeBase64(searchParams.install))
        setInstallConfig(config)
      } catch (err) {
        console.error(err)
      }
      // Clear search params immediately after reading
      navigate({
        to: '/settings/mcp',
        search: {},
        replace: true,
      })
    }
  }, [searchParams.install, navigate])

  return (
    <Stack p="md" gap="xl">
      <Title order={5}>{t('MCP Settings')}</Title>
      <Stack gap="sm">
        <Flex align="center" justify="space-between" gap="md">
          <Text size="sm">{t('Enable remote MCP')}</Text>
          <Switch
            size="sm"
            aria-label={String(t('Enable remote MCP'))}
            checked={mcpSettings.enabled}
            onChange={(event) => setMcpEnabled(event.currentTarget.checked)}
          />
        </Flex>
        <Text size="xs" c="chatbox-tertiary">
          {t('Allow configured remote MCP servers to connect and provide tools to models.')}
        </Text>
        {platform.type === 'mobile' && (
          <Text size="xs" c="chatbox-tertiary" mt="xs">
            {t('Mobile supports remote HTTPS MCP servers only. Local stdio servers are unavailable.')}
          </Text>
        )}
      </Stack>
      {platform.type !== 'mobile' && <BuiltinServersSection />}
      <Box>
        <CustomServersSection installConfig={installConfig} />
      </Box>
    </Stack>
  )
}
