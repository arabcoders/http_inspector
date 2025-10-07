import { describe, it, expect, afterEach, beforeEach, afterAll, beforeAll } from 'vitest'
import { useFileStorage } from '../../server/lib/file-storage'
import { existsSync } from 'fs'
import { rm, mkdtemp } from 'fs/promises'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { tmpdir } from 'os'

describe('file-storage', () => {
  const testSessionId = randomUUID()
  const testTokenId = 'test-token-456'
  const testRequestId = randomUUID()
  
  let storage: ReturnType<typeof useFileStorage>
  let testStoragePath: string
  
  beforeAll(async () => {
    // Create isolated test storage directory
    testStoragePath = await mkdtemp(join(tmpdir(), 'http-inspector-test-storage-'))
  })
  
  beforeEach(() => {
    storage = useFileStorage(testStoragePath)
  })
  
  afterEach(async () => {
    // Clean up test files
    const storageDir = storage.getStorageDir()
    const testDir = join(storageDir, testSessionId)
    if (existsSync(testDir)) {
      await rm(testDir, { recursive: true, force: true })
    }
  })

  afterAll(async () => {
    // Clean up entire test storage directory
    if (existsSync(testStoragePath)) {
      await rm(testStoragePath, { recursive: true, force: true })
    }
  })

  describe('save', () => {
    it('should save request body to disk', async () => {
      const body = Buffer.from('test body content')
      const relativePath = await storage.save(testSessionId, testTokenId, testRequestId, body)

      expect(relativePath).toBe(`${testSessionId}/${testTokenId}/${testRequestId}.bin`)
      
      const fullPath = join(storage.getStorageDir(), relativePath)
      expect(existsSync(fullPath)).toBe(true)
    })

    it('should handle binary data', async () => {
      const body = Buffer.from([0x00, 0x01, 0x02, 0x03, 0xFF])
      const relativePath = await storage.save(testSessionId, testTokenId, testRequestId, body)

      const fullPath = join(storage.getStorageDir(), relativePath)
      expect(existsSync(fullPath)).toBe(true)
    })
  })

  describe('read', () => {
    it('should read saved request body', async () => {
      const originalBody = Buffer.from('test body content')
      const relativePath = await storage.save(testSessionId, testTokenId, testRequestId, originalBody)

      const readBody = await storage.read(relativePath)
      expect(readBody).toEqual(originalBody)
    })

    it('should return null for non-existent file', async () => {
      const result = await storage.read('non/existent/path.bin')
      expect(result).toBeNull()
    })

    it('should handle binary data correctly', async () => {
      const originalBody = Buffer.from([0x00, 0x01, 0x02, 0x03, 0xFF])
      const relativePath = await storage.save(testSessionId, testTokenId, testRequestId, originalBody)

      const readBody = await storage.read(relativePath)
      expect(readBody).toEqual(originalBody)
    })
  })

  describe('delete', () => {
    it('should delete request body file', async () => {
      const body = Buffer.from('test body content')
      const relativePath = await storage.save(testSessionId, testTokenId, testRequestId, body)

      const fullPath = join(storage.getStorageDir(), relativePath)
      expect(existsSync(fullPath)).toBe(true)

      await storage.delete(relativePath)
      expect(existsSync(fullPath)).toBe(false)
    })

    it('should not throw when deleting non-existent file', async () => {
      await expect(storage.delete('non/existent/path.bin')).resolves.not.toThrow()
    })
  })

  describe('deleteToken', () => {
    it('should delete all bodies for a token', async () => {
      const body1 = Buffer.from('body 1')
      const body2 = Buffer.from('body 2')
      
      await storage.save(testSessionId, testTokenId, randomUUID(), body1)
      await storage.save(testSessionId, testTokenId, randomUUID(), body2)

      const tokenDir = join(storage.getStorageDir(), testSessionId, testTokenId)
      expect(existsSync(tokenDir)).toBe(true)

      await storage.deleteToken(testSessionId, testTokenId)
      expect(existsSync(tokenDir)).toBe(false)
    })
  })

  describe('deleteSession', () => {
    it('should delete all bodies for a session', async () => {
      const body1 = Buffer.from('body 1')
      const body2 = Buffer.from('body 2')
      
      await storage.save(testSessionId, 'token-1', randomUUID(), body1)
      await storage.save(testSessionId, 'token-2', randomUUID(), body2)

      const sessionDir = join(storage.getStorageDir(), testSessionId)
      expect(existsSync(sessionDir)).toBe(true)

      await storage.deleteSession(testSessionId)
      expect(existsSync(sessionDir)).toBe(false)
    })
  })

  describe('generatePath', () => {
    it('should generate correct file path', () => {
      const requestId = randomUUID()
      const filePath = storage.generatePath('session-123', 'token-456', requestId)
      expect(filePath).toContain('session-123')
      expect(filePath).toContain('token-456')
      expect(filePath).toContain(`${requestId}.bin`)
    })
  })
})
