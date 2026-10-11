import { ActionIcon, Popover, Stack, Text } from '@mantine/core'
import { IconInfoCircle } from '@tabler/icons-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ScalableIcon } from './ScalableIcon'

export type ModelParameter = 'temperature' | 'topP'

interface ModelParameterInfoProps {
  parameter: ModelParameter
}

const parameterDetails: Record<ModelParameter, { recommended: string; descriptionKey: string; labelKey: string }> = {
  temperature: {
    descriptionKey:
      'Modify the creativity of AI responses; the higher the value, the more random and intriguing the answers become, while a lower value ensures greater stability and reliability.',
    labelKey: 'Temperature',
    recommended: '0.7',
  },
  topP: {
    descriptionKey:
      'The topP parameter controls the diversity of AI responses: lower values make the output more focused and predictable, while higher values allow for more varied and creative replies.',
    labelKey: 'Top P',
    recommended: '0.9',
  },
}

export default function ModelParameterInfo({ parameter }: ModelParameterInfoProps) {
  const { t } = useTranslation()
  const [opened, setOpened] = useState(false)
  const details = parameterDetails[parameter]
  const label = t(details.labelKey)

  return (
    <Popover opened={opened} onChange={setOpened} position="top-start" withArrow withinPortal shadow="md" width={320}>
      <Popover.Target>
        <ActionIcon
          variant="subtle"
          color="chatbox-gray"
          size="sm"
          aria-label={label}
          onClick={(event) => {
            event.stopPropagation()
            setOpened((current) => !current)
          }}
        >
          <ScalableIcon icon={IconInfoCircle} size={20} className="text-chatbox-tint-tertiary" />
        </ActionIcon>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="xs">
          <Text size="sm" fw={600}>
            {label}
          </Text>
          <Text size="sm">{t(details.descriptionKey)}</Text>
          <Text size="sm" fw={600}>
            {t('Recommended')}: {details.recommended}
          </Text>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  )
}
