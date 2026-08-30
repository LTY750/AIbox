import type { SentryAdapter, SentryScope } from '../../shared/utils/sentry_adapter'
import { getLogger } from '../lib/utils'

const log = getLogger('error-reporting-adapter')

/**
 * 渲染进程的 Sentry 适配器实现
 */
export class RendererSentryAdapter implements SentryAdapter {
  captureException(error: unknown): void {
    log.error('local_error_report', error)
  }

  withScope(callback: (scope: SentryScope) => void): void {
    callback({ setTag: () => undefined, setExtra: () => undefined })
  }
}
