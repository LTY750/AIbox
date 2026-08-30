import { app, powerMonitor, safeStorage } from 'electron'
import Store from 'electron-store'
import * as fs from 'fs-extra'
import path from 'path'
import sanitizeFilename from 'sanitize-filename'
import * as defaults from '../shared/defaults'
import type { Config, Settings } from '../shared/types'
import { getLogger } from './util'

const logger = getLogger('store-node')

const configPath = path.resolve(app.getPath('userData'), 'config.json')
const configBackupFilenamePattern = /^config-backup-\d{4}-\d{2}-\d{2}T\d{2}_\d{2}_\d{2}\.\d{3}Z\.json$/

// 1) 检查配置文件是否合法
// 如果配置文件不合法，则使用最新的备份文件
if (fs.existsSync(configPath) && !checkConfigValid(configPath)) {
  logger.error('config.json is invalid.')
  const backups = getBackups()
  if (backups.length > 0) {
    // 不断尝试使用最新的备份文件，直到成功
    for (let i = backups.length - 1; i >= 0; i--) {
      const backup = backups[i]
      if (checkConfigValid(backup.filepath)) {
        fs.copySync(backup.filepath, configPath)
        logger.info('use backup:', backup.filepath)
        break
      }
    }
  }
}

// 2) 初始化store
interface StoreType {
  configVersion: number
  settings: Settings
  configs: Config
  secureSettings?: string
  lastShownAboutDialogVersion: string // 上次启动时自动弹出关于对话框的应用版本
}
export const store = new Store<StoreType>({
  clearInvalidConfig: true, // 当配置JSON不合法时，清空配置
})
logger.info('init store, config path:', store.path)

const SECURE_SETTINGS_STORE_KEY = 'secureSettings'
const BLOCKED_SETTINGS_PATH_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype'])
const SENSITIVE_SETTINGS_FIELDS = new Set([
  'apikey',
  'accesskey',
  'secretkey',
  'sessiontoken',
  'accesstoken',
  'refreshtoken',
  'apitoken',
  'secretcode',
  'licensekey',
  'licenseinstances',
  'lastselectedlicensebyuser',
  'vibedroppublishkey',
  'authorization',
])

interface SensitiveSettingEntry {
  path: string[]
  value: unknown
}

interface EncryptedSettingsPayload {
  version: 1
  entries: SensitiveSettingEntry[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isContainer(value: unknown): value is Record<string, unknown> | unknown[] {
  return Array.isArray(value) || isRecord(value)
}

function isArrayIndex(segment: string | undefined): boolean {
  return segment !== undefined && /^(0|[1-9]\d*)$/.test(segment)
}

function isSensitiveSettingsField(key: string, path: string[]): boolean {
  const normalized = key.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replaceAll('-', '').toLowerCase()
  if (SENSITIVE_SETTINGS_FIELDS.has(normalized)) return true
  return (
    path[0] === 'mcp' &&
    path[1] === 'servers' &&
    path.at(-1) === 'transport' &&
    (key === 'url' || key === 'headers')
  )
}

function splitSensitiveSettings(value: unknown, path: string[] = [], entries: SensitiveSettingEntry[] = []): unknown {
  if (Array.isArray(value)) {
    return value.map((item, index) => splitSensitiveSettings(item, [...path, String(index)], entries))
  }
  if (!isRecord(value)) return value

  const sanitized = Object.create(null) as Record<string, unknown>
  for (const [key, child] of Object.entries(value)) {
    if (isSensitiveSettingsField(key, path)) {
      entries.push({ path: [...path, key], value: structuredClone(child) })
      continue
    }
    sanitized[key] = splitSensitiveSettings(child, [...path, key], entries)
  }
  return sanitized
}

function setSafeSettingsPath(target: Record<string, unknown>, path: string[], value: unknown): void {
  if (path.length === 0 || path.some((segment) => BLOCKED_SETTINGS_PATH_SEGMENTS.has(segment))) return
  let cursor: Record<string, unknown> | unknown[] = target
  for (let index = 0; index < path.length - 1; index += 1) {
    const segment = path[index]
    const cursorRecord = cursor as Record<string, unknown>
    const child = Object.hasOwn(cursorRecord, segment) ? cursorRecord[segment] : undefined
    if (!isContainer(child)) {
      const next = (isArrayIndex(path[index + 1]) ? [] : Object.create(null)) as Record<string, unknown> | unknown[]
      Object.defineProperty(cursorRecord, segment, {
        configurable: true,
        enumerable: true,
        value: next,
        writable: true,
      })
      cursor = next
    } else {
      cursor = child
    }
  }
  const leaf = path[path.length - 1]
  if (leaf && !BLOCKED_SETTINGS_PATH_SEGMENTS.has(leaf)) {
    Object.defineProperty(cursor as Record<string, unknown>, leaf, {
      configurable: true,
      enumerable: true,
      value,
      writable: true,
    })
  }
}

function isSafeStorageAvailable(): boolean {
  try {
    return app.isReady() && safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

function encryptSettingsEntries(entries: SensitiveSettingEntry[]): string | undefined {
  if (entries.length === 0) return undefined
  if (!isSafeStorageAvailable()) {
    throw new Error('Electron secure storage is unavailable; settings were not saved.')
  }
  const payload: EncryptedSettingsPayload = { version: 1, entries }
  return safeStorage.encryptString(JSON.stringify(payload)).toString('base64')
}

function decryptSettingsEntries(encoded: string): SensitiveSettingEntry[] {
  if (!isSafeStorageAvailable()) {
    throw new Error('Electron secure storage is unavailable; settings cannot be read.')
  }
  const payload = JSON.parse(
    safeStorage.decryptString(Buffer.from(encoded, 'base64'))
  ) as Partial<EncryptedSettingsPayload>
  if (payload.version !== 1 || !Array.isArray(payload.entries)) {
    throw new Error('Encrypted settings payload is invalid.')
  }
  return payload.entries.filter(
    (entry): entry is SensitiveSettingEntry =>
      isRecord(entry) &&
      Array.isArray(entry.path) &&
      entry.path.every((segment) => typeof segment === 'string') &&
      !entry.path.some((segment) => BLOCKED_SETTINGS_PATH_SEGMENTS.has(segment))
  )
}

function restoreSensitiveSettings(settings: unknown, entries: SensitiveSettingEntry[]): unknown {
  if (!isRecord(settings)) return settings
  const restored = structuredClone(settings) as Record<string, unknown>
  for (const entry of entries) setSafeSettingsPath(restored, entry.path, structuredClone(entry.value))
  return restored
}

export function setStoreValue(key: string, value: unknown): void {
  if (key !== 'settings') {
    store.set(key, value)
    return
  }

  const entries: SensitiveSettingEntry[] = []
  const sanitized = splitSensitiveSettings(value, [], entries)
  const encrypted = encryptSettingsEntries(entries)
  store.set(key, sanitized)
  if (encrypted) store.set(SECURE_SETTINGS_STORE_KEY, encrypted)
  else store.delete(SECURE_SETTINGS_STORE_KEY)
}

export function getStoreValue(key: string): unknown {
  const value = store.get(key)
  if (key !== 'settings' || !isRecord(value)) return value

  const encrypted = store.get(SECURE_SETTINGS_STORE_KEY)
  if (typeof encrypted === 'string' && encrypted) {
    return restoreSensitiveSettings(value, decryptSettingsEntries(encrypted))
  }

  // Migrate settings written by pre-safeStorage versions as soon as the
  // Electron keychain is available. Do not create new plaintext settings.
  const entries: SensitiveSettingEntry[] = []
  const sanitized = splitSensitiveSettings(value, [], entries)
  if (entries.length > 0 && isSafeStorageAvailable()) {
    setStoreValue(key, value)
    return restoreSensitiveSettings(sanitized, entries)
  }
  if (entries.length > 0 && app.isReady()) {
    throw new Error('Electron secure storage is unavailable; settings cannot be read.')
  }
  return value
}

export function deleteStoreValue(key: string): void {
  store.delete(key as keyof StoreType)
  if (key === 'settings') store.delete(SECURE_SETTINGS_STORE_KEY)
}

export function getAllStoreValues(): Record<string, unknown> {
  const values = Object.create(null) as Record<string, unknown>
  for (const [key, value] of Object.entries(store.store)) {
    if (key === SECURE_SETTINGS_STORE_KEY) continue
    values[key] = key === 'settings' ? splitSensitiveSettings(value) : value
  }
  return values
}

export function getAllStoreKeys(): string[] {
  return Object.keys(store.store).filter((key) => key !== SECURE_SETTINGS_STORE_KEY)
}

export function setAllStoreValues(values: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(values)) {
    if (key === SECURE_SETTINGS_STORE_KEY) continue
    setStoreValue(key, value)
  }
}

// 3) 启动自动备份，每10分钟备份一次，并自动清理多余的备份文件
autoBackup()
let autoBackupTimer = setInterval(autoBackup, 10 * 60 * 1000)
powerMonitor.on('resume', () => {
  clearInterval(autoBackupTimer)
  autoBackupTimer = setInterval(autoBackup, 10 * 60 * 1000)
})
powerMonitor.on('suspend', () => {
  clearInterval(autoBackupTimer)
})
async function autoBackup() {
  try {
    if (needBackup()) {
      const filename = await backup()
      if (filename) {
        logger.info('auto backup:', filename)
      }
    }
    await clearBackups()
  } catch (err) {
    logger.error('auto backup error:', err)
  }
}

export function getSettings(): Settings {
  return (getStoreValue('settings') as Settings | undefined) ?? defaults.settings()
}

export function getConfig(): Config {
  let configs = store.get<'configs'>('configs')
  if (!configs) {
    configs = defaults.newConfigs()
    store.set<'configs'>('configs', configs)
  }
  return configs
}

/**
 * 备份配置文件
 */
export async function backup() {
  if (!fs.existsSync(configPath)) {
    logger.error('skip backup because config.json does not exist.')
    return
  }
  if (!checkConfigValid(configPath)) {
    logger.error('skip backup because config.json is invalid.')
    return
  }
  const now = new Date().toISOString().replace(/:/g, '_')
  const backupPath = path.resolve(app.getPath('userData'), `config-backup-${now}.json`)
  try {
    await fs.copy(configPath, backupPath)
  } catch (err) {
    logger.error('Failed to backup config:', err)
    return
  }
  logger.info('backup config to:', backupPath)
  return backupPath
}

/**
 * 获取所有备份文件，并按照时间排序
 * @returns 备份文件信息
 */
export function getBackups() {
  const filenames = fs.readdirSync(app.getPath('userData'))
  const backupFilenames = filenames.filter((filename) => filename.startsWith('config-backup-'))
  if (backupFilenames.length === 0) {
    return []
  }
  let backupFileInfos = backupFilenames
    .filter((filename) => {
      if (!configBackupFilenamePattern.test(filename)) {
        logger.warn('Ignoring invalid config backup filename:', filename)
        return false
      }
      return true
    })
    .map((filename) => {
      let dateStr = filename.replace('config-backup-', '').replace('.json', '')
      dateStr = dateStr.replace(/_/g, ':')
      const date = new Date(dateStr)
      return {
        filename,
        filepath: path.resolve(app.getPath('userData'), filename),
        dateMs: date.getTime() || 0,
      }
    })
  backupFileInfos = backupFileInfos.sort((a, b) => a.dateMs - b.dateMs)
  return backupFileInfos
}

/**
 * 检查是否需要备份
 * @returns 是否需要备份
 */
export function needBackup() {
  const backups = getBackups()
  if (backups.length === 0) {
    return true
  }
  const lastBackup = backups[backups.length - 1]
  return lastBackup.dateMs < Date.now() - 10 * 60 * 1000 // 10分钟备份一次
}

/**
 * 清理备份文件：
 * 1. 对于今天和昨天，每小时保留最后一份备份。
 * 2. 对于昨天之前的 28 天内（即 3 天前到 30 天前），每天保留最后一份备份。
 * 3. 删除 30 天前的所有备份。
 */
export async function clearBackups() {
  const backups = getBackups() // Already sorted ascending by dateMs
  if (backups.length === 0) {
    return
  }

  const now = new Date()
  const todayStartMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const yesterdayStartMs = todayStartMs - 24 * 60 * 60 * 1000
  const thirtyDaysAgoStartMs = todayStartMs - 30 * 24 * 60 * 60 * 1000

  const backupsToDelete: { filename: string; filepath: string }[] = []
  const keptHourlyBackups: { [hourKey: string]: { filename: string; filepath: string } } = {} // Key: YYYY-MM-DD-HH
  const keptDailyBackups: { [dateKey: string]: { filename: string; filepath: string } } = {} // Key: YYYY-MM-DD

  for (const backup of backups) {
    const backupDate = new Date(backup.dateMs)
    const dateKey = backupDate.toISOString().slice(0, 10) // YYYY-MM-DD
    const hourKey = `${dateKey}-${backupDate.toISOString().slice(11, 13)}` // YYYY-MM-DD-HH

    if (backup.dateMs < thirtyDaysAgoStartMs) {
      // Older than 30 days: mark for deletion
      backupsToDelete.push({ filename: backup.filename, filepath: backup.filepath })
    } else if (backup.dateMs < yesterdayStartMs) {
      // Between 30 days ago and yesterday (exclusive): keep latest per day
      const existingKept = keptDailyBackups[dateKey]
      if (existingKept) {
        // A backup for this day was already kept; mark the older one for deletion
        backupsToDelete.push(existingKept)
      }
      // Keep the current one (it's the latest encountered for this day so far)
      keptDailyBackups[dateKey] = { filename: backup.filename, filepath: backup.filepath }
    } else {
      // Today or yesterday: keep latest per hour
      const existingKept = keptHourlyBackups[hourKey]
      if (existingKept) {
        // A backup for this hour was already kept; mark the older one for deletion
        backupsToDelete.push(existingKept)
      }
      // Keep the current one (it's the latest encountered for this hour so far)
      keptHourlyBackups[hourKey] = { filename: backup.filename, filepath: backup.filepath }
    }
  }

  // Perform the actual deletions
  if (backupsToDelete.length > 0) {
    logger.info(`Clearing ${backupsToDelete.length} old backup(s)...`)
    try {
      await Promise.all(
        backupsToDelete.map(async (backup) => {
          if (!configBackupFilenamePattern.test(backup.filename)) {
            logger.warn('Skip deleting invalid config backup filename:', backup.filename)
            return
          }
          const expectedPath = path.resolve(app.getPath('userData'), backup.filename)
          if (backup.filepath !== expectedPath) {
            logger.warn('Skip deleting config backup with unexpected path:', backup.filepath)
            return
          }
          const stat = await fs.stat(backup.filepath).catch(() => null)
          if (!stat?.isFile()) {
            logger.warn('Skip deleting config backup because it is not a file:', backup.filepath)
            return
          }
          await fs.unlink(backup.filepath)
          // logger.info('clear backup:', backup.filename) // Log per file might be too verbose
        })
      )
      logger.info('Finished clearing old backups.')
    } catch (err) {
      logger.error('Failed to clear some backups:', err)
    }
  }
}

/**
 * 检查配置文件是否是合法的JSON文件
 * @returns 配置文件是否合法
 */
function checkConfigValid(filepath: string) {
  try {
    JSON.parse(fs.readFileSync(filepath, 'utf8'))
  } catch (err) {
    return false
  }
  return true
}

export async function getStoreBlob(key: string) {
  const filename = path.resolve(app.getPath('userData'), 'chatbox-blobs', sanitizeFilename(key))
  const exists = await fs.pathExists(filename)
  if (!exists) {
    return null
  }
  return fs.readFile(filename, { encoding: 'utf-8' })
}

export async function setStoreBlob(key: string, value: string) {
  const filename = path.resolve(app.getPath('userData'), 'chatbox-blobs', sanitizeFilename(key))
  await fs.ensureDir(path.dirname(filename))
  return fs.writeFile(filename, value, { encoding: 'utf-8' })
}

export async function delStoreBlob(key: string) {
  const filename = path.resolve(app.getPath('userData'), 'chatbox-blobs', sanitizeFilename(key))
  const exists = await fs.pathExists(filename)
  if (!exists) {
    return
  }
  await fs.remove(filename)
}

export async function listStoreBlobKeys() {
  const dir = path.resolve(app.getPath('userData'), 'chatbox-blobs')
  const exists = await fs.pathExists(dir)
  if (!exists) {
    return []
  }
  return fs.readdir(dir)
}
