import { beforeEach, describe, expect, test, vi } from 'vitest'

const { logError } = vi.hoisted(() => ({
  logError: vi.fn(),
}))

vi.mock('@/lib/utils', () => ({
  getLogger: vi.fn(() => ({
    debug: vi.fn(),
    error: logError,
    info: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  })),
}))

import { reportError } from './sentry'

describe('reportError', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('adds stable classification and bounded context', () => {
    const error = new Error('boom')

    reportError(error, {
      domain: 'session',
      extras: { retryCount: 2 },
      handled: false,
      operation: 'generation',
      priority: 'high',
      tags: { provider: 'openai' },
    })

    expect(logError).toHaveBeenCalledWith('local_error_report', expect.any(String))
    const payload = JSON.parse(logError.mock.calls[0][1] as string)
    expect(payload).toMatchObject({
      domain: 'session',
      operation: 'generation',
      priority: 'high',
      handled: false,
      tags: { provider: 'openai' },
      extras: { retryCount: 2 },
      error: { name: 'Error', message: 'boom' },
    })
  })

  test('normalizes non-Error values', () => {
    reportError('failed', { domain: 'application', operation: 'startup' })

    const payload = JSON.parse(logError.mock.calls[0][1] as string)
    expect(payload.error).toMatchObject({ name: 'Error', message: 'failed' })
  })
})
