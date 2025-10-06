import { runMigrations } from '../db/migrate'

/**
 * Nitro plugin that runs database migrations on server startup
 * This ensures the database schema is always up to date before handling requests
 */
export default defineNitroPlugin(async () => {
  try {
    console.log('[Migrations] Running database migrations...')
    await runMigrations()
    console.log('[Migrations] Database migrations completed successfully')
  } catch (error) {
    console.error('[Migrations] Failed to run database migrations:', error)
    // Don't throw - allow server to start even if migrations fail
    // This prevents startup failures if migrations are already applied
    console.warn('[Migrations] Server will continue despite migration errors')
  }
})
