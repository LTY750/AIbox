import { describe, expect, it } from 'vitest'
import type { MCPServerConfig } from '@/packages/mcp/types'
import {
  getConfigFromFormValues,
  getFormValuesFromConfig,
  type MCPServerConfigFormValues,
  parseServerFromJson,
  parseServersFromJson,
} from './utils'

describe('remote MCP config conversion', () => {
  it('preserves a URL and header values containing equals signs', () => {
    const values: MCPServerConfigFormValues = {
      id: 'server-1',
      name: 'ModelScope tools',
      enabled: true,
      disabledTools: ['unsafe_tool'],
      transport: {
        type: 'http',
        url: 'https://mcp.example.com/sse?workspace=public',
        headers: 'Authorization=Bearer abc.def==\nX-Workspace=public',
      },
    }

    const config = getConfigFromFormValues(values)

    expect(config).toEqual({
      id: 'server-1',
      name: 'ModelScope tools',
      enabled: true,
      disabledTools: ['unsafe_tool'],
      transport: {
        type: 'http',
        url: 'https://mcp.example.com/sse?workspace=public',
        headers: {
          Authorization: 'Bearer abc.def==',
          'X-Workspace': 'public',
        },
      },
    })
    expect(getConfigFromFormValues(getFormValuesFromConfig(config))).toEqual(config)
  })

  it('does not reopen a legacy stdio entry in the remote editor', () => {
    const legacy: MCPServerConfig = {
      id: 'legacy',
      name: 'Legacy local server',
      enabled: false,
      transport: { type: 'stdio', command: 'server', args: [] },
    }

    expect(() => getFormValuesFromConfig(legacy)).toThrow('Only remote HTTPS MCP servers are supported.')
  })
})

describe('remote MCP JSON import', () => {
  it('imports ModelScope-style remote entries and skips local commands', () => {
    const servers = parseServersFromJson(
      JSON.stringify({
        mcpServers: {
          modelscope: {
            transport: {
              type: 'sse',
              url: 'https://mcp.example.com/sse',
              headers: { Authorization: 'Bearer example-token' },
            },
          },
          local: { command: 'npx', args: ['local-mcp-server'] },
        },
      })
    )

    expect(servers).toHaveLength(1)
    expect(servers[0]).toMatchObject({
      name: 'modelscope',
      enabled: false,
      disabledTools: [],
      transport: {
        type: 'http',
        url: 'https://mcp.example.com/sse',
        headers: { Authorization: 'Bearer example-token' },
      },
    })
  })

  it('rejects a standalone local command entry', () => {
    expect(() => parseServerFromJson(JSON.stringify({ command: 'npx', args: ['local-mcp-server'] }))).toThrow(
      'MCP server entry needs a remote URL.'
    )
  })

  it('keeps a standalone imported server disabled until the user enables it', () => {
    const server = parseServerFromJson(
      JSON.stringify({ url: 'https://mcp.example.com/sse', name: 'Imported server' })
    )

    expect(server).toMatchObject({ enabled: false, name: 'Imported server' })
  })
})
