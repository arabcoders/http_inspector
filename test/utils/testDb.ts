import { join } from 'path'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { runMigrations } from '../../server/db/migrate'
import { getDb, closeDb } from '../../server/db'

export interface TestDbContext {
    dbFile: string
    filesPath: string
    cleanup: () => Promise<void>
}

/**
 * Create an isolated test database and file storage
 * This ensures tests don't interfere with user data or each other
 */
export const createTestDb = async (): Promise<TestDbContext> => {
    // Create temporary directory for this test
    const tempDir = await mkdtemp(join(tmpdir(), 'http-inspector-test-'))
    
    const dbFile = join(tempDir, 'test.sqlite')
    const filesPath = tempDir
    
    // Run migrations on the test database
    await runMigrations(dbFile)
    
    // Initialize the database connection
    getDb(dbFile, true)
    
    const cleanup = async () => {
        try {
            closeDb()
            await rm(tempDir, { recursive: true, force: true })
        } catch (error) {
            console.error('Error cleaning up test database:', error)
        }
    }
    
    return { dbFile, filesPath, cleanup }
}
