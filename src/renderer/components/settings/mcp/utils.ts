import { v4 as uuid } from 'uuid'
import { z } from 'zod'
import { normalizeMcpHeaders, validateRemoteMcpUrl } from '@/packages/mcp/security'
import type { MCPServerConfig } from '@/packages/mcp/types'

const envUtils = {
  parse: (env: string): Record<string, string> => {
    const lines = env.split('\n')
    const result: Record<string, string> = {}
    for (const line of lines) {
      const eqIndex = line.indexOf('=')
      if (eqIndex === -1) continue
      const key = line.slice(0, eqIndex)
      const value = line.slice(eqIndex + 1)
      if (key && value && key.trim() && value.trim()) {
        result[key.trim()] = value.trim()
      }
    }
    return result
  },
  stringify: (env: Record<string, string>): string => {
    return Object.entries(env)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n')
  },
}

export type MCPServerConfigFormValues = MCPServerConfig<{
  type: 'http'
  url: string
  headers?: string
}>

export function getConfigFromFormValues(values: MCPServerConfigFormValues): MCPServerConfig {
  return {
    id: values.id,
    name: values.name,
    enabled: values.enabled,
    disabledTools: values.disabledTools ?? [],
    transport: {
      type: 'http',
      url: validateRemoteMcpUrl(values.transport.url),
      headers: normalizeMcpHeaders(values.transport.headers ? envUtils.parse(values.transport.headers) : undefined),
    },
  }
}

export function getFormValuesFromConfig(config: MCPServerConfig): MCPServerConfigFormValues {
  if (config.transport.type !== 'http') {
    throw new Error('Only remote HTTPS MCP servers are supported.')
  }
  return {
    id: config.id,
    name: config.name,
    enabled: config.enabled,
    disabledTools: config.disabledTools ?? [],
    transport: {
      type: 'http',
      url: config.transport.url,
      headers: config.transport.headers ? envUtils.stringify(config.transport.headers) : undefined,
    },
  }
}

type ParsedMcpServer = { type: 'http'; url: string; headers?: Record<string, string>; name?: string }

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined
}

function parseMcpServer(value: unknown): ParsedMcpServer {
  const record = asRecord(value)
  if (!record) throw new Error('MCP server entry must be an object.')

  // ModelScope and other registries may wrap the transport as
  // { transport: { type: 'sse', url, headers } }.
  const nestedTransport = asRecord(record.transport)
  const source = nestedTransport ? { ...record, ...nestedTransport } : record
  const name = typeof source.name === 'string' ? source.name : undefined

  if (typeof source.url === 'string') {
    const headers = source.headers === undefined ? undefined : z.record(z.string(), z.string()).parse(source.headers)
    return { type: 'http', url: source.url, headers, name }
  }

  throw new Error('MCP server entry needs a remote URL.')
}

function createConfig(parsed: ParsedMcpServer, nameOverride?: string): MCPServerConfig {
  const name = parsed.name ?? nameOverride ?? ''
  return {
    id: uuid(),
    name,
    enabled: false,
    disabledTools: [],
    transport: { type: 'http', url: validateRemoteMcpUrl(parsed.url), headers: normalizeMcpHeaders(parsed.headers) },
  }
}

export function parseServerFromJson(text: string): MCPServerConfig | undefined {
  const json = JSON.parse(text)
  const record = asRecord(json)
  const registry = asRecord(record?.mcpServers)
  if (registry) {
    const entries = Object.entries(registry)
    if (entries.length !== 1) throw new Error('Provide exactly one MCP server entry.')
    const [name, value] = entries[0]
    return { ...createConfig(parseMcpServer(value), name), enabled: false }
  }
  return { ...createConfig(parseMcpServer(json)), enabled: false }
}

export function parseServersFromJson(text: string): MCPServerConfig[] {
  try {
    const json = JSON.parse(text)
    const record = asRecord(json)
    const registry = asRecord(record?.mcpServers)
    if (!registry) {
      const server = parseServerFromJson(text)
      return server ? [server] : []
    }
    const servers: MCPServerConfig[] = []
    for (const [key, value] of Object.entries(registry)) {
      try {
        servers.push(createConfig(parseMcpServer(value), key))
      } catch {
        // Invalid entries are skipped; the settings screen reports an empty
        // result without echoing untrusted clipboard contents into logs.
      }
    }
    return servers
  } catch {
    return []
  }
}
