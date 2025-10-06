import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'
import { join } from 'path'

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null

export const getDb = () => {
    if (_db) {
        return _db
    }

    const dbPath = process.env.DATABASE_PATH || join(process.cwd(), 'var', 'http-inspector.sqlite')
    const sqlite = new Database(dbPath)

    sqlite.pragma('journal_mode = WAL')
    sqlite.pragma('foreign_keys = ON')
    _db = drizzle(sqlite, { schema })
    console.debug('Database connected:', dbPath)
    return _db
}

export const closeDb = () => {
    if (!_db) {
        return
    }
    // Accessing internal client to close the database
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (_db as any).$client.close()
    _db = null
    console.log('Database closed')
}

export { schema }
