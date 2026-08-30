import platform from '@/platform'

export const featureFlags = {
  mcp: platform.type === 'desktop' || platform.type === 'mobile',
  knowledgeBase: platform.type === 'desktop',
  skills: platform.type === 'desktop',
  // Work Mode currently depends on a local desktop sandbox. Keep the product
  // contract explicit so mobile does not render controls backed by stubs.
  agentMode: platform.type === 'desktop',
  cloudSandbox: false,
}
