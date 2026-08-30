import { Spotlight, type SpotlightActionData, type SpotlightActionGroupData } from '@mantine/spotlight'
import { IconJson, IconSearch, IconSquareRoundedPlusFilled } from '@tabler/icons-react'
import { type FC, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { ScalableIcon } from '@/components/common/ScalableIcon'

const ServerRegistrySpotlight: FC<{
  triggerAddServer: () => void
  triggerImportJson: () => void
}> = (props) => {
  const { t } = useTranslation()
  const actions: (SpotlightActionGroupData | SpotlightActionData)[] = useMemo(() => {
    return [
      {
        group: String(t('Add or Import')),
        actions: [
          {
            id: 'custom',
            label: String(t('Add Custom Server')),
            description: String(t('Configure MCP server manually')),
            onClick: () => props.triggerAddServer(),
            leftSection: (
              <ScalableIcon icon={IconSquareRoundedPlusFilled} size={24} className="text-chatbox-tint-brand" />
            ),
          },
          {
            id: 'import-json',
            label: String(t('Import from JSON in clipboard')),
            description: String(t('Import MCP servers from JSON in your clipboard')),
            onClick: () => props.triggerImportJson(),
            leftSection: <ScalableIcon icon={IconJson} size={24} className="text-chatbox-tint-brand" />,
          },
        ],
      },
    ]
  }, [props.triggerAddServer, props.triggerImportJson, t])
  return (
    <Spotlight
      actions={actions}
      nothingFound={String(t('Nothing found...'))}
      scrollable
      maxHeight={600}
      shortcut={null}
      searchProps={{
        leftSection: <ScalableIcon icon={IconSearch} size={20} stroke={1.5} />,
        placeholder: String(t('Search...')),
      }}
    />
  )
}

export default ServerRegistrySpotlight
