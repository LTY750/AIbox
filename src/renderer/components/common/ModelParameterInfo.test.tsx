// @vitest-environment jsdom

import { MantineProvider } from '@mantine/core'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@/test-utils'
import ModelParameterInfo from './ModelParameterInfo'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
})

describe('ModelParameterInfo', () => {
  it('opens the parameter explanation and recommended value when tapped', async () => {
    render(
      <MantineProvider>
        <ModelParameterInfo parameter="temperature" />
      </MantineProvider>
    )

    fireEvent.click(screen.getByRole('button', { name: 'Temperature' }))

    await waitFor(() => {
      const dialog = screen.getByRole('dialog')
      expect(dialog.textContent).toContain('Modify the creativity of AI responses')
      expect(dialog.textContent).toContain('Recommended: 0.7')
    })
  })
})
