import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate as drizzleMigrate } from 'drizzle-orm/better-sqlite3/migrator'
import { join } from 'path'

export async function runMigrations(dbFile?: string): Promise<void> {
  const storagePath = process.env.STORAGE_PATH || process.cwd() + '/var'
  const dbPath = dbFile || join(storagePath, 'inspector.sqlite')
  const migrationsPath = join(process.cwd(), 'migrations')

  console.debug('Running migrations...')
  console.debug('Database:', dbPath)
  console.debug('Migrations:', migrationsPath)

  const sqlite = new Database(dbPath)
  const db = drizzle(sqlite)

  drizzleMigrate(db, { migrationsFolder: migrationsPath })
  sqlite.close()
}

if (process.argv[1]?.includes('migrate') || process.argv[1]?.includes('migrate')) {
  runMigrations().then(() => {
    console.log('Migration finished successfully')
    process.exit(0)
  }).catch(e => {
    console.error('Migration failed:', e)
    process.exit(1)
  })
}
