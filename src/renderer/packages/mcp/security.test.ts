import * as defaults from '@shared/defaults'
import { ModelProviderType, type Settings } from '@shared/types'
import { describe, expect, it } from 'vitest'
import {
  assertMcpToolInputSafe,
  normalizeMcpHeaders,
  redactMcpToolResult,
  sanitizeMcpError,
  validateRemoteMcpUrl,
  validateRemoteMcpUrlWithDns,
} from './security'
import type { MCPServerConfig } from './types'

function createSettings(): Settings {
  const settings = defaults.settings()
  settings.providers = {
    ...settings.providers,
    openai: { ...(settings.providers?.openai ?? {}), apiKey: 'sk-settings-secret-123456' },
  }
  settings.customProviders = [
    {
      id: 'custom-provider',
      name: 'Custom provider',
      type: ModelProviderType.OpenAI,
      isCustom: true,
      defaultSettings: { apiKey: 'custom-arbitrary-key-123456' },
    },
  ]
  settings.licenseKey = 'license-arbitrary-secret-123456'
  settings.memorizedManualLicenseKey = 'memorized-arbitrary-secret-123456'
  settings.lastSelectedLicenseByUser = { user: 'selected-arbitrary-secret-123456' }
  settings.licenseInstances = { 'license-arbitrary-secret-123456': 'instance-id' }
  return settings
}

function createServer(url = 'https://mcp.example.com/sse?token=server-token-123456'): MCPServerConfig {
  return {
    id: 'modelscope',
    name: 'ModelScope',
    enabled: true,
    disabledTools: [],
    transport: {
      type: 'http',
      url,
      headers: { Authorization: 'Bearer mcp-header-token-123456' },
    },
  }
}

describe('remote MCP URL validation', () => {
  it('requires HTTPS and strips fragments', () => {
    expect(() => validateRemoteMcpUrl('http://mcp.example.com/sse')).toThrow('HTTPS')
    expect(validateRemoteMcpUrl('https://mcp.example.com/sse#token=secret')).toBe('https://mcp.example.com/sse')
  })

  it('rejects URL credentials', () => {
    expect(() => validateRemoteMcpUrl('https://user:password@mcp.example.com/sse')).toThrow('HTTP header')
  })

  it('rejects public hostnames that resolve to private addresses', async () => {
    const lookup = async () => [{ address: '10.0.0.8', family: 4 }] as const
    await expect(validateRemoteMcpUrlWithDns('https://mcp.example.com/mcp', lookup)).rejects.toThrow('public HTTPS')
  })

  it('checks every DNS answer, including IPv6 results', async () => {
    const lookup = async () => [
      { address: '203.0.113.10', family: 4 },
      { address: 'fd00::10', family: 6 },
    ] as const
    await expect(validateRemoteMcpUrlWithDns('https://mcp.example.com/mcp', lookup)).rejects.toThrow('public HTTPS')
  })

  it('rejects private or reserved hosts', () => {
    for (const url of [
      'https://localhost/mcp',
      'https://service.internal/mcp',
      'https://127.0.0.1/mcp',
      'https://192.168.1.20/mcp',
      'https://[::1]/mcp',
      'https://[fd00::1]/mcp',
      'https://[::ffff:192.168.1.20]/mcp',
      'https://[fe80::1]/mcp',
    ]) {
      expect(() => validateRemoteMcpUrl(url), url).toThrow('public HTTPS')
    }
  })
})

describe('remote MCP header validation', () => {
  it('removes blocked and malformed headers while preserving valid credentials', () => {
    expect(
      normalizeMcpHeaders({
        Authorization: 'Bearer mcp-token-123456',
        Host: 'localhost',
        'bad name': 'value',
        'x-newline': 'one\ntwo',
      })
    ).toEqual({ Authorization: 'Bearer mcp-token-123456' })
  })

  it('rejects excessive header counts', () => {
    const headers = Object.fromEntries(Array.from({ length: 65 }, (_, index) => [`x-header-${index}`, 'value']))
    expect(() => normalizeMcpHeaders(headers)).toThrow('at most 64')
  })
})

describe('remote MCP data boundaries', () => {
  it('blocks credential-like tool arguments', () => {
    const settings = createSettings()
    const server = createServer()
    expect(() => assertMcpToolInputSafe({ query: 'normal question' }, settings, server)).not.toThrow()
    expect(() => assertMcpToolInputSafe({ authorization: 'Bearer user-secret-123456' }, settings, server)).toThrow(
      'credential-like'
    )
    expect(() => assertMcpToolInputSafe({ text: 'sk-settings-secret-123456' }, settings, server)).toThrow(
      'credential-like'
    )
    expect(() => assertMcpToolInputSafe({ text: 'license-arbitrary-secret-123456' }, settings, server)).toThrow(
      'credential-like'
    )
    expect(() => assertMcpToolInputSafe({ text: 'custom-arbitrary-key-123456' }, settings, server)).toThrow(
      'credential-like'
    )
  })

  it('redacts sensitive fields, URLs, and tokens in tool results', () => {
    const settings = createSettings()
    const server = createServer()
    const result = redactMcpToolResult(
      {
        apiKey: 'sk-settings-secret-123456',
        customApiKey: 'custom-arbitrary-key-123456',
        licenseKey: 'license-arbitrary-secret-123456',
        authorization: 'Bearer mcp-header-token-123456',
        endpoint: 'https://mcp.example.com/sse?token=server-token-123456',
        message: 'jwt eyJaaaaaaaa.eyJbbbbbbbb.eyJcccccccc',
      },
      settings,
      server
    )
    expect(JSON.stringify(result)).not.toMatch(
      /sk-settings-secret|custom-arbitrary-key|license-arbitrary-secret|mcp-header-token|server-token|eyJaaaaaaaa/
    )
    expect(result).toMatchObject({
      apiKey: '[REDACTED]',
      customApiKey: '[REDACTED]',
      licenseKey: '[REDACTED]',
      authorization: '[REDACTED]',
    })
  })

  it('sanitizes endpoint and bearer data in errors', () => {
    const message = sanitizeMcpError(
      new Error('fetch https://mcp.example.com/sse?token=server-token-123456 failed: Bearer remote-token-123456'),
      createServer()
    ).message
    expect(message).toBe('fetch [MCP endpoint] failed: Bearer [REDACTED]')
  })
})
