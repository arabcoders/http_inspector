import { getDb } from '../db'
import { sessions, tokens, requests } from '../db/schema'
import { lt, sql } from 'drizzle-orm'

// TTL values (in days)
const SESSION_TTL_DAYS = 30
const TOKEN_TTL_DAYS = 30
const REQUEST_TTL_DAYS = 7

export const cleanupExpiredData = async () => {
  const db = getDb()

  console.debug('Starting database cleanup...')

  const now = new Date()

  // Calculate cutoff dates
  const sessionCutoff = new Date(now.getTime() - SESSION_TTL_DAYS * 24 * 60 * 60 * 1000)
  const tokenCutoff = new Date(now.getTime() - TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000)
  const requestCutoff = new Date(now.getTime() - REQUEST_TTL_DAYS * 24 * 60 * 60 * 1000)

  // Delete old requests (oldest first to free up space)
  const deletedRequests = await db
    .delete(requests)
    .where(lt(requests.createdAt, requestCutoff))
    .returning({ id: requests.id })

  console.debug(`Deleted ${deletedRequests.length} old requests`)

  // Delete old tokens (cascade will not delete requests as they were already handled)
  const deletedTokens = await db
    .delete(tokens)
    .where(lt(tokens.createdAt, tokenCutoff))
    .returning({ id: tokens.id })

  console.debug(`Deleted ${deletedTokens.length} old tokens`)

  // Delete old sessions based on lastAccessedAt (cascade will delete associated tokens and requests)
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
