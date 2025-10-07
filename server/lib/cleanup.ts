import { getDb } from '../db'
import { sessions, tokens, requests } from '../db/schema'
import { lt, sql, isNotNull } from 'drizzle-orm'
import { useFileStorage } from './file-storage'
import { readdir, stat } from 'fs/promises'
import { join } from 'path'

// TTL values (in days)
const SESSION_TTL_DAYS = 30
const TOKEN_TTL_DAYS = 30
const REQUEST_TTL_DAYS = 7

/**
 * Clean up orphaned files that are not referenced in the database
 * 
 * Scans the file storage directory and removes files that don't have
 * corresponding database entries. This handles cases where:
 * - Database cleanup failed to delete files
 * - Manual database deletions were performed
 * - File writes succeeded but database inserts failed
 * 
 * @param dbFile Optional database file path for testing
 * @param filesPath Optional files storage path for testing
 */
export const cleanupOrphanedFiles = async (dbFile?: string, filesPath?: string) => {
  const db = getDb(dbFile)
  const storage = useFileStorage(filesPath)

  console.debug('Starting orphaned files cleanup...')

  const storageDir = storage.getStorageDir()
  let deletedFiles = 0
  let scannedFiles = 0

  try {
    // Get all sessions from the file system
    const sessionDirs = await readdir(storageDir)

    for (const sessionId of sessionDirs) {
      const sessionPath = join(storageDir, sessionId)
      const sessionStat = await stat(sessionPath)

      if (false === sessionStat.isDirectory()) {
        continue
      }

      // Check if session exists in database
      const sessionExists = await db
        .select({ id: sessions.id })
        .from(sessions)
        .where(sql`${sessions.id} = ${sessionId}`)
        .limit(1)

      if (0 === sessionExists.length) {
        // Session doesn't exist in DB - delete entire session directory
        console.debug(`Deleting orphaned session directory: ${sessionId}`)
        await storage.deleteSession(sessionId)
        continue
      }

      // Session exists, check tokens
      const tokenDirs = await readdir(sessionPath)

      for (const tokenId of tokenDirs) {
        const tokenPath = join(sessionPath, tokenId)
        const tokenStat = await stat(tokenPath)

        if (false === tokenStat.isDirectory()) {
          continue
        }

        // Check if token exists in database
        const tokenExists = await db
          .select({ id: tokens.id })
          .from(tokens)
          .where(sql`${tokens.id} = ${tokenId}`)
          .limit(1)

        if (0 === tokenExists.length) {
          // Token doesn't exist in DB - delete entire token directory
          console.debug(`Deleting orphaned token directory: ${sessionId}/${tokenId}`)
          await storage.deleteToken(sessionId, tokenId)
          continue
        }

        // Token exists, check individual request files
        const requestFiles = await readdir(tokenPath)

        for (const filename of requestFiles) {
          scannedFiles++

          // Extract request ID from filename (e.g., "uuid.bin" -> "uuid")
          if (false === filename.endsWith('.bin')) {
            continue
          }

          const requestId = filename.slice(0, -4) // Remove .bin extension
          const relativePath = join(sessionId, tokenId, filename)

          // Check if request exists in database
          const requestExists = await db
            .select({ id: requests.id })
            .from(requests)
            .where(sql`${requests.id} = ${requestId}`)
            .limit(1)

          if (0 === requestExists.length) {
            // Request doesn't exist in DB - delete the file
            console.debug(`Deleting orphaned request file: ${relativePath}`)
            await storage.delete(relativePath)
            deletedFiles++
          }
        }
      }
    }

    console.debug(`Orphaned files cleanup complete: scanned ${scannedFiles} files, deleted ${deletedFiles} orphaned files`)

    return {
      scannedFiles,
      deletedFiles,
    }
  } catch (error) {
    console.error('[Cleanup] Error during orphaned files cleanup:', error)
    return {
      scannedFiles,
      deletedFiles,
    }
  }
}

export const cleanupExpiredData = async (dbFile?: string, filesPath?: string) => {
  const db = getDb(dbFile)
  const storage = useFileStorage(filesPath)

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

  // Clean up orphaned files
  const orphanedResult = await cleanupOrphanedFiles(dbFile, filesPath)

  return {
    deletedRequests: deletedRequests.length,
    deletedTokens: deletedTokens.length,
    deletedSessions: deletedSessions.length,
    orphanedFiles: orphanedResult.deletedFiles,
    scannedFiles: orphanedResult.scannedFiles,
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
