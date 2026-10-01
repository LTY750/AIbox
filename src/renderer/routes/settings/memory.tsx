import { Stack } from '@mantine/core'
import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { MemorySettingsSection } from '@/components/settings/MemorySettingsSection'
import { SettingsSection } from '@/components/settings/SettingsSection'

export const Route = createFileRoute('/settings/memory')({
  component: RouteComponent,
})

export function RouteComponent() {
  const { t } = useTranslation()

  return (
    <Stack
      p={{ base: 0, sm: 'md' }}
      gap="lg"
      className="settings-page settings-mobile-page mx-auto w-full max-w-[760px]"
    >
      <SettingsSection title={t('Memory')} className="settings-section--primary">
        <MemorySettingsSection />
      </SettingsSection>
    </Stack>
  )
}
