import { Box, Container, Flex, Stack, Text, Title } from '@mantine/core'
import { IconBrain } from '@tabler/icons-react'
import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { MemorySettingsSection } from '@/components/settings/MemorySettingsSection'

export const Route = createFileRoute('/settings/memory')({
  component: RouteComponent,
})

export function RouteComponent() {
  const { t } = useTranslation()

  return (
    <Container size="md" py="md">
      <Title order={3} ta="center" mb="lg">
        {t('Memories')}
      </Title>
      <Box
        component="section"
        className="w-full rounded-[28px] border border-solid border-chatbox-border-primary bg-chatbox-background-secondary p-4 sm:p-5"
      >
        <Stack gap="md">
          <Flex align="center" gap="sm">
            <Box className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-chatbox-brand/10 text-chatbox-brand">
              <IconBrain size={18} />
            </Box>
            <Text fw={700} size="md">
              {t('Memory')}
            </Text>
          </Flex>
          <Stack gap={0} className="overflow-hidden rounded-2xl bg-chatbox-background-primary">
            <MemorySettingsSection />
          </Stack>
        </Stack>
      </Box>
    </Container>
  )
}
