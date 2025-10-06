import { getDb } from '../db'
import { sessions, tokens, requests } from '../db/schema'
import { lt, sql, isNotNull } from 'drizzle-orm'
import { useFileStorage } from './file-storage'

// TTL values (in days)
const SESSION_TTL_DAYS = 30
const TOKEN_TTL_DAYS = 30
const REQUEST_TTL_DAYS = 7

export const cleanupExpiredData = async () => {
  const db = getDb()
  const storage = useFileStorage()

  console.debug('Starting database cleanup...')

  const now = new Date()

  // Calculate cutoff dates
  const sessionCutoff = new Date(now.getTime() - SESSION_TTL_DAYS * 24 * 60 * 60 * 1000)
  const tokenCutoff = new Date(now.getTime() - TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000)
  const requestCutoff = new Date(now.getTime() - REQUEST_TTL_DAYS * 24 * 60 * 60 * 1000)

  // Delete old request body files first (before deleting request records)
  const oldRequestsWithBodies = await db
    .select({ id: requests.id, bodyPath: requests.bodyPath })
    .from(requests)
    .where(sql`${lt(requests.createdAt, requestCutoff)} AND ${isNotNull(requests.bodyPath)}`)

  console.debug(`Found ${oldRequestsWithBodies.length} old request bodies to delete`)

  for (const record of oldRequestsWithBodies) {
    if (record.bodyPath) {
      await storage.delete(record.bodyPath)
    }
  }

  const deletedRequests = await db
    .delete(requests)
    .where(lt(requests.createdAt, requestCutoff))
    .returning({ id: requests.id })

  console.debug(`Deleted ${deletedRequests.length} old requests`)

  const deletedTokens = await db
    .delete(tokens)
    .where(lt(tokens.createdAt, tokenCutoff))
    .returning({ id: tokens.id })

  console.debug(`Deleted ${deletedTokens.length} old tokens`)

  const deletedSessions = await db
    .delete(sessions)
    .where(lt(sessions.lastAccessedAt, sessionCutoff))
    .returning({ id: sessions.id })

  console.debug(`Deleted ${deletedSessions.length} inactive sessions`)

  // Run VACUUM to reclaim space (SQLite specific)
  db.run(sql`VACUUM`)

  console.debug('Database cleanup complete')

  return {
    deletedRequests: deletedRequests.length,
    deletedTokens: deletedTokens.length,
    deletedSessions: deletedSessions.length,
  }
}

if (process.argv[1]?.includes('cleanup') || process.argv[1]?.includes('cleanup')) {
  cleanupExpiredData().then((result) => {
    console.log('Cleanup result:', result)
    process.exit(0)
  }).catch((error) => {
    console.error('Cleanup failed:', error)
    process.exit(1)
  })
}
