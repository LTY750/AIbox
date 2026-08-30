import {
  ActionIcon,
  Anchor,
  Button,
  Group,
  Paper,
  PasswordInput,
  Stack,
  Switch,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core'
import { useForm } from '@mantine/form'
import { IconEye, IconEyeOff } from '@tabler/icons-react'
import pTimeout from 'p-timeout'
import { type CSSProperties, type FC, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AdaptiveModal } from '@/components/common/AdaptiveModal'
import { AppTooltip as Tooltip } from '@/components/ui/tooltip'
import { MCPServer } from '@/packages/mcp/controller'
import type { MCPServerConfig } from '@/packages/mcp/types'
import { trackEvent } from '@/utils/track'
import { getConfigFromFormValues, getFormValuesFromConfig, type MCPServerConfigFormValues } from './utils'

interface ConnectionTestingResult {
  config: MCPServerConfig
  tools: { name: string; description?: string }[]
  error?: Error
}

const TestingResult: FC<{
  disabledTools: string[]
  onToolEnabledChange: (name: string, enabled: boolean) => void
  result: ConnectionTestingResult
}> = ({ disabledTools, onToolEnabledChange, result }) => {
  const { t } = useTranslation()
  if (result.error) {
    return (
      <Paper withBorder p="md" mt="md">
        <Text size="sm" c="chatbox-error" className="whitespace-pre-line overflow-x-auto">
          {result.error.message}
        </Text>
      </Paper>
    )
  }
  return (
    <Paper withBorder p="md" mt="md">
      <Text fw="bold" mb="sm">
        {t('Tools')}
      </Text>
      <Stack gap="xs">
        {result.tools.map((tool) => (
          <Switch
            key={tool.name}
            size="sm"
            label={tool.name}
            description={tool.description}
            checked={!disabledTools.includes(tool.name)}
            onChange={(event) => onToolEnabledChange(tool.name, event.currentTarget.checked)}
          />
        ))}
      </Stack>
    </Paper>
  )
}

const ConfigForm: FC<{
  mode: 'add' | 'edit'
  config: MCPServerConfig
  onSave: (config: MCPServerConfig) => void
  onDelete: (id: string) => void
}> = (props) => {
  const { t } = useTranslation()
  const formRef = useRef<HTMLFormElement>(null)
  const [testing, setTesting] = useState(false)
  const [testingResult, setTestingResult] = useState<ConnectionTestingResult | null>()
  const [showHeaders, setShowHeaders] = useState(false)
  const testingAbortController = useRef<AbortController | null>(null)

  const form = useForm<MCPServerConfigFormValues>({
    mode: 'controlled',
    initialValues: getFormValuesFromConfig(props.config),
  })

  const testConnection = async () => {
    if (formRef.current && !formRef.current.reportValidity()) {
      return
    }
    setTesting(true)
    setTestingResult(null)
    let server: MCPServer | undefined
    try {
      const config = getConfigFromFormValues(form.getValues())
      trackEvent('test_mcp_server_connection', { type: config.transport.type })
      server = new MCPServer(config)
      testingAbortController.current = new AbortController()
      await pTimeout(server.start(), {
        milliseconds: 5 * 60_000,
        signal: testingAbortController.current.signal,
      })
      if (server.status.state !== 'running') {
        throw new Error(server.status.error || `Failed to start server: ${server.status.state}`)
      }
      const tools = await server.getAvailableTools()
      setTestingResult({
        config,
        tools: Object.keys(tools).map((name) => ({ name, description: tools[name].description })),
      })
      await server.stop()
    } catch (err) {
      if (testingAbortController.current?.signal.aborted) {
        return
      }
      setTestingResult({ config: props.config, error: err as Error, tools: [] })
    } finally {
      await server?.stop().catch(() => undefined)
      setTesting(false)
    }
  }

  const handleSubmit = (values: typeof form.values) => {
    try {
      trackEvent('save_mcp_server', { type: values.transport.type })
      return props.onSave(getConfigFromFormValues(values))
    } catch (error) {
      setTestingResult({ config: props.config, error: error as Error, tools: [] })
    }
  }

  const handleToolEnabledChange = (name: string, enabled: boolean) => {
    const disabledTools = new Set(form.getValues().disabledTools ?? [])
    if (enabled) disabledTools.delete(name)
    else disabledTools.add(name)
    form.setFieldValue('disabledTools', [...disabledTools])
  }

  return (
    <form ref={formRef} onSubmit={form.onSubmit(handleSubmit)}>
      <Stack gap="md">
        <TextInput label={t('Name')} data-autofocus required {...form.getInputProps('name')} />
        <PasswordInput
          label="URL"
          required
          placeholder="https://..."
          visibilityToggleButtonProps={{ 'aria-label': t('Show') }}
          {...form.getInputProps('transport.url')}
        />
        <Textarea
          label="HTTP Header"
          placeholder="NAME=VALUE"
          autosize
          minRows={3}
          rightSection={
            <ActionIcon
              variant="subtle"
              aria-label={showHeaders ? t('Hide') : t('Show')}
              onClick={() => setShowHeaders((visible) => !visible)}
            >
              {showHeaders ? <IconEyeOff size={16} /> : <IconEye size={16} />}
            </ActionIcon>
          }
          styles={{
            input: {
              WebkitTextSecurity: showHeaders ? 'none' : 'disc',
            } as CSSProperties,
          }}
          {...form.getInputProps('transport.headers')}
        />
        <Group justify="space-between">
          {props.mode === 'edit' ? (
            <Anchor c="chatbox-error" onClick={() => props.onDelete(props.config.id)}>
              {t('Delete')}
            </Anchor>
          ) : (
            <Text />
          )}
          <Group justify="flex-end" gap="sm">
            {testing && (
              <Button variant="subtle" color="red" onClick={() => testingAbortController.current?.abort()}>
                {t('Cancel')}
              </Button>
            )}
            <Button variant="outline" onClick={testConnection} loading={testing} disabled={testing}>
              {t('Test')}
            </Button>
            {props.mode === 'edit' || testingResult ? (
              <Button type="submit">{t('Save')}</Button>
            ) : (
              <Tooltip label={t('Please test before saving')} withArrow zIndex={3000}>
                <Button data-disabled type="submit" onClick={(e) => e.preventDefault()}>
                  {t('Save')}
                </Button>
              </Tooltip>
            )}
          </Group>
        </Group>
        {testingResult && (
          <TestingResult
            result={testingResult}
            disabledTools={form.values.disabledTools ?? []}
            onToolEnabledChange={handleToolEnabledChange}
          />
        )}
      </Stack>
    </form>
  )
}

interface Props {
  mode?: 'add' | 'edit'
  config: MCPServerConfig | null
  onClose: () => void
  onSave: (config: MCPServerConfig) => void
  onDelete: (id: string) => void
}

export const ConfigModal: FC<Props> = (props) => {
  const { t } = useTranslation()
  return (
    <AdaptiveModal
      size="lg"
      opened={!!props.config}
      onClose={props.onClose}
      title={props.mode === 'edit' ? t('Edit MCP Server') : t('Add MCP Server')}
      centered
      overlayProps={{ backgroundOpacity: 0.35, blur: 7 }}
    >
      {props.mode && props.config && (
        <ConfigForm mode={props.mode} config={props.config} onSave={props.onSave} onDelete={props.onDelete} />
      )}
    </AdaptiveModal>
  )
}
