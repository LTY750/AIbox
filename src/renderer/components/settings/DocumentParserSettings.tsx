import { Button, Flex, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core'
import type { DocumentParserType } from '@shared/types/settings'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AdaptiveSelect } from '@/components/AdaptiveSelect'
import platform from '@/platform'
import type { PlatformType } from '@/platform/interfaces'
import { getPlatformDefaultDocumentParser, useSettingsStore } from '@/stores/settingsStore'

const ALL_PARSER_OPTIONS: {
  value: DocumentParserType
  label: string
  desktopOnly?: boolean
  platforms?: PlatformType[]
}[] = [
  { value: 'local', label: 'Local', desktopOnly: true }, // Only available on desktop
  { value: 'llamaparse', label: 'LlamaParse' },
  { value: 'mineru', label: 'MinerU', platforms: ['desktop', 'mobile'] },
  { value: 'textin', label: 'TextIn XParse', platforms: ['desktop', 'mobile'] },
  { value: 'doc2x', label: 'Doc2X (PDF)' },
]

const PARSER_DESCRIPTIONS: Record<DocumentParserType, string> = {
  none: 'Uses local parsing first and LlamaParse for files the device cannot read.',
  local:
    'Uses built-in document parsing feature, supports common file types. Free usage, no compute points will be consumed.',
  llamaparse:
    'Tries local parsing first. If local parsing fails, LlamaParse will parse PDF, Office and other document formats.',
  'chatbox-ai': 'Legacy setting. It is migrated to local-first parsing with LlamaParse.',
  mineru: 'Third-party cloud parsing service, supports PDF and most Office files. Requires API token.',
  textin:
    'TextIn XParse converts PDF, Office, images and other documents to structured Markdown. Requires an App ID and Secret Code.',
  doc2x: 'Doc2X converts PDF files to Markdown. Requires an API key. Other Office formats are not supported.',
}

interface DocumentParserSettingsProps {
  showTitle?: boolean
}

export function DocumentParserSettings({ showTitle = true }: DocumentParserSettingsProps) {
  const { t } = useTranslation()

  const extension = useSettingsStore((state) => state.extension)
  const setSettings = useSettingsStore((state) => state.setSettings)

  const documentParser = extension?.documentParser
  const mineruToken = documentParser?.mineru?.apiToken || ''
  const llamaParseToken = documentParser?.llamaParse?.apiKey || ''
  const textinAppId = documentParser?.textin?.appId || ''
  const textinSecretCode = documentParser?.textin?.secretCode || ''
  const doc2xApiKey = documentParser?.doc2x?.apiKey || ''

  const [testingConnection, setTestingConnection] = useState(false)
  const [connectionResult, setConnectionResult] = useState<boolean | undefined>()

  const parserOptions = useMemo(() => {
    const isDesktop = platform.type === 'desktop'
    return ALL_PARSER_OPTIONS.filter((opt) => {
      if (opt.desktopOnly && !isDesktop) return false
      if (opt.platforms && !opt.platforms.includes(platform.type)) return false
      return true
    })
  }, [])

  const storedParserType = documentParser?.type || getPlatformDefaultDocumentParser().type
  const currentParserType =
    storedParserType === 'none' || storedParserType === 'chatbox-ai' ? 'llamaparse' : storedParserType

  const handleParserTypeChange = useCallback(
    (value: string | null) => {
      if (!value) return
      setSettings({
        extension: {
          ...extension,
          documentParser: {
            ...documentParser,
            type: value as DocumentParserType,
          },
        },
      })
      setConnectionResult(undefined)
    },
    [setSettings, extension, documentParser]
  )

  const handleMineruTokenChange = useCallback(
    (value: string) => {
      setConnectionResult(undefined)
      setSettings({
        extension: {
          ...extension,
          documentParser: {
            ...documentParser,
            type: documentParser?.type || 'mineru',
            mineru: { apiToken: value },
          },
        },
      })
    },
    [setSettings, extension, documentParser]
  )

  const handleLlamaParseTokenChange = useCallback(
    (value: string) => {
      setSettings({
        extension: {
          ...extension,
          documentParser: {
            ...documentParser,
            type: 'llamaparse',
            llamaParse: { apiKey: value },
          },
        },
      })
    },
    [setSettings, extension, documentParser]
  )

  const handleTextinCredentialsChange = useCallback(
    (credentials: { appId?: string; secretCode?: string }) => {
      setSettings({
        extension: {
          ...extension,
          documentParser: {
            ...documentParser,
            type: 'textin',
            textin: {
              appId: credentials.appId ?? textinAppId,
              secretCode: credentials.secretCode ?? textinSecretCode,
            },
          },
        },
      })
    },
    [setSettings, extension, documentParser, textinAppId, textinSecretCode]
  )

  const handleDoc2xApiKeyChange = useCallback(
    (value: string) => {
      setSettings({
        extension: {
          ...extension,
          documentParser: {
            ...documentParser,
            type: 'doc2x',
            doc2x: { apiKey: value },
          },
        },
      })
    },
    [setSettings, extension, documentParser]
  )

  const handleTestConnection = useCallback(async () => {
    if (!mineruToken.trim()) return

    setTestingConnection(true)
    setConnectionResult(undefined)

    try {
      const result = platform.testMineruConnection
        ? await platform.testMineruConnection(mineruToken)
        : await platform.getKnowledgeBaseController().testMineruConnection(mineruToken)
      setConnectionResult(result.success)
    } catch {
      setConnectionResult(false)
    } finally {
      setTestingConnection(false)
    }
  }, [mineruToken])

  return (
    <Stack p="md" gap="xxl">
      {showTitle && <Title order={5}>{t('Document Parser')}</Title>}

      <AdaptiveSelect
        comboboxProps={{ withinPortal: true, withArrow: true }}
        data={parserOptions.map((opt) => ({
          value: opt.value,
          label: t(opt.label),
        }))}
        value={currentParserType}
        onChange={handleParserTypeChange}
        label={t('Parser Type')}
        maw={320}
      />

      <Text size="xs" c="chatbox-gray">
        {t(PARSER_DESCRIPTIONS[currentParserType])}
      </Text>

      {currentParserType === 'mineru' && (
        <Stack gap="xs">
          <Text fw="600">{t('MinerU API Token')}</Text>
          <Flex align="center" gap="xs">
            <PasswordInput
              flex={1}
              maw={320}
              value={mineruToken}
              onChange={(e) => handleMineruTokenChange(e.currentTarget.value)}
              error={connectionResult === false}
            />
            <Button
              color="blue"
              variant="light"
              onClick={handleTestConnection}
              loading={testingConnection}
              disabled={!mineruToken.trim()}
            >
              {t('Check')}
            </Button>
          </Flex>

          {typeof connectionResult === 'boolean' ? (
            connectionResult ? (
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
            onClick={() => platform.openLink('https://mineru.net/apiManage')}
          >
            {t('Get API Token')}
          </Button>
        </Stack>
      )}

      {currentParserType === 'llamaparse' && (
        <Stack gap="xs">
          <Text fw="600">{t('LlamaParse API Key')}</Text>
          <PasswordInput
            maw={320}
            value={llamaParseToken}
            onChange={(e) => handleLlamaParseTokenChange(e.currentTarget.value)}
            placeholder={t('Enter your LlamaParse API Key') || 'Enter your LlamaParse API Key'}
          />
          <Button
            variant="transparent"
            size="compact-xs"
            px={0}
            className="self-start"
            onClick={() => platform.openLink('https://cloud.llamaindex.ai')}
          >
            {t('Get API Key')}
          </Button>
        </Stack>
      )}

      {currentParserType === 'textin' && (
        <Stack gap="xs">
          <Text fw="600">{t('TextIn Credentials')}</Text>
          <TextInput
            maw={320}
            label={t('TextIn App ID')}
            value={textinAppId}
            onChange={(e) => handleTextinCredentialsChange({ appId: e.currentTarget.value })}
          />
          <PasswordInput
            maw={320}
            label={t('TextIn Secret Code')}
            value={textinSecretCode}
            onChange={(e) => handleTextinCredentialsChange({ secretCode: e.currentTarget.value })}
          />
          <Button
            variant="transparent"
            size="compact-xs"
            px={0}
            className="self-start"
            onClick={() => platform.openLink('https://www.textin.com/console/dashboard/setting')}
          >
            {t('Get API Credentials')}
          </Button>
        </Stack>
      )}

      {currentParserType === 'doc2x' && (
        <Stack gap="xs">
          <Text fw="600">{t('Doc2X API Key')}</Text>
          <PasswordInput
            maw={320}
            value={doc2xApiKey}
            onChange={(e) => handleDoc2xApiKeyChange(e.currentTarget.value)}
          />
          <Button
            variant="transparent"
            size="compact-xs"
            px={0}
            className="self-start"
            onClick={() => platform.openLink('https://open.noedgeai.com')}
          >
            {t('Get API Key')}
          </Button>
        </Stack>
      )}
    </Stack>
  )
}

export default DocumentParserSettings
