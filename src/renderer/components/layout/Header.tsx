import NiceModal from '@ebay/nice-modal-react'
import { ActionIcon, Flex, Text } from '@mantine/core'
import type { Session } from '@shared/types'
import { IconLayoutSidebarLeftExpand, IconMenu2 } from '@tabler/icons-react'
import clsx from 'clsx'
import { PencilIcon } from 'lucide-react'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import useNeedRoomForWinControls from '@/hooks/useNeedRoomForWinControls'
import { useIsSmallScreen } from '@/hooks/useScreenChange'
import { scheduleGenerateNameAndThreadName, scheduleGenerateThreadName } from '@/stores/sessionActions'
import * as settingActions from '@/stores/settingActions'
import { useUIStore } from '@/stores/uiStore'
import { getAutoTitleGenerationAction } from './auto-title'
import Toolbar from './Toolbar'
import WindowControls from './WindowControls'

export default function Header(props: { session: Session; frosted?: boolean }) {
  const { t } = useTranslation()
  const showSidebar = useUIStore((s) => s.showSidebar)
  const setShowSidebar = useUIStore((s) => s.setShowSidebar)

  const isSmallScreen = useIsSmallScreen()
  const { needRoomForMacWindowControls } = useNeedRoomForWinControls()

  const { session: currentSession } = props
  const frosted = props.frosted ?? false

  useEffect(() => {
    const autoGenerateTitle = settingActions.getAutoGenerateTitle()
    if (!autoGenerateTitle) {
      return
    }

    const action = getAutoTitleGenerationAction(currentSession)
    if (action === 'session-and-thread') {
      scheduleGenerateNameAndThreadName(currentSession.id)
    } else if (action === 'thread') {
      scheduleGenerateThreadName(currentSession.id)
    }
  }, [currentSession])

  const editCurrentSession = () => {
    if (!currentSession) {
      return
    }
    void NiceModal.show('session-settings', { session: currentSession })
  }

  if (isSmallScreen) {
    return (
      <div
        className={clsx('mobile-chat-header', frosted && 'mobile-chat-header-frosted')}
        aria-label={currentSession.name}
      >
        <div className="mobile-chat-header-controls">
          <ActionIcon
            className={clsx('controls mobile-chat-floating-button mobile-touch-target')}
            variant="subtle"
            size={40}
            color="chatbox-secondary"
            aria-label={t('Chat History')}
            onClick={() => setShowSidebar(!showSidebar)}
          >
            <IconMenu2 size={20} />
          </ActionIcon>

          <Flex align="center" className="mobile-chat-action-pill">
            <ActionIcon
              className="controls mobile-chat-floating-action mobile-touch-target"
              variant="subtle"
              size={36}
              color="chatbox-secondary"
              aria-label={t('Customize settings for the current conversation')}
              onClick={editCurrentSession}
            >
              <PencilIcon size={18} />
            </ActionIcon>
            <Toolbar sessionId={currentSession.id} mobileMinimal />
          </Flex>
        </div>
        <span className="sr-only">{currentSession.name}</span>
      </div>
    )
  }

  return (
    <Flex align="center" h={48} px="md" className="flex-none title-bar border-0">
      {(!showSidebar || isSmallScreen) && (
        <Flex align="center" className={needRoomForMacWindowControls ? 'pl-20' : ''}>
          <ActionIcon
            className="controls"
            variant="subtle"
            size={20}
            color="chatbox-tertiary"
            mr="xs"
            aria-label={t('Chat History')}
            onClick={() => setShowSidebar(!showSidebar)}
          >
            <IconLayoutSidebarLeftExpand />
          </ActionIcon>
        </Flex>
      )}

      <Flex align="center" flex={1} className="min-w-0">
        <Text fw={600} fz={18} lh="24px" truncate="end" className="min-w-0">
          {currentSession.name}
        </Text>
        <Tooltip>
          <TooltipTrigger asChild>
            <ActionIcon
              className="controls"
              variant="subtle"
              color="chatbox-tertiary"
              size={16}
              ml={4}
              aria-label={t('Customize settings for the current conversation')}
              onClick={editCurrentSession}
            >
              <PencilIcon size={12} />
            </ActionIcon>
          </TooltipTrigger>
          <TooltipContent>{t('Customize settings for the current conversation')}</TooltipContent>
        </Tooltip>
      </Flex>

      <Toolbar sessionId={currentSession.id} />

      <WindowControls className="-mr-3 ml-2" />
    </Flex>
  )
}
