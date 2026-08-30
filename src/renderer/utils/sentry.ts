import type { SentryErrorPriority } from '@shared/utils/sentry_policy'
import { getLogger } from '@/lib/utils'

export interface ReportErrorContext {
  domain: string
  extras?: Record<string, unknown>
  handled?: boolean
  operation: string
  priority?: SentryErrorPriority
  tags?: Record<string, string | number | boolean>
}

const log = getLogger('error-reporting')

function redactDiagnosticText(value: string): string {
  return value
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(/\b(?:https?|wss?):\/\/[^\s)]+/gi, '[URL]')
    .replace(
      /\b((?:api[_-]?key|token|secret|password|authorization|cookie|license[_-]?key))\b(\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s&,]+)/gi,
      '$1$2[REDACTED]'
    )
    .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, '[REDACTED_KEY]')
    .slice(0, 2000)
}

function toDiagnosticError(error: unknown): { name: string; message: string; stack?: string } {
  const normalized = error instanceof Error ? error : new Error(String(error))
  return {
    name: normalized.name.slice(0, 120),
    message: redactDiagnosticText(normalized.message),
    ...(normalized.stack ? { stack: redactDiagnosticText(normalized.stack) } : {}),
  }
}

function safeExtras(extras: Record<string, unknown> | undefined): Record<string, number | boolean | string> {
  const result: Record<string, number | boolean | string> = {}
  for (const [key, value] of Object.entries(extras ?? {})) {
    if (typeof value === 'number' || typeof value === 'boolean') {
      result[key] = value
    } else if (typeof value === 'string' && /(?:count|duration|status|version|length|size|code)$/i.test(key)) {
      result[key] = redactDiagnosticText(value)
    }
  }
  return result
}

/**
 * Record an unexpected renderer failure in the platform's local diagnostic log.
 * This function intentionally has no network transport, despite the historical
 * name retained for compatibility with shared call sites.
 */
export function reportError(error: unknown, context: ReportErrorContext): void {
  const tags = Object.fromEntries(
    Object.entries(context.tags ?? {}).map(([key, value]) => [key, String(value).slice(0, 200)])
  )
  log.error(
    'local_error_report',
    JSON.stringify({
      domain: context.domain,
      operation: context.operation,
      priority: context.priority ?? 'normal',
      handled: context.handled ?? true,
      tags,
      extras: safeExtras(context.extras),
      error: toDiagnosticError(error),
    })
  )
}
