/**
 * Redact credentials and user-specific locations before diagnostic text is
 * persisted or sent to another process. Keep this function deterministic and
 * idempotent because renderer and native loggers may both call it.
 */
export function redactSensitiveText(value: string): string {
  const secretField =
    '(?:api[_-]?key|access[_-]?key|secret[_-]?key|session[_-]?token|access[_-]?token|refresh[_-]?token|password|token|authorization|cookie|license(?:[_-]?key)?|x-chatbox-license|x-api-key|x-goog-api-key|client[_-]?secret|api[_-]?token|secret[_-]?code|app[_-]?id)'
  const redactionPlaceholder = '(?:REDACTED(?:_[A-Z]+)?|URL|REDACTED_USER)'

  return value
    .replace(
      new RegExp(
        `\\b${secretField}\\b["']?\\s*[:=]\\s*(?:"(?:\\\\.|[^"\\\\])*"|'(?:\\\\.|[^'\\\\])*'|(?!\\[${redactionPlaceholder}\\])[^\\s,;}\\]]+)`,
        'gi'
      ),
      (match) =>
        match.replace(
          /([:=])\s*(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|(?!\[(?:REDACTED(?:_[A-Z]+)?|URL|REDACTED_USER)\])[^\s,;}\]]+)$/i,
          '$1 [REDACTED]'
        )
    )
    .replace(/\bBearer\s+[A-Za-z0-9._~+\-/=]+/gi, 'Bearer [REDACTED]')
    .replace(/\bBasic\s+[A-Za-z0-9+/=]+/gi, 'Basic [REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, '[REDACTED_JWT]')
    .replace(/\b(?:sk|rk)-[A-Za-z0-9_-]{12,}\b/gi, '[REDACTED_KEY]')
    .replace(/\bAKIA[0-9A-Z]{16}\b/g, '[REDACTED_AWS_KEY]')
    .replace(/\bAIza[0-9A-Za-z_-]{20,}\b/g, '[REDACTED_GOOGLE_KEY]')
    .replace(
      /([?&#](?:api[_-]?key|access[_-]?key|secret[_-]?key|token|license(?:[_-]?key)?|x-api-key|x-chatbox-license)=)[^&#\s]+/gi,
      '$1[REDACTED]'
    )
    .replace(/((?:https?|wss?):\/\/)[^/\s?#@]+(?::[^/\s?#@]*)?@/gi, '$1[REDACTED]@')
    .replace(/\b(?:https?|wss?):\/\/[^\s<>"'`]+/gi, '[URL]')
    .replace(/((?:[A-Za-z]:)?\\Users\\)[^\\\s]+/gi, '$1[REDACTED_USER]')
    .replace(/(\/(?:Users|home)\/)[^/\s]+/gi, '$1[REDACTED_USER]')
}
