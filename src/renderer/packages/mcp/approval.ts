export class MCPToolApprovalPausedError extends Error {
  constructor(
    readonly toolCallId: string,
    readonly serverName: string,
    readonly toolName: string,
    readonly preview: string
  ) {
    super(`User approval required before calling remote MCP tool: ${toolName}`)
    this.name = 'MCPToolApprovalPausedError'
  }
}

export function createMcpApprovalPreview(input: unknown, maxLength = 8000): string {
  let preview: string
  try {
    preview = typeof input === 'string' ? input : JSON.stringify(input, null, 2)
  } catch {
    preview = String(input)
  }
  return preview.length > maxLength ? `${preview.slice(0, maxLength)}\n\n[truncated]` : preview
}
