// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { sentryInitMock, sentryCloseMock, initSettingsStoreMock, getSettingsMock, subscribeMock } = vi.hoisted(() => ({
  sentryInitMock: vi.fn(),
  sentryCloseMock: vi.fn(),
  initSettingsStoreMock: vi.fn(),
  getSettingsMock: vi.fn(),
  subscribeMock: vi.fn(),
}))

vi.mock('@sentry/react', () => ({
  init: sentryInitMock,
  close: sentryCloseMock,
}))
vi.mock('@shared/utils/sentry_policy', () => ({
  createSentryEventProcessor: vi.fn(() => vi.fn((event) => event)),
}))
vi.mock('@/stores/settingsStore', () => ({
  initSettingsStore: initSettingsStoreMock,
  settingsStore: {
    getState: getSettingsMock,
    subscribe: subscribeMock,
  },
}))
vi.mock('@/variables', () => ({
  CHATBOX_BUILD_PLATFORM: 'android',
  CHATBOX_BUILD_TARGET: 'mobile_app',
  NODE_ENV: 'test',
}))
vi.mock('../platform', () => ({ default: { getVersion: vi.fn(async () => '1.0.0'), type: 'mobile' } }))

describe('local diagnostic initialization policy', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    getSettingsMock.mockReturnValue({ allowReportingAndTracking: false })
  })

  it('does not initialize Sentry before the user has consented', async () => {
    initSettingsStoreMock.mockResolvedValue({ allowReportingAndTracking: false })
    const { initSentry } = await import('./sentry_init')

    await expect(initSentry()).resolves.toBe(false)
    expect(sentryInitMock).not.toHaveBeenCalled()
  })

  it('never initializes the remote Sentry SDK even when reporting is enabled', async () => {
    initSettingsStoreMock.mockResolvedValue({ allowReportingAndTracking: true })
    getSettingsMock.mockReturnValue({ allowReportingAndTracking: true })
    const { initSentry } = await import('./sentry_init')

    await expect(initSentry()).resolves.toBe(false)
    expect(sentryInitMock).not.toHaveBeenCalled()
    expect(sentryCloseMock).not.toHaveBeenCalled()
  })
})
