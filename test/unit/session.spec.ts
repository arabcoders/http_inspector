import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { getSession } from '../../server/lib/session'
import { getDb } from '../../server/db'
import { sessions } from '../../server/db/schema'
import { randomUUID } from 'crypto'
import { createTestDb, type TestDbContext } from '../utils/testDb'

describe('session', () => {
    let testDb: TestDbContext

    beforeAll(async () => {
        testDb = await createTestDb()
    })

    afterAll(async () => {
        await testDb.cleanup()
    })

    describe('getSession', () => {
        it('should retrieve session by ID', async () => {
            const db = getDb(testDb.dbFile)
            const sessionId = randomUUID()
            const friendlyId = 'test-session-friendly'
            const now = new Date()

            // Create a test session
            await db.insert(sessions).values({
                id: sessionId,
                friendlyId,
                createdAt: now,
                lastAccessedAt: now,
            })

            const session = await getSession(sessionId)

            expect(session).toBeTruthy()
            expect(session?.id).toBe(sessionId)
            expect(session?.friendlyId).toBe(friendlyId)
            expect(session?.createdAt).toBeInstanceOf(Date)
            expect(session?.lastAccessedAt).toBeInstanceOf(Date)
        })

        it('should return null for non-existent session ID', async () => {
            const session = await getSession('non-existent-id')

            expect(session).toBeNull()
        })

        it('should return null for empty session ID', async () => {
            const session = await getSession('')

            expect(session).toBeNull()
        })

        it('should handle multiple sessions', async () => {
            const db = getDb(testDb.dbFile)
            const session1Id = randomUUID()
            const session2Id = randomUUID()
            const now = new Date()

            await db.insert(sessions).values([
                {
                    id: session1Id,
                    friendlyId: 'session-1',
                    createdAt: now,
                    lastAccessedAt: now,
                },
                {
                    id: session2Id,
                    friendlyId: 'session-2',
                    createdAt: now,
                    lastAccessedAt: now,
                },
            ])

            const session1 = await getSession(session1Id)
            const session2 = await getSession(session2Id)

            expect(session1?.id).toBe(session1Id)
            expect(session1?.friendlyId).toBe('session-1')
            expect(session2?.id).toBe(session2Id)
            expect(session2?.friendlyId).toBe('session-2')
        })
    })

    describe('session data integrity', () => {
        it('should preserve session timestamps', async () => {
            const db = getDb(testDb.dbFile)
            const sessionId = randomUUID()
            const createdAt = new Date('2025-01-01T00:00:00Z')
            const lastAccessedAt = new Date('2025-01-02T00:00:00Z')

            await db.insert(sessions).values({
                id: sessionId,
                friendlyId: 'timestamp-test',
                createdAt,
                lastAccessedAt,
            })

            const session = await getSession(sessionId)

            expect(session?.createdAt.getTime()).toBe(createdAt.getTime())
            expect(session?.lastAccessedAt.getTime()).toBe(lastAccessedAt.getTime())
        })

        it('should handle friendly IDs with special characters', async () => {
            const db = getDb(testDb.dbFile)
            const sessionId = randomUUID()
            const friendlyId = 'happy-red-cat-123'
            const now = new Date()

            await db.insert(sessions).values({
                id: sessionId,
                friendlyId,
                createdAt: now,
                lastAccessedAt: now,
            })

            const session = await getSession(sessionId)

            expect(session?.friendlyId).toBe(friendlyId)
        })
    })
})
