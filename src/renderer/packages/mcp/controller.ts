import { createMCPClient } from '@ai-sdk/mcp'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { ToolSet } from 'ai'
import Emittery from 'emittery'
import isEqual from 'lodash/isEqual'
import platform from '@/platform'
import { settingsStore } from '@/stores/settingsStore'
import { createMcpApprovalPreview, MCPToolApprovalPausedError } from './approval'
import { createRemoteMcpFetch } from './remote-fetch'
import {
  assertMcpToolInputSafe,
  normalizeMcpHeaders,
  redactMcpToolResult,
  sanitizeMcpError,
  validateRemoteMcpUrlWithDns,
} from './security'
import type { MCPServerConfig, MCPServerStatus } from './types'

type TransportConfig = MCPServerConfig['transport']
type MCPClient = Awaited<ReturnType<typeof createMCPClient>>

async function createClient(serverConfig: MCPServerConfig, name = 'aibox-mcp-client'): Promise<MCPClient> {
  const transportConfig = serverConfig.transport
  if (transportConfig.type !== 'http') {
    throw new Error('Only remote HTTPS MCP servers are supported.')
  }
  const lookup = platform.resolveHostname?.bind(platform)
  const url = new URL(await validateRemoteMcpUrlWithDns(transportConfig.url, lookup))
  const headers = normalizeMcpHeaders(transportConfig.headers)
  const remoteFetch = createRemoteMcpFetch({
    ...serverConfig,
    transport: { ...transportConfig, url: url.toString(), headers },
  })
  try {
    const transport = new StreamableHTTPClientTransport(url, {
      requestInit: { headers },
      fetch: remoteFetch,
    })
    return await createMCPClient({
      name,
      transport,
      onUncaughtError(error: unknown) {
        console.error('mcp:client:onUncaughtError', error)
      },
    })
  } catch (err) {
    try {
      const transport = new SSEClientTransport(url, {
        requestInit: { headers },
        fetch: remoteFetch,
        eventSourceInit: { fetch: remoteFetch },
      })
      return await createMCPClient({
        name,
        transport,
        onUncaughtError(error: unknown) {
          console.error('mcp:client:onUncaughtError', error)
        },
      })
    } catch (fallbackError) {
      const streamableMessage = err instanceof Error ? err.message : String(err)
      const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
      throw new Error(
        `Streamable HTTP connection failed: ${streamableMessage}\nLegacy SSE fallback failed: ${fallbackMessage}`,
        { cause: err }
      )
    }
  }
}

export class MCPServer extends Emittery<{ status: MCPServerStatus }> {
  private _status: MCPServerStatus = { state: 'idle' }
  private client?: MCPClient
  private tools?: ToolSet
  private startPromise?: Promise<void>
  private stopPromise?: Promise<void>
  private stopRequested = false

  private readonly config: MCPServerConfig

  constructor(config: MCPServerConfig | TransportConfig) {
    super()
    this.config =
      'transport' in config
        ? config
        : {
            id: 'ad-hoc',
            name: 'Remote MCP',
            enabled: true,
            disabledTools: [],
            transport: config,
          }
  }

  get status() {
    return this._status
  }

  set status(status: MCPServerStatus) {
    this._status = status
    this.emit('status', status)
  }

  async start() {
    if (this.status.state === 'running') return
    if (this.status.state === 'starting' && this.startPromise) return this.startPromise
    if (this.status.state === 'stopping' && this.stopPromise) await this.stopPromise
    if (this.status.state !== 'idle') return

    this.stopRequested = false
    this.status = { state: 'starting' }
    const startPromise = this.startInternal()
    this.startPromise = startPromise
    try {
      await startPromise
    } finally {
      if (this.startPromise === startPromise) this.startPromise = undefined
    }
  }

  private async startInternal(): Promise<void> {
    let client: MCPClient | undefined
    try {
      client = await createClient(this.config)
      this.client = client
      // @ai-sdk/mcp can resolve a newer @ai-sdk/provider-utils patch than `ai`.
      // The returned tools share the same runtime schema contract, but TypeScript
      // treats the two package instances' schema symbols as distinct.
      this.tools = (await client.tools()) as unknown as ToolSet

      if (this.stopRequested) {
        await this.closeClient(client)
        this.client = undefined
        this.tools = undefined
        return
      }
    } catch (err) {
      await this.closeClient(client)
      this.client = undefined
      this.tools = undefined
      if (!this.stopRequested) {
        this.status = { state: 'idle', error: sanitizeMcpError(err, this.config).message }
      }
      return
    }
    this.status = { state: 'running' }
  }

  private async closeClient(client: MCPClient | undefined): Promise<void> {
    try {
      await client?.close()
    } catch (err) {
      // Closing is best effort, but never expose a raw endpoint or credential in
      // the status object if a transport rejects during cleanup.
      this.status = { state: 'idle', error: sanitizeMcpError(err, this.config).message }
    }
  }

  async stop() {
    if (this.stopPromise) return this.stopPromise
    const stopPromise = this.stopInternal()
    this.stopPromise = stopPromise
    try {
      await stopPromise
    } finally {
      if (this.stopPromise === stopPromise) this.stopPromise = undefined
    }
  }

  private async stopInternal(): Promise<void> {
    this.stopRequested = true
    if (this.status.state === 'starting') this.status = { state: 'stopping' }
    else if (this.status.state === 'running') this.status = { state: 'stopping' }

    await this.startPromise
    const client = this.client
    if (client) await this.closeClient(client)
    this.client = undefined
    this.tools = undefined
    this.status = { state: 'idle' }
  }

  getAvailableTools(): ToolSet {
    if (!this.client || this.status.state !== 'running') {
      return {}
    }
    return this.tools || {}
  }

  getToolInfos(): { name: string; description?: string }[] {
    return Object.entries(this.getAvailableTools()).map(([name, tool]) => ({ name, description: tool.description }))
  }
}

// 根据用户配置管理MCP服务器的实际运行
export const mcpController = {
  servers: new Map<string, { instance: MCPServer; config: MCPServerConfig }>(),
  _statusSubscribers: new Map<string, Set<(status: MCPServerStatus) => void>>(),
  _operations: new Map<string, Promise<void>>(),

  _enqueue(id: string, operation: () => Promise<void>): Promise<void> {
    const previous = this._operations.get(id) ?? Promise.resolve()
    const next = previous.catch(() => undefined).then(operation)
    this._operations.set(id, next)
    return next.finally(() => {
      if (this._operations.get(id) === next) this._operations.delete(id)
    })
  },

  bootstrap(serverConfigs: MCPServerConfig[]) {
    for (const serverConfig of serverConfigs) {
      if (serverConfig.enabled) {
        void this.startServer(serverConfig)
      }
    }
  },

  startServer(serverConfig: MCPServerConfig) {
    return this._enqueue(serverConfig.id, () => this._startServer(serverConfig))
  },

  async _startServer(serverConfig: MCPServerConfig) {
    if (!serverConfig.enabled) {
      return
    }
    const existing = this.servers.get(serverConfig.id)
    if (existing) {
      if (isEqual(existing.config.transport, serverConfig.transport)) {
        existing.config = serverConfig
        return
      }
      await this._stopServer(serverConfig.id)
    }
    const server = new MCPServer(serverConfig)
    this.servers.set(serverConfig.id, { instance: server, config: serverConfig })

    // 如果有订阅者，重新连接他们
    const subscribers = this._statusSubscribers.get(serverConfig.id)
    if (subscribers) {
      subscribers.forEach((subscriber) => {
        server.on('status', subscriber)
      })
    }

    await server.start()
  },

  stopServer(id: string) {
    return this._enqueue(id, () => this._stopServer(id))
  },

  async _stopServer(id: string) {
    const server = this.servers.get(id)
    if (!server) return
    await server.instance.stop()
    if (this.servers.get(id) === server) {
      this.servers.delete(id)
      server.instance.clearListeners()
    }
  },

  async stopAll() {
    await Promise.all([...this.servers.keys()].map((id) => this.stopServer(id)))
  },

  updateServer(serverConfig: MCPServerConfig) {
    return this._enqueue(serverConfig.id, async () => {
      if (!serverConfig.enabled) {
        await this._stopServer(serverConfig.id)
        return
      }
      const server = this.servers.get(serverConfig.id)
      if (!server) {
        await this._startServer(serverConfig)
        return
      }
      if (isEqual(server.config.transport, serverConfig.transport)) {
        server.config = serverConfig
      } else {
        await this._stopServer(serverConfig.id)
        await this._startServer(serverConfig)
      }
    })
  },

  getServer(id: string): MCPServer | undefined {
    const server = this.servers.get(id)
    return server?.instance
  },

  getServerToolInfos(id: string): { name: string; description?: string }[] {
    return this.getServer(id)?.getToolInfos() ?? []
  },

  subscribeToServerStatus(id: string, callback: (status: MCPServerStatus) => void) {
    let subscribers = this._statusSubscribers.get(id)
    if (!subscribers) {
      subscribers = new Set()
      this._statusSubscribers.set(id, subscribers)
    }
    subscribers.add(callback)

    const server = this.getServer(id)
    if (server) {
      server.on('status', callback)
      callback(server.status)
    }

    return () => {
      server?.off('status', callback)
      this.getServer(id)?.off('status', callback)
      subscribers.delete(callback)
      if (subscribers.size === 0) this._statusSubscribers.delete(id)
    }
  },

  getAvailableTools(): ToolSet {
    const toolSet: ToolSet = {}
    for (const { instance, config } of this.servers.values()) {
      const mcpTools = instance.getAvailableTools()
      for (const [toolName, tool] of Object.entries(mcpTools)) {
        if (config.disabledTools?.includes(toolName)) continue
        const rawExecute = tool.execute?.bind(tool)
        toolSet[normalizeToolName(config.name, toolName)] = {
          ...tool,
          execute: async (args, options) => {
            try {
              const settings = settingsStore.getState().getSettings()
              assertMcpToolInputSafe(args, settings, config)
              const executionContext = options as typeof options & { approved?: boolean; toolCallId?: string }
              if (!executionContext.approved) {
                if (!executionContext.toolCallId)
                  throw new Error('Remote MCP tool call is missing its call identifier.')
                throw new MCPToolApprovalPausedError(
                  executionContext.toolCallId,
                  config.name,
                  toolName,
                  createMcpApprovalPreview(args)
                )
              }
              const result = await rawExecute?.(args, options)
              return redactMcpToolResult(result, settings, config)
            } catch (err) {
              if (
                err instanceof MCPToolApprovalPausedError ||
                (err as { name?: unknown })?.name === 'MCPToolApprovalPausedError'
              ) {
                throw err
              }
              // 返回而非抛出，否则会导致流程中断。
              // 必须返回可 JSON 序列化的结构：直接返回原始 Error/MCPClientError 会把脏数据写进对话历史，
              // 下次组装 ModelMessage[] 时 AI SDK 本地校验会抛 AI_InvalidPromptError，导致请求发不出去。
              return {
                isError: true,
                content: [{ type: 'text', text: sanitizeMcpError(err, config).message }],
              }
            }
          },
        }
      }
    }
    return toolSet
  },
}

const SERVER_NAME_REGEX = /^[A-Za-z0-9_-]+$/

function normalizeToolName(serverName: string, toolName: string) {
  serverName = serverName.replace(/\s+/g, '_')
  if (SERVER_NAME_REGEX.test(serverName)) {
    return `mcp__${serverName.toLowerCase()}__${toolName}`
  }
  return `mcp__${toolName}`
}
