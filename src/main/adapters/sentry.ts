import type { SentryAdapter, SentryScope } from '../../shared/utils/sentry_adapter'
import { redactSensitiveText } from '../../shared/utils/redact'
import { getLogger } from '../util'

const log = getLogger('error-reporting')

function formatDiagnosticError(error: unknown): string {
  if (error instanceof Error) {
    return JSON.stringify({
      name: error.name,
      message: redactSensitiveText(error.message),
      ...(error.stack ? { stack: redactSensitiveText(error.stack) } : {}),
    })
  }
  return redactSensitiveText(String(error))
}

/**
 * Main-process compatibility adapter. Diagnostics are written to electron-log
 * and never sent to a remote error-reporting service.
 */
export class MainSentryAdapter implements SentryAdapter {
  captureException(error: unknown): void {
    log.error('local_error_report', formatDiagnosticError(error))
  }

  withScope(callback: (scope: SentryScope) => void): void {
    callback({ setTag: () => undefined, setExtra: () => undefined })
  }
}

export const sentry = new MainSentryAdapter()

export function flushSentry(timeout: number): Promise<boolean> {
  void timeout
  return Promise.resolve(true)
}
