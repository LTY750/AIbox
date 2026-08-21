import { isTextFilePath } from '../../../shared/file-extensions'
import type { DocumentParserConfig, DocumentParserType } from '../../../shared/types/settings'
import { getLogger } from '../../util'
import { LlamaParseParser } from './llamaparse-parser'
import { LocalParser } from './local-parser'
import { MineruParser } from './mineru-parser'
import { TextInParser } from './textin-parser'
import type { DocumentParser, ParserFileMeta, ParserResult } from './types'

const log = getLogger('knowledge-base:parser-router')

export { MineruParser, testMineruConnection } from './mineru-parser'
export { TextInParser } from './textin-parser'
export * from './types'

/**
 * Create a parser instance based on configuration
 * @param config - Parser configuration
 * @param kbId - Knowledge base ID (required for local parser's vision model)
 */
export function createParser(config: DocumentParserConfig, kbId?: number): DocumentParser {
  switch (config.type) {
    case 'local':
      return new LocalParser(kbId)
    case 'llamaparse':
      if (!config.llamaParse?.apiKey) {
        throw new Error('LlamaParse API key is required')
      }
      return new LlamaParseParser(config.llamaParse.apiKey)
    case 'mineru':
      if (!config.mineru?.apiToken) {
        throw new Error('MinerU API token is required')
      }
      return new MineruParser(config.mineru.apiToken)
    case 'textin':
      if (!config.textin?.appId || !config.textin.secretCode) {
        throw new Error('TextIn App ID and Secret Code are required')
      }
      return new TextInParser(config.textin.appId, config.textin.secretCode)
    default:
      log.warn(`Unknown parser type: ${config.type}, falling back to local parser`)
      return new LocalParser(kbId)
  }
}

/**
 * Get effective parser configuration
 * Priority: KB config > Global config > Default (local)
 */
export function getEffectiveParserConfig(
  kbConfig?: DocumentParserConfig | null,
  globalConfig?: DocumentParserConfig | null
): DocumentParserConfig {
  if (kbConfig) {
    return kbConfig
  }
  if (globalConfig) {
    return globalConfig
  }
  return { type: 'local' }
}

/**
 * Parse a file using the appropriate parser
 * Text files always use local parsing for efficiency
 *
 * @param filePath - Path to the file
 * @param meta - File metadata
 * @param config - Parser configuration
 * @param kbId - Knowledge base ID (for vision model access)
 * @returns Parsed content and parser type used
 */
export async function parseFileWithRouter(
  filePath: string,
  meta: ParserFileMeta,
  config: DocumentParserConfig,
  kbId?: number
): Promise<ParserResult> {
  const localParser = new LocalParser(kbId)

  // LlamaParse is a fallback, not the first choice. This keeps ordinary text,
  // Office files, EPUBs, and images on-device whenever the local parser can
  // handle them, while still covering formats unsupported by the device.
  if (config.type === 'llamaparse') {
    try {
      log.debug(`[ROUTER] Trying local parser before LlamaParse: ${meta.filename}`)
      const content = await localParser.parse(filePath, meta)
      if (content.trim()) {
        return { content, parserUsed: 'local' }
      }
      log.warn(`[ROUTER] Local parser returned empty content, falling back to LlamaParse: ${meta.filename}`)
    } catch (error) {
      log.warn(`[ROUTER] Local parser failed, falling back to LlamaParse: ${meta.filename}`, error)
    }

    const content = await createParser(config, kbId).parse(filePath, meta)
    return { content, parserUsed: 'llamaparse' }
  }

  // Text files stay local even when another cloud parser is selected. This is
  // fast, private, and avoids uploading content that needs no remote parsing.
  if (isTextFilePath(filePath)) {
    log.debug(`[ROUTER] Using local parser for text file: ${meta.filename}`)
    const content = await localParser.parse(filePath, meta)
    return { content, parserUsed: 'local' }
  }

  log.debug(`[ROUTER] Using ${config.type} parser for: ${meta.filename}`)
  const content = await createParser(config, kbId).parse(filePath, meta)
  return { content, parserUsed: config.type }
}

/**
 * Get display name for parser type
 */
export function getParserDisplayName(type: DocumentParserType): string {
  switch (type) {
    case 'local':
      return 'Local'
    case 'llamaparse':
      return 'LlamaParse (local first)'
    case 'mineru':
      return 'MinerU'
    case 'textin':
      return 'TextIn XParse'
    default:
      return type
  }
}
