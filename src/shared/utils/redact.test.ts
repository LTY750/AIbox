import { describe, expect, it } from 'vitest'
import { redactSensitiveText } from './redact'

describe('redactSensitiveText', () => {
  it('redacts credential fields in plain text and JSON/header forms', () => {
    const input =
      '{"apiKey":"api-secret","x-chatbox-license":"license-secret","x-api-key": api-header-secret, token=token-secret}'
    const output = redactSensitiveText(input)

    expect(output).not.toContain('api-secret')
    expect(output).not.toContain('license-secret')
    expect(output).not.toContain('api-header-secret')
    expect(output).not.toContain('token-secret')
    expect(output).toContain('[REDACTED]')
  })

  it('redacts bearer, JWT, URL credentials/query/fragment, and local user paths', () => {
    const input =
      'Bearer abc.def.ghi jwt=eyJaaaaaaaa.eyJbbbbbbbb.eyJcccccccc https://alice:secret@example.com/mcp?api_key=query-secret#token=fragment-secret C:\\Users\\Alice\\AppData\\Roaming\\AIbox'
    const output = redactSensitiveText(input)

    expect(output).not.toMatch(/abc\.def\.ghi|query-secret|fragment-secret|alice:secret|Alice\\AppData/)
    expect(output).toContain('[REDACTED_USER]')
    expect(output).toContain('[URL]')
  })

  it('is idempotent', () => {
    const once = redactSensitiveText('apiKey=secret https://example.com?token=secret')
    expect(redactSensitiveText(once)).toBe(once)
  })
})
