import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from '@capacitor-community/sqlite'

// Keep one JS-side connection registry for the whole WebView. Creating a new
// SQLiteConnection per storage class loses the plugin's connection bookkeeping
// and makes concurrent open/close calls race on the same native database.
const sqlite = new SQLiteConnection(CapacitorSQLite)
const connectionPromises = new Map<string, Promise<SQLiteDBConnection>>()

export function getSharedSQLiteDatabase(databaseName: string, version: number): Promise<SQLiteDBConnection> {
  const existing = connectionPromises.get(databaseName)
  if (existing) return existing

  const promise = (async () => {
    let database: SQLiteDBConnection
    const result = await sqlite.isConnection(databaseName, false)
    if (result.result) {
      database = await sqlite.retrieveConnection(databaseName, false)
      if (!(await database.isDBOpen()).result) {
        await database.open()
      }
      return database
    }

    database = await sqlite.createConnection(databaseName, false, 'no-encryption', version, false)
    await database.open()
    return database
  })().catch(async (error) => {
    try {
      const isConnection = await sqlite.isConnection(databaseName, false)
      if (isConnection.result) await sqlite.closeConnection(databaseName, false)
    } catch {
      // Preserve the original open/create error.
    }
    connectionPromises.delete(databaseName)
    throw error
  })

  connectionPromises.set(databaseName, promise)
  return promise
}

export function resetSharedSQLiteConnectionsForTests(): void {
  connectionPromises.clear()
}
