import { Box, Stack, Text } from '@mantine/core'
import type { ReactNode } from 'react'

type SettingsSectionProps = {
  title: ReactNode
  children: ReactNode
  className?: string
}

export function SettingsSection({ title, children, className }: SettingsSectionProps) {
  return (
    <Box component="section" className={`settings-section w-full ${className ?? ''}`}>
      <Stack gap="sm">
        <Text size="sm" fw={600} c="chatbox-tertiary" className="settings-section-title">
          {title}
        </Text>
        <Stack gap={0} className="settings-section-list">
          {children}
        </Stack>
      </Stack>
    </Box>
  )
}
