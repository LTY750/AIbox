import { Box, Stack, Text, Title } from '@mantine/core'
import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { DataRecoverySection, ExportLogsSection, ImportExportDataSection } from './general'

export const Route = createFileRoute('/settings/data')({
  component: RouteComponent,
})

function RouteComponent() {
  const { t } = useTranslation()

  return (
    <Box className="settings-page w-full">
      <Stack gap="xl" className="settings-mobile-page settings-data-page">
        <Stack gap="xxs">
          <Title order={3}>{t('Data')}</Title>
          <Text c="chatbox-tertiary">{t('Manage your application data and diagnostic files')}</Text>
        </Stack>
        <Stack gap="lg">
          <Box className="settings-subsection">
            <Stack gap="sm">
              <Stack gap="xxs">
                <Text fw={600}>{t('Data Recovery')}</Text>
                <Text size="sm" c="chatbox-tertiary">
                  {t(
                    'If conversations are missing from the list, use this feature to scan and recover them from storage'
                  )}
                </Text>
              </Stack>
              <DataRecoverySection showTitle={false} />
            </Stack>
          </Box>
          <Box className="settings-subsection">
            <Stack gap="sm">
              <Stack gap="xxs">
                <Text fw={600}>{t('Data Backup and Restore')}</Text>
                <Text size="sm" c="chatbox-tertiary">
                  {t('Export or import your application data')}
                </Text>
              </Stack>
              <ImportExportDataSection />
            </Stack>
          </Box>
          <Box className="settings-subsection">
            <Stack gap="sm">
              <Stack gap="xxs">
                <Text fw={600}>{t('Diagnostic Logs')}</Text>
                <Text size="sm" c="chatbox-tertiary">
                  {t(
                    'Export application logs for troubleshooting. These logs may be requested by support to help diagnose issues.'
                  )}
                </Text>
              </Stack>
              <ExportLogsSection showTitle={false} />
            </Stack>
          </Box>
        </Stack>
      </Stack>
    </Box>
  )
}
