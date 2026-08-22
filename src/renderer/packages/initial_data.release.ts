import type { Session } from '../../shared/types'

// Production mobile/desktop builds intentionally ship no demo conversations.
// Keep the migration identifiers as metadata only; migration code skips demo
// seeding for production builds.
const migrationMarker = (id: string): Session => ({ id, name: '', messages: [] })

export const defaultSessionsForEN: Session[] = []
export const defaultSessionsForCN: Session[] = []
export const imageCreatorSessionForCN = migrationMarker('chatbox-chat-demo-image-creator')
export const imageCreatorSessionForEN = migrationMarker('chatbox-chat-demo-image-creator')
export const artifactSessionCN = migrationMarker('chatbox-chat-demo-artifact-1-cn')
export const artifactSessionEN = migrationMarker('chatbox-chat-demo-artifact-1-en')
export const mermaidSessionCN = migrationMarker('mermaid-demo-1-cn')
export const mermaidSessionEN = migrationMarker('mermaid-demo-1-en')
