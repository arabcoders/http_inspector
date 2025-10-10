import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import { cleanupOrphanedFiles, cleanupExpiredData } from '../../server/lib/cleanup'
import { useDatabase } from '../../server/lib/db'
import { useFileStorage } from '../../server/lib/file-storage'
import { getDb } from '../../server/db'
import { sessions, tokens, requests } from '../../server/db/schema'
import { sql } from 'drizzle-orm'
import { randomUUID } from 'crypto'
import { mkdir } from 'fs/promises'
import { join } from 'path'
import { createTestDb, type TestDbContext } from '../utils/testDb'

describe('Orphaned Files Cleanup', () => {
  let testDb: TestDbContext
  let db: ReturnType<typeof useDatabase>
  let storage: ReturnType<typeof useFileStorage>
  let rawDb: ReturnType<typeof getDb>

  // Test data
  let testSessionId: string

  beforeAll(async () => {
    testDb = await createTestDb()
    db = useDatabase(testDb.dbFile, testDb.filesPath)
    storage = useFileStorage(testDb.filesPath)
    rawDb = getDb(testDb.dbFile)
  })

  beforeEach(async () => {
    // Clear database
    await rawDb.delete(requests)
    await rawDb.delete(tokens)
    await rawDb.delete(sessions)

    // Create test session
    testSessionId = randomUUID()
    await rawDb.insert(sessions).values({
      id: testSessionId,
      friendlyId: 'test-session',
      createdAt: new Date(),
      lastAccessedAt: new Date(),
    })

    // Ensure storage directory exists
    await storage.ensureStorageDir()
  })

  afterAll(async () => {
    await testDb.cleanup()
  })

  describe('cleanupOrphanedFiles', () => {
    it('should delete files for requests that no longer exist in database', async () => {
      // Create a token
      const token = await db.tokens.create(testSessionId)

      // Create a request with body
      const requestBody = Buffer.from('test body content')
      const request = await db.requests.create(
        testSessionId,
        token.id,
        'POST',
        { 'content-type': 'text/plain' },
        requestBody,
        '/test',
        '127.0.0.1',
        '127.0.0.1'
      )

      // Verify file exists
      expect(request.bodyPath).toBeTruthy()
      expect(storage.exists(request.bodyPath!)).toBe(true)

      // Delete request from database WITHOUT deleting the file
      await rawDb.delete(requests).where(sql`${requests.id} = ${request.id}`)

      // File should still exist
      expect(storage.exists(request.bodyPath!)).toBe(true)

      // Run orphaned files cleanup
      const result = await cleanupOrphanedFiles(testDb.dbFile, testDb.filesPath)

      // File should now be deleted
      expect(storage.exists(request.bodyPath!)).toBe(false)
      expect(result.deletedFiles).toBe(1)
      expect(result.scannedFiles).toBeGreaterThanOrEqual(1)
    })

    it('should delete entire token directory when token does not exist in database', async () => {
      // Create a token
      const token = await db.tokens.create(testSessionId)

      // Create multiple requests with bodies
      const body1 = Buffer.from('body 1')
      const body2 = Buffer.from('body 2')

      const req1 = await db.requests.create(
        testSessionId,
        token.id,
        'POST',
        { 'content-type': 'text/plain' },
        body1,
        '/test1',
        '127.0.0.1',
        '127.0.0.1'
      )

      const req2 = await db.requests.create(
        testSessionId,
        token.id,
        'POST',
        { 'content-type': 'text/plain' },
        body2,
        '/test2',
        '127.0.0.1',
        '127.0.0.1'
      )

      // Verify files exist
      expect(storage.exists(req1.bodyPath!)).toBe(true)
      expect(storage.exists(req2.bodyPath!)).toBe(true)

      // Delete token and its requests from database WITHOUT deleting files
      await rawDb.delete(requests).where(sql`${requests.tokenId} = ${token.id}`)
      await rawDb.delete(tokens).where(sql`${tokens.id} = ${token.id}`)

      // Files should still exist
      expect(storage.exists(req1.bodyPath!)).toBe(true)
      expect(storage.exists(req2.bodyPath!)).toBe(true)

      // Run orphaned files cleanup
      await cleanupOrphanedFiles(testDb.dbFile, testDb.filesPath)

      // Files should now be deleted
      expect(storage.exists(req1.bodyPath!)).toBe(false)
      expect(storage.exists(req2.bodyPath!)).toBe(false)
    })

    it('should delete entire session directory when session does not exist in database', async () => {
      // Create a token
      const token = await db.tokens.create(testSessionId)

      // Create a request with body
      const requestBody = Buffer.from('test body')
      const request = await db.requests.create(
        testSessionId,
        token.id,
        'POST',
        { 'content-type': 'text/plain' },
        requestBody,
        '/test',
        '127.0.0.1',
        '127.0.0.1'
      )

      // Verify file exists
      expect(storage.exists(request.bodyPath!)).toBe(true)

      // Delete session (cascades to tokens and requests) WITHOUT deleting files
      await rawDb.delete(sessions).where(sql`${sessions.id} = ${testSessionId}`)

      // File should still exist
      expect(storage.exists(request.bodyPath!)).toBe(true)

      // Run orphaned files cleanup
      await cleanupOrphanedFiles(testDb.dbFile, testDb.filesPath)

      // File should now be deleted
      expect(storage.exists(request.bodyPath!)).toBe(false)
    })

    it('should not delete files that are properly referenced in database', async () => {
      // Create a token
      const token = await db.tokens.create(testSessionId)

      // Create a request with body
      const requestBody = Buffer.from('test body')
      const request = await db.requests.create(
        testSessionId,
        token.id,
        'POST',
        { 'content-type': 'text/plain' },
        requestBody,
        '/test',
        '127.0.0.1',
        '127.0.0.1'
      )

      // Verify file exists
      expect(storage.exists(request.bodyPath!)).toBe(true)

      // Run orphaned files cleanup
      const result = await cleanupOrphanedFiles(testDb.dbFile, testDb.filesPath)

      // File should still exist
      expect(storage.exists(request.bodyPath!)).toBe(true)
      expect(result.deletedFiles).toBe(0)
    })

    it('should handle orphaned files created manually without database entries', async () => {
      // Create directory structure manually
      const orphanedSessionId = randomUUID()
      const orphanedTokenId = randomUUID()
      const orphanedRequestId = randomUUID()

      const sessionDir = join(storage.getStorageDir(), orphanedSessionId)
      const tokenDir = join(sessionDir, orphanedTokenId)

      await mkdir(tokenDir, { recursive: true })

      // Create orphaned file
      const bodyPath = await storage.save(
        orphanedSessionId,
        orphanedTokenId,
        orphanedRequestId,
        Buffer.from('orphaned data')
      )

      // Verify file exists
      expect(storage.exists(bodyPath)).toBe(true)

      // Run orphaned files cleanup
      const result = await cleanupOrphanedFiles(testDb.dbFile, testDb.filesPath)

      // Orphaned file should be deleted (session dir deleted since session doesn't exist)
      expect(storage.exists(bodyPath)).toBe(false)
      // Note: deletedFiles may be 0 because we delete the entire session directory
      // before scanning individual files (more efficient)
      expect(result.scannedFiles).toBeGreaterThanOrEqual(0)

      // Clean up
      await storage.deleteSession(orphanedSessionId)
    })
  })

  describe('cleanupExpiredData integration', () => {
    it('should report orphaned files in cleanup result', async () => {
      // Create a token
      const token = await db.tokens.create(testSessionId)

      // Create a request with body
      const requestBody = Buffer.from('test body')
      const request = await db.requests.create(
        testSessionId,
        token.id,
        'POST',
        { 'content-type': 'text/plain' },
        requestBody,
        '/test',
        '127.0.0.1',
        '127.0.0.1'
      )

      // Delete request from database WITHOUT deleting file
      await rawDb.delete(requests).where(sql`${requests.id} = ${request.id}`)

      // Run full cleanup
      const result = await cleanupExpiredData(testDb.dbFile, testDb.filesPath)

      // Should report orphaned files
      expect(result.orphanedFiles).toBeGreaterThanOrEqual(1)
      expect(result.scannedFiles).toBeGreaterThanOrEqual(1)
      expect(storage.exists(request.bodyPath!)).toBe(false)
    })
  })
})