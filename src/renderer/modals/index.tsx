import NiceModal from '@ebay/nice-modal-react'
import { lazy, Suspense, type ComponentType } from 'react'

type ModalProps = Record<string, unknown>

function createLazyModal(loader: () => Promise<unknown>) {
  const Modal = lazy(async () => (await loader()) as { default: ComponentType<ModalProps> })
  return function LazyModal(props: ModalProps) {
    return (
      <Suspense fallback={null}>
        <Modal {...props} />
      </Suspense>
    )
  }
}

NiceModal.register('welcome', createLazyModal(() => import('./Welcome')))
NiceModal.register('agent-mode-reward-claim-success', createLazyModal(() => import('./AgentModeRewardClaimSuccess')))
NiceModal.register('file-parse-error', createLazyModal(() => import('./FileParseError')))
NiceModal.register('content-viewer', createLazyModal(() => import('./ContentViewer')))
NiceModal.register('session-settings', createLazyModal(() => import('./SessionSettings')))
NiceModal.register('app-store-rating', createLazyModal(() => import('./AppStoreRating')))
NiceModal.register('artifact-preview', createLazyModal(() => import('./ArtifactPreview')))
NiceModal.register('clear-session-list', createLazyModal(() => import('./ClearSessionList')))
NiceModal.register('confirm', createLazyModal(() => import('./ConfirmModal')))
NiceModal.register('export-chat', createLazyModal(() => import('./ExportChat')))
NiceModal.register('message-edit', createLazyModal(() => import('./MessageEdit')))
NiceModal.register('json-viewer', createLazyModal(() => import('./JsonViewer')))
NiceModal.register('report-content', createLazyModal(() => import('./ReportContent')))
NiceModal.register('model-edit', createLazyModal(() => import('./ModelEdit')))
NiceModal.register('thread-name-edit', createLazyModal(() => import('./ThreadNameEdit')))
NiceModal.register('vibedrop-publish', createLazyModal(() => import('./VibedropPublish')))
NiceModal.register(
  'copilot-settings',
  createLazyModal(() => import('../routes/copilots/-components/CopilotSettingsModal'))
)
