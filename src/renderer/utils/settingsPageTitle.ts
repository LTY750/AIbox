const SETTINGS_SECTION_LABELS: Record<string, string> = {
  provider: 'Model Provider',
  'default-models': 'Default Models',
  'web-search': 'Web Search',
  mcp: 'MCP',
  'knowledge-base': 'Knowledge Base',
  skills: 'Skills',
  'document-parser': 'Document Parser',
  chat: 'Chat Settings',
  archive: 'Archived Chats',
  hotkeys: 'Keyboard Shortcuts',
  general: 'General Settings',
}

export interface SettingsProviderTitle {
  id: string
  name: string
}

export function getSettingsPageTitle(
  pathname: string,
  translate: (key: string) => string,
  providers: readonly SettingsProviderTitle[] = []
): string {
  const segments = pathname.split('/').filter(Boolean)
  const settingsIndex = segments.lastIndexOf('settings')
  const section = settingsIndex >= 0 ? segments[settingsIndex + 1] : undefined

  if (!section) {
    return translate('Settings')
  }

  if (section === 'provider') {
    const providerId = segments[settingsIndex + 2]
    if (providerId) {
      const provider = providers.find((candidate) => candidate.id === providerId)
      return provider ? translate(provider.name) : translate('Model Provider')
    }
  }

  return translate(SETTINGS_SECTION_LABELS[section] || 'Settings')
}
