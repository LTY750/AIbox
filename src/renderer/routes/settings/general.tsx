import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Checkbox,
  Divider,
  FileButton,
  Flex,
  Radio,
  SegmentedControl,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import {
  DEFAULT_INTERFACE_FONT_FAMILY,
  getDefaultInterfaceColors,
  INTERFACE_COLOR_PRESETS,
  INTERFACE_FONT_FAMILY_OPTIONS,
  type InterfaceColorPreset,
  resolveInterfaceBrandColor,
  resolveInterfaceBrandColors,
  withColorOpacity,
} from '@shared/theme-colors'
import { type Language, Theme } from '@shared/types'
import { formatFileSize } from '@shared/utils'
import { getBackupFilename } from '@shared/utils/backup'
import {
  IconAdjustmentsHorizontal,
  IconChevronRight,
  IconDeviceFloppy,
  IconDeviceMobileVibration,
  IconHome,
  IconInfoCircle,
  IconPalette,
  IconPencil,
  IconWorld,
} from '@tabler/icons-react'
import { createFileRoute, Link } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AdaptiveSelect } from '@/components/AdaptiveSelect'
import { AdaptiveModal } from '@/components/common/AdaptiveModal'
import { SettingsSection } from '@/components/settings/SettingsSection'
import { languageNameMap, languages } from '@/i18n/locales'
import {
  type BackupExportItem,
  type BackupProgress,
  type BackupWarning,
  exportBackupArchive,
  importBackupArchive,
  importLegacyJsonBackup,
  isZipBackupFile,
  rehydrateImportedSession,
} from '@/packages/backup'
import platform from '@/platform'
import { canShareFile, shareFile } from '@/platform/web_file_share'
import storage from '@/storage'
import { getMetaStorage, recoverSessionList } from '@/stores/chatStore'
import { migrateOnData } from '@/stores/migration'
import { useSettingsStore } from '@/stores/settingsStore'
import { useUIStore } from '@/stores/uiStore'

export const Route = createFileRoute('/settings/general')({
  component: RouteComponent,
})

const presetBadgeButtonClassName =
  'transition-transform duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97] motion-reduce:transform-none motion-reduce:transition-none'

export function RouteComponent() {
  const { t } = useTranslation()
  const { setSettings, ...settings } = useSettingsStore((state) => state)
  const realTheme = useUIStore((state) => state.realTheme)
  const interfaceFontFamily = settings.interfaceFontFamily ?? DEFAULT_INTERFACE_FONT_FAMILY
  const storedInterfaceColors = (settings.interfaceColors ?? getDefaultInterfaceColors())[realTheme]
  const currentInterfaceColors = {
    ...storedInterfaceColors,
    brand: resolveInterfaceBrandColor(storedInterfaceColors.brand, realTheme),
  }
  const [isEditingInterfaceColorPresets, setIsEditingInterfaceColorPresets] = useState(false)
  const [isEditingProxy, setIsEditingProxy] = useState(false)
  const [draftProxy, setDraftProxy] = useState(settings.proxy ?? '')

  const applyInterfacePreset = (preset: InterfaceColorPreset) => {
    setSettings({
      interfaceColors: resolveInterfaceBrandColors(preset.colors),
      interfaceFontFamily: preset.fontFamily ?? DEFAULT_INTERFACE_FONT_FAMILY,
    })
  }

  const colorPresets = [
    ...INTERFACE_COLOR_PRESETS.map((preset) => ({
      ...preset,
      colors: resolveInterfaceBrandColors(preset.colors),
      isCustom: false,
    })),
    ...(settings.interfaceColorPresets ?? []).map((preset) => ({
      ...preset,
      colors: resolveInterfaceBrandColors(preset.colors),
      isCustom: true,
    })),
  ] satisfies Array<InterfaceColorPreset & { isCustom: boolean }>

  const themeLabel =
    settings.theme === Theme.Light
      ? t('Light Mode')
      : settings.theme === Theme.Dark
        ? t('Dark Mode')
        : t('Follow System')
  const fontFamilyLabel = t(
    INTERFACE_FONT_FAMILY_OPTIONS.find((option) => option.value === interfaceFontFamily)?.label ?? ''
  )
  const activePreset = colorPresets.find(
    (preset) =>
      preset.colors[realTheme].brand === currentInterfaceColors.brand && preset.fontFamily === interfaceFontFamily
  )
  const colorPresetLabel = activePreset
    ? activePreset.isCustom
      ? activePreset.label
      : t(activePreset.label)
    : t('Custom')

  return (
    <Stack
      p={{ base: 0, sm: 'md' }}
      gap="lg"
      className="settings-page settings-mobile-page mx-auto w-full max-w-[760px]"
    >
      <MobileSettingGroup title={t('Display and Typography')} className="settings-section--primary">
        <MobileSelectRow
          icon={<IconWorld size={16} />}
          iconClassName="settings-row-icon--display"
          label={t('Language')}
          value={languageNameMap[settings.language]}
        >
          <AdaptiveSelect
            aria-label={String(t('Language'))}
            className="settings-mobile-select-trigger"
            value={settings.language}
            data={languages.map((language) => ({ value: language, label: languageNameMap[language] }))}
            onChange={(val) => val && setSettings({ language: val as Language })}
          />
        </MobileSelectRow>
        <MobileSelectRow
          icon={<IconPalette size={16} />}
          iconClassName="settings-row-icon--display-secondary"
          label={t('Font Family')}
          value={fontFamilyLabel}
        >
          <AdaptiveSelect
            aria-label={String(t('Font Family'))}
            className="settings-mobile-select-trigger"
            data={INTERFACE_FONT_FAMILY_OPTIONS.map((option) => ({ value: option.value, label: t(option.label) }))}
            value={interfaceFontFamily}
            onChange={(val) => val && setSettings({ interfaceFontFamily: val as typeof interfaceFontFamily })}
          />
        </MobileSelectRow>
        <MobileSelectRow
          icon={<IconAdjustmentsHorizontal size={16} />}
          iconClassName="settings-row-icon--display-secondary"
          label={t('Theme')}
          value={themeLabel}
        >
          <AdaptiveSelect
            aria-label={String(t('Theme'))}
            className="settings-mobile-select-trigger"
            data={[
              { value: `${Theme.System}`, label: t('Follow System') },
              { value: `${Theme.Light}`, label: t('Light Mode') },
              { value: `${Theme.Dark}`, label: t('Dark Mode') },
            ]}
            value={`${settings.theme}`}
            onChange={(val) => val && setSettings({ theme: parseInt(val) })}
          />
        </MobileSelectRow>
        <MobileSettingField
          icon={<IconPalette size={16} />}
          iconClassName="settings-row-icon--accent"
          label={t('Color Presets')}
          inline
          className="settings-row--interactive"
          onClick={() => setIsEditingInterfaceColorPresets((value) => !value)}
        >
          <Text size="sm" c="chatbox-tertiary" className="settings-mobile-summary">
            {colorPresetLabel}
          </Text>
        </MobileSettingField>
        {isEditingInterfaceColorPresets && (
          <Box className="settings-inline-detail">
            <Flex gap="xs" wrap="wrap">
              {colorPresets.map((preset) => (
                <Badge
                  key={preset.id}
                  component="button"
                  type="button"
                  className={presetBadgeButtonClassName}
                  variant="filled"
                  style={{ backgroundColor: withColorOpacity(preset.colors[realTheme].brand, 0.6), cursor: 'pointer' }}
                  onClick={() => applyInterfacePreset(preset)}
                >
                  {preset.isCustom ? preset.label : t(preset.label)}
                </Badge>
              ))}
            </Flex>
          </Box>
        )}
      </MobileSettingGroup>
      <MobileSettingGroup title={t('Interface')}>
        <Link to="/settings/font-size" className="settings-row settings-data-entry no-underline">
          <Flex align="center" gap="sm" className="w-full">
            <Box className="settings-row-icon settings-row-icon--display flex shrink-0 items-center">
              <IconAdjustmentsHorizontal size={16} />
            </Box>
            <Box className="min-w-0 flex-1">
              <Text size="sm" fw={500}>
                {t('Font Size')}
              </Text>
              <Text size="xs" c="chatbox-tertiary" className="settings-data-entry__summary">
                {settings.fontSize}px
              </Text>
            </Box>
            <IconChevronRight size={18} className="settings-row-chevron shrink-0" />
          </Flex>
        </Link>
        <MobileSettingField
          icon={<IconHome size={16} />}
          iconClassName="settings-row-icon--behavior"
          label={t('Startup Page')}
          inline
        >
          <SegmentedControl
            aria-label={String(t('Startup Page'))}
            className="settings-mobile-segmented"
            value={settings.startupPage}
            onChange={(val) => (val === 'home' || val === 'session') && setSettings({ startupPage: val })}
            data={[
              { label: t('Home Page'), value: 'home' },
              { label: t('Last Session'), value: 'session' },
            ]}
          />
        </MobileSettingField>
        {platform.type === 'mobile' && (
          <>
            <MobileSettingField
              icon={<IconDeviceMobileVibration size={16} />}
              iconClassName="settings-row-icon--behavior"
              label={t('Haptic feedback during generation')}
              inline
            >
              <Switch
                aria-label={String(t('Haptic feedback during generation'))}
                checked={settings.enableHapticFeedback !== false}
                onChange={(e) => setSettings({ enableHapticFeedback: e.currentTarget.checked })}
              />
            </MobileSettingField>
            {settings.enableHapticFeedback !== false && (
              <MobileSettingField
                icon={<IconDeviceMobileVibration size={16} />}
                iconClassName="settings-row-icon--behavior"
                label={t('Vibration intensity')}
                inline
              >
                <Radio.Group
                  aria-label={String(t('Vibration intensity'))}
                  value={settings.hapticIntensity || 'medium'}
                  onChange={(val) =>
                    (val === 'light' || val === 'medium' || val === 'strong') && setSettings({ hapticIntensity: val })
                  }
                >
                  <Flex gap="sm" wrap="wrap" className="settings-mobile-radio-group">
                    <Radio label={t('Light')} value="light" />
                    <Radio label={t('Medium')} value="medium" />
                    <Radio label={t('Strong')} value="strong" />
                  </Flex>
                </Radio.Group>
              </MobileSettingField>
            )}
          </>
        )}
      </MobileSettingGroup>
      <MobileSettingGroup title={t('Network Proxy')}>
        <MobileSettingField
          icon={<IconWorld size={16} />}
          label={t('Network Proxy')}
          inline
          iconClassName="settings-row-icon--network"
        >
          <Text size="sm" c="chatbox-tertiary" className="settings-mobile-summary">
            {settings.proxy ? t('Configured') : t('Not configured')}
          </Text>
          <ActionIcon
            variant="subtle"
            size="lg"
            aria-label={String(t('Edit'))}
            onClick={() => {
              setDraftProxy(settings.proxy ?? '')
              setIsEditingProxy(true)
            }}
          >
            <IconPencil size={18} />
          </ActionIcon>
        </MobileSettingField>
      </MobileSettingGroup>
      <AdaptiveModal
        opened={isEditingProxy}
        onClose={() => setIsEditingProxy(false)}
        title={t('Network Proxy')}
        size="md"
      >
        <Stack gap="sm">
          <TextInput
            autoFocus
            aria-label={String(t('Proxy Address'))}
            label={t('Proxy Address')}
            placeholder="socks5://127.0.0.1:6153"
            value={draftProxy}
            onChange={(e) => setDraftProxy(e.currentTarget.value)}
          />
          {platform.type === 'mobile' && (
            <Alert color="yellow" variant="light">
              {t(
                'Android currently sends requests through its native network transport and does not apply this proxy setting.'
              )}
            </Alert>
          )}
          <AdaptiveModal.Actions>
            <Button variant="default" onClick={() => setIsEditingProxy(false)}>
              {t('Cancel')}
            </Button>
            <Button
              onClick={() => {
                setSettings({ proxy: draftProxy.trim() || undefined })
                setIsEditingProxy(false)
              }}
            >
              {t('Save')}
            </Button>
          </AdaptiveModal.Actions>
        </Stack>
      </AdaptiveModal>
      <MobileSettingGroup title={t('Data')}>
        <Link to="/settings/data" className="settings-row settings-data-entry no-underline">
          <Flex align="center" gap="sm" className="w-full">
            <Box className="settings-row-icon flex shrink-0 items-center">
              <IconDeviceFloppy size={16} />
            </Box>
            <Box className="min-w-0 flex-1">
              <Text size="sm" fw={500}>
                {t('Data')}
              </Text>
              <Text size="xs" c="chatbox-tertiary" className="settings-data-entry__summary">
                {t('Manage recovery, backup, and diagnostic data')}
              </Text>
            </Box>
            <IconChevronRight size={18} className="settings-row-chevron shrink-0" />
          </Flex>
        </Link>
      </MobileSettingGroup>
      {platform.type === 'desktop' && (
        <MobileSettingGroup title={t('System')}>
          <Stack gap="sm">
            <Switch
              label={t('Launch at system startup')}
              checked={settings.autoLaunch}
              onChange={(e) => setSettings({ autoLaunch: e.currentTarget.checked })}
            />
            <Switch
              label={t('Automatic updates')}
              checked={settings.autoUpdate}
              onChange={(e) => setSettings({ autoUpdate: e.currentTarget.checked })}
            />
            <Switch
              label={t('Beta updates')}
              checked={settings.betaUpdate}
              onChange={(e) => setSettings({ betaUpdate: e.currentTarget.checked })}
            />
          </Stack>
        </MobileSettingGroup>
      )}
    </Stack>
  )
}
const MobileSelectRow = ({
  icon,
  iconClassName,
  label,
  value,
  children,
}: {
  icon: ReactNode
  iconClassName?: string
  label: string
  value: string
  children: ReactNode
}) => (
  <MobileSettingField icon={icon} iconClassName={iconClassName} label={label} inline>
    <Text size="sm" c="chatbox-tertiary" className="settings-mobile-summary">
      {value}
    </Text>
    <IconChevronRight size={18} className="settings-row-chevron shrink-0" aria-hidden="true" />
    <Box className="settings-mobile-control">{children}</Box>
  </MobileSettingField>
)
const MobileSettingGroup = SettingsSection

const MobileSettingField = ({
  icon,
  label,
  children,
  inline = false,
  variant,
  compactData = false,
  iconClassName,
  className,
  onClick,
}: {
  icon: ReactNode
  label: string
  children: ReactNode
  inline?: boolean
  variant?: 'data'
  compactData?: boolean
  iconClassName?: string
  className?: string
  onClick?: () => void
}) => (
  <Box
    className={`settings-row ${variant === 'data' ? 'settings-row--data' : ''} ${compactData ? 'settings-row--data-compact' : ''} ${className ?? ''} border-b border-solid border-chatbox-border-primary last:border-b-0`}
    onClick={onClick}
    role={onClick ? 'button' : undefined}
    tabIndex={onClick ? 0 : undefined}
    onKeyDown={
      onClick
        ? (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              onClick()
            }
          }
        : undefined
    }
  >
    <Flex
      align={inline ? 'center' : 'flex-start'}
      justify="space-between"
      gap="md"
      wrap={inline ? 'wrap' : undefined}
      className={variant === 'data' ? 'settings-data-row' : undefined}
    >
      <Flex align="center" gap="sm" className="min-w-0">
        <Box className={`settings-row-icon flex shrink-0 items-center ${iconClassName ?? ''}`}>{icon}</Box>
        <Text size="sm" fw={500}>
          {label}
        </Text>
      </Flex>
      <Box className={inline ? 'flex min-w-0 flex-1 items-center justify-end gap-3' : 'w-full'}>{children}</Box>
    </Flex>
  </Box>
)

export const DataRecoverySection = ({ showTitle = true }: { showTitle?: boolean }) => {
  const { t } = useTranslation()
  const [isRecovering, setIsRecovering] = useState(false)
  const [recoveryResult, setRecoveryResult] = useState<{
    success: boolean
    recovered?: number
    failed?: number
    error?: string
  } | null>(null)

  const handleRecover = async () => {
    setIsRecovering(true)
    setRecoveryResult(null)
    try {
      const result = await recoverSessionList()
      setRecoveryResult({ success: true, recovered: result.recovered, failed: result.failed })
    } catch (error) {
      console.error('Failed to recover session list:', error)
      setRecoveryResult({ success: false, error: String(error) })
    } finally {
      setIsRecovering(false)
    }
  }

  const hasPartialFailure = recoveryResult?.success && recoveryResult.failed && recoveryResult.failed > 0

  return (
    <Stack gap="md">
      {showTitle ? (
        <Stack gap="xxs">
          <Title order={5}>{t('Data Recovery')}</Title>
          <Text c="chatbox-tertiary">
            {t('If conversations are missing from the list, use this feature to scan and recover them from storage')}
          </Text>
        </Stack>
      ) : (
        <Text c="chatbox-tertiary">
          {t('If conversations are missing from the list, use this feature to scan and recover them from storage')}
        </Text>
      )}
      <Button className="self-start" onClick={handleRecover} disabled={isRecovering} loading={isRecovering}>
        {isRecovering ? t('Recovering...') : t('Recover Conversation List')}
      </Button>
      {recoveryResult && (
        <Alert
          className="self-start"
          variant="light"
          color={recoveryResult.success ? (hasPartialFailure ? 'yellow' : 'green') : 'red'}
          title={
            recoveryResult.success
              ? t('Recovered {{count}} conversations', { count: recoveryResult.recovered })
              : t('Recovery failed')
          }
          icon={<IconInfoCircle />}
        >
          {recoveryResult.success ? (
            <Stack gap="xs">
              <Text size="sm">{t('The conversation list has been successfully recovered')}</Text>
              {hasPartialFailure && (
                <Text size="sm" c="orange">
                  {t('{{count}} conversations could not be recovered due to data read errors', {
                    count: recoveryResult.failed,
                  })}
                </Text>
              )}
            </Stack>
          ) : (
            <Text size="sm">{recoveryResult.error || t('Unknown error')}</Text>
          )}
        </Alert>
      )}
    </Stack>
  )
}

export const ImportExportDataSection = () => {
  const { t } = useTranslation()

  const formatBackupWarning = (warning: BackupWarning) => {
    switch (warning.code) {
      case 'session-read-failed':
        return t('Conversation data could not be read and was not included.')
      case 'resource-read-failed':
        return t('Managed attachment or image data could not be read and was not included.')
      case 'external-resource-skipped':
        return t('The original external file is not managed by Chatbox and was not included.')
      case 'rag-rebuild-failed':
        return t('The attachment search index could not be restored.')
    }
  }

  const formatBackupProgressPhase = (phase: BackupProgress['phase']) => {
    switch (phase) {
      case 'preparing':
        return t('Preparing backup')
      case 'sessions':
        return t('Exporting conversations')
      case 'resources':
        return t('Exporting attachments')
      case 'packing':
        return t('Creating backup archive')
      case 'reading':
        return t('Reading backup')
      case 'validating':
        return t('Validating backup')
      case 'restoring':
        return t('Restoring data')
    }
  }

  const [importTips, setImportTips] = useState('')
  const [importDetails, setImportDetails] = useState('')
  const [importRequiresRestart, setImportRequiresRestart] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [progress, setProgress] = useState<BackupProgress | null>(null)
  const [exportNotice, setExportNotice] = useState<{
    color: 'green' | 'yellow' | 'red'
    title: string
    body?: string
  }>()
  const [pendingDownload, setPendingDownload] = useState<{ filename: string; blob: Blob }>()
  const [pendingDownloadUrl, setPendingDownloadUrl] = useState<string>()
  const operationAbortRef = useRef<AbortController | null>(null)
  const [exportItems, setExportItems] = useState<ExportDataItem[]>([
    ExportDataItem.Setting,
    ExportDataItem.Conversations,
    ExportDataItem.Copilot,
  ])

  const isLoading = isExporting || isImporting || importRequiresRestart
  const pendingDownloadFile = useMemo(
    () =>
      pendingDownload
        ? new File([pendingDownload.blob], pendingDownload.filename, {
            type: pendingDownload.blob.type,
          })
        : undefined,
    [pendingDownload]
  )
  const canSharePendingDownload = useMemo(() => {
    return pendingDownloadFile ? canShareFile(pendingDownloadFile) : false
  }, [pendingDownloadFile])

  useEffect(() => {
    if (!pendingDownload) {
      setPendingDownloadUrl(undefined)
      return
    }

    const url = URL.createObjectURL(pendingDownload.blob)
    setPendingDownloadUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [pendingDownload])

  const onSharePendingDownload = async () => {
    if (!pendingDownloadFile || !canSharePendingDownload) return
    try {
      await shareFile(pendingDownloadFile)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      console.error('Failed to share backup:', error)
    }
  }

  const onExport = async () => {
    if (isLoading) return

    const abortController = new AbortController()
    operationAbortRef.current = abortController
    setIsExporting(true)
    setProgress(null)
    setExportNotice(undefined)
    setPendingDownload(undefined)
    try {
      const date = new Date()
      const result = await exportBackupArchive({
        exportItems: exportItems.map((item) => item as BackupExportItem),
        includeKeys: exportItems.includes(ExportDataItem.Key),
        exportedAt: date,
        storage,
        metaStorage: getMetaStorage(),
        application: { version: platform.getVersion(), platform: platform.getPlatform() },
        signal: abortController.signal,
        onProgress: setProgress,
        writeArchive: (dataCallback) =>
          platform.exporter.exportStreamingFile(
            getBackupFilename(date),
            dataCallback,
            'application/zip',
            abortController.signal
          ),
      })
      const warningCount = result.manifest.warnings.length
      const warningSummary = result.manifest.warnings
        .slice(0, 3)
        .map((warning) => `${warning.itemId ? `${warning.itemId}: ` : ''}${formatBackupWarning(warning)}`)
        .join('\n')
      setPendingDownload(result.pendingDownload)
      const warningBody = [
        warningCount > 0
          ? String(
              t('{{count}} item(s) could not be included. See manifest.json in the backup for details.', {
                count: warningCount,
              })
            )
          : '',
        warningSummary,
        result.pendingDownload
          ? String(
              t(
                "Your backup was created in memory. Select Download, then confirm it appears in your browser's downloads."
              )
            )
          : !result.boundedMemory
            ? String(t('This browser does not support streaming downloads, so the backup was buffered before saving.'))
            : '',
      ]
        .filter(Boolean)
        .join('\n')
      setExportNotice(
        result.pendingDownload
          ? {
              color: warningCount > 0 ? 'yellow' : 'green',
              title: String(t('Backup ready to download')),
              body: warningBody,
            }
          : warningCount > 0 || !result.boundedMemory
            ? {
                color: 'yellow',
                title: String(t('Backup exported with warnings')),
                body: warningBody,
              }
            : { color: 'green', title: String(t('Backup exported successfully')) }
      )
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setExportNotice({ color: 'yellow', title: String(t('Export canceled')) })
      } else {
        console.error('Export failed:', error)
        setExportNotice({ color: 'red', title: String(t('Export failed')), body: String(error) })
      }
    } finally {
      operationAbortRef.current = null
      setIsExporting(false)
      setProgress(null)
    }
  }

  const onImport = async (file: File | null) => {
    if (isLoading || !file) return
    const abortController = new AbortController()
    operationAbortRef.current = abortController
    setIsImporting(true)
    setImportTips('')
    setImportDetails('')
    setImportRequiresRestart(false)
    setProgress(null)
    try {
      if (await isZipBackupFile(file)) {
        const result = await importBackupArchive(file, {
          storage,
          metaStorage: await getMetaStorage(),
          signal: abortController.signal,
          onProgress: setProgress,
          rehydrateSession: rehydrateImportedSession,
        })
        if (result.warnings.length > 0) {
          const warningSummary = result.warnings
            .slice(0, 3)
            .map((warning) => `${warning.itemId ? `${warning.itemId}: ` : ''}${formatBackupWarning(warning)}`)
            .join('\n')
          setImportTips(
            String(
              t(
                'Backup restore is almost complete, with {{count}} warning(s). Select Continue to restart Chatbox and finish restoring.',
                {
                  count: result.warnings.length,
                }
              )
            )
          )
          setImportDetails(warningSummary)
          setImportRequiresRestart(true)
          return
        }
      } else {
        await importLegacyJsonBackup(file, {
          storage,
          metaStorage: await getMetaStorage(),
          migrateData: (dataStore) => migrateOnData(dataStore, false),
          recoverSessionList: async () => {
            await recoverSessionList()
          },
        })
      }
      await platform.relaunch()
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') setImportTips(String(t('Import canceled')))
      else {
        console.error('Import failed:', error)
        setImportTips(
          String(
            t('Import failed: {{error}}', {
              error: error instanceof Error ? error.message : t('Unsupported or damaged backup'),
            })
          )
        )
      }
    } finally {
      operationAbortRef.current = null
      setIsImporting(false)
      setProgress(null)
    }
  }

  const cancelOperation = () => {
    operationAbortRef.current?.abort(new DOMException('Operation canceled', 'AbortError'))
  }

  const [showStorageInfo, setShowStorageInfo] = useState(false)
  const [storagePersisted, setStoragePersisted] = useState<boolean>()
  const [storageEstimate, setStorageEstimate] = useState<StorageEstimate>()
  const storageInfo = useMemo(
    () =>
      `Storage persisted: ${storagePersisted}; Storage Estimate: { quota: ${formatFileSize(storageEstimate?.quota || 0)}, usage: ${formatFileSize(storageEstimate?.usage || 0)} }`,
    [storagePersisted, storageEstimate]
  )
  useEffect(() => {
    if (window?.navigator?.storage) {
      window.navigator.storage.estimate?.().then((res) => setStorageEstimate(res))
      window.navigator.storage.persisted?.().then((p) => setStoragePersisted(p))
    }
  }, [])

  return (
    <>
      <Stack gap="md">
        <Title order={5} onDoubleClick={() => setShowStorageInfo(true)}>
          {t('Data Backup')}
        </Title>
        {showStorageInfo && (
          <Text size="xs" c="chatbox-tertiary">
            {storageInfo}
          </Text>
        )}
        <Text c="chatbox-tertiary">
          {t('ZIP backups include each conversation and its managed images and attachments.')}
        </Text>
        <Text size="sm" c="chatbox-tertiary">
          {t('Backup files exported here can only be imported in Chatbox 1.22 or later.')}
        </Text>
        {[
          { label: t('Settings'), value: ExportDataItem.Setting },
          { label: t('API KEY & License'), value: ExportDataItem.Key },
          { label: t('Chat History'), value: ExportDataItem.Conversations },
          { label: t('My Copilots'), value: ExportDataItem.Copilot },
        ].map(({ label, value }) => (
          <Checkbox
            key={value}
            checked={exportItems.includes(value)}
            label={label}
            disabled={isLoading}
            onChange={(e) => {
              const checked = e.currentTarget.checked
              if (checked && !exportItems.includes(value)) {
                setExportItems([...exportItems, value])
              } else if (!checked) {
                setExportItems(exportItems.filter((v) => v !== value))
              }
            }}
          />
        ))}
        <Flex gap="sm">
          <Button className="self-start" onClick={onExport} disabled={isLoading} loading={isExporting}>
            {isExporting ? t('Exporting...') : t('Export Selected Data')}
          </Button>
          {isExporting && (
            <Button variant="light" color="chatbox-gray" onClick={cancelOperation}>
              {t('Cancel')}
            </Button>
          )}
        </Flex>
        {progress && (
          <Text size="sm" c="chatbox-tertiary">
            {t('{{phase}}: {{current}} / {{total}}', {
              phase: formatBackupProgressPhase(progress.phase),
              current: progress.current,
              total: progress.total,
            })}
            {progress.label ? ` · ${progress.label}` : ''}
          </Text>
        )}
        {exportNotice && (
          <Alert
            className="self-start"
            variant="light"
            color={exportNotice.color}
            title={exportNotice.title}
            icon={<IconInfoCircle />}
          >
            {exportNotice.body && (
              <Text size="sm" style={{ whiteSpace: 'pre-line' }}>
                {exportNotice.body}
              </Text>
            )}
            {pendingDownload && pendingDownloadUrl && (
              <Flex gap="sm" mt="sm">
                {canSharePendingDownload && <Button onClick={onSharePendingDownload}>{t('Save')}</Button>}
                <Button
                  component="a"
                  variant={canSharePendingDownload ? 'light' : 'filled'}
                  href={pendingDownloadUrl}
                  download={pendingDownload.filename}
                >
                  {t('Download')}
                </Button>
              </Flex>
            )}
          </Alert>
        )}
      </Stack>

      <Divider />

      <Stack gap="lg">
        <Stack gap="xxs">
          <Title order={5}>{t('Data Restore')}</Title>
          <Text c="chatbox-tertiary">
            {t('Upon import, changes will take effect immediately and existing data will be overwritten')}
          </Text>
        </Stack>
        {importTips && (
          <Alert className=" self-start" variant="light" color="yellow" title={importTips} icon={<IconInfoCircle />}>
            {importDetails && (
              <Text size="sm" style={{ whiteSpace: 'pre-line' }}>
                {importDetails}
              </Text>
            )}
            {importRequiresRestart && (
              <Button mt="sm" variant="light" onClick={() => platform.relaunch()}>
                {t('Continue')}
              </Button>
            )}
          </Alert>
        )}
        <FileButton accept=".zip,.json,application/zip,application/json" onChange={onImport} disabled={isLoading}>
          {(props) => (
            <Flex gap="sm">
              <Button {...props} className="self-start" disabled={isLoading} loading={isImporting}>
                {isImporting ? t('Importing...') : t('Import and Restore')}
              </Button>
              {isImporting && (
                <Button variant="light" color="chatbox-gray" onClick={cancelOperation}>
                  {t('Cancel')}
                </Button>
              )}
            </Flex>
          )}
        </FileButton>
      </Stack>
    </>
  )
}

export enum ExportDataItem {
  Setting = 'setting',
  Key = 'key',
  Conversations = 'conversations',
  Copilot = 'copilot',
}

export const ExportLogsSection = ({ showTitle = true }: { showTitle?: boolean }) => {
  const { t } = useTranslation()
  const [isExporting, setIsExporting] = useState(false)
  const [exportResult, setExportResult] = useState<{
    success: boolean
    error?: string
  } | null>(null)

  const handleExportLogs = async () => {
    setIsExporting(true)
    setExportResult(null)
    try {
      const logs = await platform.exportLogs()
      if (!logs || logs.trim() === '') {
        setExportResult({ success: true })
        return
      }

      const date = new Date()
      const dateStr = dayjs(date).format('YYYY-M-D_H-m')
      await platform.exporter.exportTextFile(`aibox-logs-${dateStr}.txt`, logs)
      setExportResult({ success: true })
    } catch (error) {
      console.error('Failed to export logs:', error)
      setExportResult({ success: false, error: String(error) })
    } finally {
      setIsExporting(false)
    }
  }

  const _handleClearLogs = async () => {
    try {
      await platform.clearLogs()
      setExportResult({ success: true })
    } catch (error) {
      console.error('Failed to clear logs:', error)
    }
  }

  return (
    <Stack gap="md">
      {showTitle ? (
        <Stack gap="xxs">
          <Title order={5}>{t('Diagnostic Logs')}</Title>
          <Text c="chatbox-tertiary">
            {t(
              'Export application logs for troubleshooting. These logs may be requested by support to help diagnose issues.'
            )}
          </Text>
        </Stack>
      ) : (
        <Text c="chatbox-tertiary">
          {t(
            'Export application logs for troubleshooting. These logs may be requested by support to help diagnose issues.'
          )}
        </Text>
      )}
      <Flex gap="md">
        <Button variant="primary" onClick={handleExportLogs} disabled={isExporting} loading={isExporting}>
          {isExporting ? t('Exporting...') : t('Export Logs')}
        </Button>
        {/* <Button variant="subtle" color="red" onClick={handleClearLogs} disabled={isExporting}>
          {t('Clear Logs')}
        </Button> */}
      </Flex>
      {exportResult && !exportResult.success && (
        <Alert className="self-start" variant="light" color="red" title={t('Export failed')} icon={<IconInfoCircle />}>
          <Text size="sm">{exportResult.error || t('Unknown error')}</Text>
        </Alert>
      )}
    </Stack>
  )
}
