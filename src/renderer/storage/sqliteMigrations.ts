import type { SQLiteDBConnection } from '@capacitor-community/sqlite'

/**
 * Versioned schema migrations for the mobile SQLite databases.
 *
 * Each database name maps to an ordered list of migrations. Versions must be
 * consecutive integers starting at 1. The current schema version is tracked
 * with SQLite's `PRAGMA user_version` (stored in the database header, and
 * rolled back with its transaction when a migration fails).
 *
 * Migrations are written to be idempotent against already-deployed databases
 * (whose `user_version` is 0 because the previous ad-hoc schema code never
 * set it), so column additions check `PRAGMA table_info` before altering.
 */
export interface SQLiteMigration {
  version: number
  name: string
  up: (db: SQLiteDBConnection) => Promise<void>
}

async function addColumnsIfMissing(
  db: SQLiteDBConnection,
  table: string,
  columns: Record<string, string>
): Promise<void> {
  const tableInfo = await db.query(`PRAGMA table_info(${table})`)
  const existing = new Set<string>()
  for (const row of tableInfo.values ?? []) {
    if (row && typeof row.name === 'string') existing.add(row.name)
  }
  for (const [column, definition] of Object.entries(columns)) {
    if (!existing.has(column)) {
      await db.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`, false)
    }
  }
}

const chatboxDbMigrations: SQLiteMigration[] = [
  {
    version: 1,
    name: 'create_key_value_table',
    up: async (db) => {
      await db.execute('CREATE TABLE IF NOT EXISTS key_value (key TEXT PRIMARY KEY NOT NULL, value TEXT)', false)
    },
  },
]

const credentialsDbMigrations: SQLiteMigration[] = [
  {
    version: 1,
    name: 'create_key_value_table',
    up: async (db) => {
      await db.execute(
        'CREATE TABLE IF NOT EXISTS key_value (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)',
        false
      )
    },
  },
]

const sessionMetaDbMigrations: SQLiteMigration[] = [
  {
    version: 1,
    name: 'create_session_meta_table',
    up: async (db) => {
      await db.execute(
        `CREATE TABLE IF NOT EXISTS session_meta (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL DEFAULT '',
          starred INTEGER NOT NULL DEFAULT 0,
          hidden INTEGER NOT NULL DEFAULT 0,
          assistant_avatar_key TEXT,
          pic_url TEXT,
          background_image TEXT,
          type TEXT,
          sort_order REAL NOT NULL,
          created_at INTEGER NOT NULL
        )`,
        false
      )
      await db.execute('CREATE INDEX IF NOT EXISTS idx_session_meta_sort_order ON session_meta(sort_order DESC)', false)
    },
  },
  {
    version: 2,
    name: 'add_archived_at_column',
    up: async (db) => {
      await addColumnsIfMissing(db, 'session_meta', { archived_at: 'INTEGER' })
    },
  },
]

const imageGenerationDbMigrations: SQLiteMigration[] = [
  {
    version: 1,
    name: 'create_image_generation_table',
    up: async (db) => {
      await db.execute(
        `CREATE TABLE IF NOT EXISTS image_generation (
          id TEXT PRIMARY KEY NOT NULL,
          prompt TEXT NOT NULL,
          reference_images TEXT NOT NULL DEFAULT '[]',
          generated_images TEXT NOT NULL DEFAULT '[]',
          created_at INTEGER NOT NULL,
          model_provider TEXT NOT NULL,
          model_id TEXT NOT NULL,
          dalle_style TEXT,
          image_generate_num INTEGER,
          status TEXT NOT NULL,
          parent_id TEXT,
          error TEXT,
          error_code TEXT
        )`,
        false
      )
      await db.execute(
        'CREATE INDEX IF NOT EXISTS idx_image_generation_created_at ON image_generation(created_at DESC)',
        false
      )
    },
  },
  {
    version: 2,
    name: 'add_image_generation_columns',
    up: async (db) => {
      await addColumnsIfMissing(db, 'image_generation', {
        generated_image_thumbnails: 'TEXT',
        error_item_uuid: 'TEXT',
        task_id: 'TEXT',
        aspect_ratio: 'TEXT',
        source: 'TEXT',
      })
    },
  },
]

const MIGRATIONS_BY_DATABASE: Record<string, SQLiteMigration[]> = {
  'chatbox.db': chatboxDbMigrations,
  'chatbox-credentials.db': credentialsDbMigrations,
  'chatbox-session-meta': sessionMetaDbMigrations,
  'chatbox-image-generation': imageGenerationDbMigrations,
}

export function getMigrationsForDatabase(databaseName: string): SQLiteMigration[] {
  return MIGRATIONS_BY_DATABASE[databaseName] ?? []
}

async function readUserVersion(db: SQLiteDBConnection): Promise<number> {
  const result = await db.query('PRAGMA user_version')
  const first = result.values?.[0]
  const raw = first && typeof first === 'object' ? first.user_version : first
  const version = Number(raw)
  return Number.isInteger(version) && version >= 0 ? version : 0
}

/** Applies pending migrations for a database, advancing PRAGMA user_version. */
export async function runMigrations(db: SQLiteDBConnection, databaseName: string): Promise<void> {
  await applyMigrations(db, databaseName, getMigrationsForDatabase(databaseName))
}

export async function applyMigrations(
  db: SQLiteDBConnection,
  databaseName: string,
  migrations: SQLiteMigration[]
): Promise<void> {
  if (migrations.length === 0) return

  const sorted = [...migrations].sort((a, b) => a.version - b.version)
  sorted.forEach((migration, index) => {
    if (migration.version !== index + 1) {
      throw new Error(
        `Migration versions for database "${databaseName}" must be consecutive integers starting at 1 (found ${migration.version} at position ${index + 1})`
      )
    }
  })

  const current = await readUserVersion(db)
  const pending = sorted.filter((migration) => migration.version > current)
  for (const migration of pending) {
    await db.beginTransaction()
    try {
      await migration.up(db)
      await db.execute(`PRAGMA user_version = ${migration.version}`, false)
      await db.commitTransaction()
    } catch (error) {
      await db.rollbackTransaction().catch(() => undefined)
      throw error
    }
  }
}
