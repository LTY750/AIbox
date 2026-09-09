export function getMessageModelLabel(model: string | undefined): string | undefined {
  const normalized = model?.trim()
  if (!normalized || normalized.toLowerCase() === 'unknown') {
    return undefined
  }
  return normalized
}
