import { Button, Flex, PasswordInput, Stack, Text, Title } from '@mantine/core'
import { IconCheck, IconX } from '@tabler/icons-react'
import { createFileRoute } from '@tanstack/react-router'
import { ofetch } from 'ofetch'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AdaptiveSelect } from '@/components/AdaptiveSelect'
import { PROVIDERS_WITH_PARSE_LINK } from '@/packages/web-search'
import { BochaSearch } from '@/packages/web-search/bocha'
import { WEB_SEARCH_PROVIDERS } from '@/packages/web-search/constants'
import platform from '@/platform'
import { useSettingsStore } from '@/stores/settingsStore'

export const Route = createFileRoute('/settings/web-search')({
  component: RouteComponent,
})

export function RouteComponent() {
  const { t } = useTranslation()
  const setSettings = useSettingsStore((state) => state.setSettings)
  const extension = useSettingsStore((state) => state.extension)

  const [checkingBocha, setCheckingBocha] = useState(false)
  const [bochaAvailable, setBochaAvailable] = useState<boolean>()
  const checkBocha = async () => {
    if (extension.webSearch.bochaApiKey) {
      setCheckingBocha(true)
      setBochaAvailable(undefined)
      try {
        await new BochaSearch(extension.webSearch.bochaApiKey).search('Chatbox')
        setBochaAvailable(true)
      } catch (e) {
        setBochaAvailable(false)
      } finally {
        setCheckingBocha(false)
      }
    }
  }

  const [checkingTavily, setCheckingTavily] = useState(false)
  const [tavilyAvaliable, setTavilyAvaliable] = useState<boolean>()
  const checkTavily = async () => {
    if (extension.webSearch.tavilyApiKey) {
      setCheckingTavily(true)
      setTavilyAvaliable(undefined)
      try {
        await ofetch('https://api.tavily.com/search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${extension.webSearch.tavilyApiKey}`,
          },
          body: {
            query: 'Chatbox',
            search_depth: 'basic',
            include_domains: [],
            exclude_domains: [],
          },
        })
        setTavilyAvaliable(true)
      } catch (e) {
        setTavilyAvaliable(false)
      } finally {
        setCheckingTavily(false)
      }
    }
  }

  return (
    <Stack p="md" gap="xxl">
      <Title order={5}>{t('Web Search')}</Title>

      <AdaptiveSelect
        comboboxProps={{ withinPortal: true, withArrow: true }}
        data={WEB_SEARCH_PROVIDERS.map((p) => ({ value: p.value, label: p.label }))}
        value={extension.webSearch.provider}
        onChange={(e) =>
          e &&
          setSettings({
            extension: {
              ...extension,
              webSearch: {
                ...extension.webSearch,
                provider: e as 'tavily' | 'bocha',
              },
            },
          })
        }
        label={t('Search Provider')}
        maw={320}
      />
      <Stack gap={4}>
        <Text size="xs" c="chatbox-gray">
          {t('Provided tools')}
        </Text>
        {(() => {
          const supportsParseLink = PROVIDERS_WITH_PARSE_LINK.has(extension.webSearch.provider)
          const tools: { label: string; supported: boolean }[] = [
            { label: t('Web Search'), supported: true },
            { label: t('Read Webpage'), supported: supportsParseLink },
          ]
          return tools.map(({ label, supported }) => (
            <Flex key={label} align="center" gap="xs">
              {supported ? (
                <IconCheck size={14} color="var(--mantine-color-chatbox-success-6)" />
              ) : (
                <IconX size={14} color="var(--mantine-color-chatbox-gray-5)" />
              )}
              <Text size="xs" c={supported ? undefined : 'chatbox-gray'}>
                {label}
              </Text>
            </Flex>
          ))
        })()}
      </Stack>
      {/* Tavily API Key */}
      {extension.webSearch.provider === 'tavily' && (
        <Stack gap="xs">
          <Text fw="600">{t('Tavily API Key')}</Text>
          <Flex align="center" gap="xs">
            <PasswordInput
              flex={1}
              maw={320}
              value={extension.webSearch.tavilyApiKey}
              onChange={(e) => {
                setTavilyAvaliable(undefined)
                setSettings({
                  extension: {
                    ...extension,
                    webSearch: {
                      ...extension.webSearch,
                      tavilyApiKey: e.currentTarget.value,
                    },
                  },
                })
              }}
              error={tavilyAvaliable === false}
            />
            <Button
              color="blue"
              variant="light"
              onClick={checkTavily}
              loading={checkingTavily}
              disabled={!extension.webSearch.tavilyApiKey?.trim()}
            >
              {t('Check')}
            </Button>
          </Flex>

          {typeof tavilyAvaliable === 'boolean' ? (
            tavilyAvaliable ? (
              <Text size="xs" c="chatbox-success">
                {t('Connection successful!')}
              </Text>
            ) : (
              <Text size="xs" c="chatbox-error">
                {t('API key invalid!')}
              </Text>
            )
          ) : null}
          <Button
            variant="transparent"
            size="compact-xs"
            px={0}
            className="self-start"
            onClick={() => platform.openLink('https://app.tavily.com?utm_source=chatbox')}
          >
            {t('Get API Key')}
          </Button>
        </Stack>
      )}
      {/* BoCha API Key */}
      {extension.webSearch.provider === 'bocha' && (
        <Stack gap="xs">
          <Text fw="600">{t('BoCha API Key')}</Text>
          <Flex align="center" gap="xs">
            <PasswordInput
              flex={1}
              maw={320}
              value={extension.webSearch.bochaApiKey}
              onChange={(e) => {
                setBochaAvailable(undefined)
                setSettings({
                  extension: {
                    ...extension,
                    webSearch: {
                      ...extension.webSearch,
                      bochaApiKey: e.currentTarget.value,
                    },
                  },
                })
              }}
              error={bochaAvailable === false}
            />
            <Button
              color="blue"
              variant="light"
              onClick={checkBocha}
              loading={checkingBocha}
              disabled={!extension.webSearch.bochaApiKey?.trim()}
            >
              {t('Check')}
            </Button>
          </Flex>

          {typeof bochaAvailable === 'boolean' ? (
            bochaAvailable ? (
              <Text size="xs" c="chatbox-success">
                {t('Connection successful!')}
              </Text>
            ) : (
              <Text size="xs" c="chatbox-error">
                {t('API key invalid!')}
              </Text>
            )
          ) : null}
          <Button
            variant="transparent"
            size="compact-xs"
            px={0}
            className="self-start"
            onClick={() => platform.openLink('https://open.bochaai.com')}
          >
            {t('Get API Key')}
          </Button>
        </Stack>
      )}
    </Stack>
  )
}
