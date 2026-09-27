import { Box, Button, Flex, Slider, Stack, Text, Title } from '@mantine/core'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '@/stores/settingsStore'

export const Route = createFileRoute('/settings/font-size')({
  component: RouteComponent,
})

const DEFAULT_FONT_SIZE = 14

function RouteComponent() {
  const { t } = useTranslation()
  const router = useRouter()
  const { fontSize, setSettings } = useSettingsStore((state) => state)
  const [draftFontSize, setDraftFontSize] = useState(fontSize)

  const handleApply = () => {
    setSettings({ fontSize: draftFontSize })
    router.history.back()
  }

  const handleReset = () => setDraftFontSize(DEFAULT_FONT_SIZE)

  return (
    <Box className="settings-page w-full">
      <Stack gap="xl" className="settings-mobile-page settings-font-size-page">
        <Flex align="center" gap="sm" className="settings-font-size-header">
          <Title order={3}>{t('Font Size')}</Title>
        </Flex>
        <Stack gap="lg" className="settings-font-size-preview">
          <Text className="settings-font-size-preview__title" style={{ fontSize: `${draftFontSize}px` }}>
            I am an AI assistant trained on algorithms and data.
          </Text>
          <Text className="settings-font-size-preview__body" style={{ fontSize: `${draftFontSize}px` }}>
            I have no consciousness or emotions. I can answer questions, write, translate, and code. My output may be
            wrong; please verify important information.
          </Text>
          <Text className="settings-font-size-preview__title" style={{ fontSize: `${draftFontSize}px` }}>
            我是AI助手，由算法和数据训练，无意识、无情感。
          </Text>
          <Text className="settings-font-size-preview__body" style={{ fontSize: `${draftFontSize}px` }}>
            能答问、写作、翻译、编程；输出可能有误，重要信息请核实。
          </Text>
        </Stack>
        <Stack gap="sm" className="settings-font-size-control">
          <Flex justify="space-between" align="center">
            <Text fw={600}>{t('Font Size')}</Text>
            <Button variant="subtle" size="compact-sm" onClick={handleReset}>
              {t('Default')}
            </Button>
          </Flex>
          <Slider
            min={10}
            max={22}
            step={1}
            value={draftFontSize}
            onChange={setDraftFontSize}
            marks={[{ value: 14 }]}
            aria-label={String(t('Font Size'))}
          />
        </Stack>
        <Button fullWidth size="lg" radius="xl" onClick={handleApply}>
          {t('Apply')}
        </Button>
      </Stack>
    </Box>
  )
}
