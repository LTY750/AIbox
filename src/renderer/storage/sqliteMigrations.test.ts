import type { SQLiteDBConnection } from '@capacitor-community/sqlite'
import { describe, expect, it } from 'vitest'
import { applyMigrations, getMigrationsForDatabase, runMigrations } from './sqliteMigrations'

function fakeDb(initialVersion: number, failOnCreate = false) {
  const executed: string[] = []
  let userVersion = initialVersion
  let transactionDepth = 0
  const db = {
    query: (statement: string) => {
      if (statement.trim().toLowerCase() === 'pragma user_version') {
        return Promise.resolve({ values: [{ user_version: userVersion }] })
      }
      return Promise.resolve({ values: [] })
    },
    execute: (statement: string) => {
      if (failOnCreate && statement.toUpperCase().includes('CREATE TABLE')) {
        throw new Error('boom')
      }
      executed.push(statement)
      const match = /^pragma user_version\s*=\s*(\d+)/i.exec(statement)
      if (match) userVersion = Number(match[1])
      return Promise.resolve({ changes: { changes: 0 } })
    },
    beginTransaction: () => {
      transactionDepth += 1
      return Promise.resolve({ changes: { changes: 0 } })
    },
    commitTransaction: () => {
      transactionDepth -= 1
      return Promise.resolve({ changes: { changes: 0 } })
    },
    rollbackTransaction: () => {
      transactionDepth -= 1
      return Promise.resolve({ changes: { changes: 0 } })
    },
  }
  return {
    db: db as unknown as SQLiteDBConnection,
    executed,
    getUserVersion: () => userVersion,
    getTransactionDepth: () => transactionDepth,
  }
}

describe('sqliteMigrations', () => {
  it('maps every mobile database to its migrations', () => {
    expect(getMigrationsForDatabase('chatbox.db').map((m) => m.version)).toEqual([1])
    expect(getMigrationsForDatabase('chatbox-credentials.db').map((m) => m.version)).toEqual([1])
    expect(getMigrationsForDatabase('chatbox-session-meta').map((m) => m.version)).toEqual([1, 2])
    expect(getMigrationsForDatabase('chatbox-image-generation').map((m) => m.version)).toEqual([1, 2])
    expect(getMigrationsForDatabase('unknown.db')).toEqual([])
  })

  it('applies pending migrations in order and advances user_version', async () => {
    const { db, executed, getUserVersion } = fakeDb(0)
    await runMigrations(db, 'chatbox.db')
    expect(executed.some((s) => s.includes('CREATE TABLE IF NOT EXISTS key_value'))).toBe(true)
    expect(getUserVersion()).toBe(1)
  })

  it('creates the credentials schema through the migration runner', async () => {
    const { db, executed, getUserVersion } = fakeDb(0)
    await runMigrations(db, 'chatbox-credentials.db')
    expect(executed.some((s) => s.includes('CREATE TABLE IF NOT EXISTS key_value') && s.includes('NOT NULL'))).toBe(
      true
    )
    expect(getUserVersion()).toBe(1)
  })

  it('applies multi-version migrations sequentially', async () => {
    const { db, executed, getUserVersion } = fakeDb(0)
    await runMigrations(db, 'chatbox-session-meta')
    expect(executed.some((s) => s.includes('CREATE TABLE IF NOT EXISTS session_meta'))).toBe(true)
    expect(executed.some((s) => s.includes('ALTER TABLE session_meta ADD COLUMN archived_at'))).toBe(true)
    expect(getUserVersion()).toBe(2)
  })

  it('creates and extends the image generation schema through migrations', async () => {
    const { db, executed, getUserVersion } = fakeDb(0)
    await runMigrations(db, 'chatbox-image-generation')
    expect(executed.some((s) => s.includes('CREATE TABLE IF NOT EXISTS image_generation'))).toBe(true)
    expect(executed.some((s) => s.includes('ALTER TABLE image_generation ADD COLUMN source TEXT'))).toBe(true)
    expect(getUserVersion()).toBe(2)
  })

  it('is a no-op when already at the latest version', async () => {
    const { db, executed } = fakeDb(2)
    await runMigrations(db, 'chatbox-session-meta')
    expect(executed).toEqual([])
  })

  it('applies only migrations above the current version', async () => {
    const migrations = [
      { version: 1, name: 'one', up: async () => {} },
      { version: 2, name: 'two', up: async () => {} },
    ]
    const { db, executed, getUserVersion } = fakeDb(1)
    await applyMigrations(db, 'chatbox.db', migrations)
    expect(executed.filter((s) => s.includes('PRAGMA user_version'))).toEqual(['PRAGMA user_version = 2'])
    expect(getUserVersion()).toBe(2)
  })

  it('rejects non-consecutive versions', async () => {
    const migrations = [
      { version: 1, name: 'one', up: async () => {} },
      { version: 3, name: 'three', up: async () => {} },
    ]
    await expect(applyMigrations(fakeDb(0).db, 'chatbox.db', migrations)).rejects.toThrow(
      /must be consecutive integers starting at 1/
    )
  })

  it('rolls back and rethrows when a migration fails', async () => {
    const { db, getTransactionDepth, getUserVersion } = fakeDb(0, true)
    await expect(runMigrations(db, 'chatbox.db')).rejects.toThrow('boom')
    expect(getTransactionDepth()).toBe(0)
    expect(getUserVersion()).toBe(0)
  })
})
