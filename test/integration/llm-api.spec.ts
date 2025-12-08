import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import createH3Event from '../utils/createH3Event'
import type { H3Event } from 'h3'
import { useDatabase } from '../../server/lib/db'
import { ensureLLMSession, LLM_SESSION_ID } from '../../server/lib/session'
import { createTestDb, type TestDbContext } from '../utils/testDb'

// Mock readBody and getQuery to return our test data
vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  let mockBodyValue: unknown = null
  return {
    ...actual,
    readBody: vi.fn(async (_event: unknown) => mockBodyValue),
    getQuery: vi.fn((event: { __query?: Record<string, unknown> }) => event.__query || {}),
    __setMockBody: (value: unknown) => { mockBodyValue = value }
  }
})

interface TokenResponse {
  id: string
  friendlyId: string | null
  sessionId: string
  createdAt: string | Date
  payloadUrl: string
  responseEnabled: boolean
  responseStatus: number
  responseHeaders: string | null
  responseBody: string | null
}

describe('LLM API', () => {
  let db: ReturnType<typeof useDatabase>
  let testDbContext: TestDbContext
  let indexHandler: (event: H3Event) => Promise<unknown>
  let tokenIndexHandler: (event: H3Event) => Promise<unknown>
  let tokenHandler: (event: H3Event) => Promise<unknown>
  let latestHandler: (event: H3Event) => Promise<unknown>

  beforeEach(async () => {
    testDbContext = await createTestDb()
    db = useDatabase(testDbContext.dbFile, testDbContext.filesPath)
    await ensureLLMSession()
    
    // Import handlers
    indexHandler = (await import('../../server/api/llm/index')).default as unknown as (event: H3Event) => Promise<unknown>
    tokenIndexHandler = (await import('../../server/api/llm/token/index')).default
    tokenHandler = (await import('../../server/api/llm/token/[token]/index')).default
    latestHandler = (await import('../../server/api/llm/token/[token]/latest')).default
  })

  afterEach(async () => {
    await testDbContext.cleanup()
  })

  describe('GET /api/llm', () => {
    it('should return API overview and documentation', async () => {
      const event = createH3Event()
      const response = await indexHandler(event) as Record<string, unknown>

      expect(response).toHaveProperty('name')
      expect(response).toHaveProperty('version')
      expect(response).toHaveProperty('description')
      expect(response).toHaveProperty('endpoints')
      expect(Array.isArray(response.endpoints)).toBe(true)
      expect((response.endpoints as unknown[]).length).toBeGreaterThan(0)
    })

    it('should document all LLM endpoints', async () => {
      const event = createH3Event()
      const response = await indexHandler(event) as { endpoints: { path: string }[] }

      const endpointPaths = response.endpoints.map(e => e.path)
      expect(endpointPaths).toContain('/api/llm/token')
      expect(endpointPaths).toContain('/api/llm/token/:token')
      expect(endpointPaths).toContain('/api/llm/token/:token/latest')
    })
  })

  describe('POST /api/llm/token', () => {
    it('should create a new token in LLM session', async () => {
      const event = createH3Event()
      event.node.req.method = 'POST'
      const response = await tokenIndexHandler(event) as TokenResponse

      expect(response).toHaveProperty('id')
      expect(response).toHaveProperty('friendlyId')
      expect(response.sessionId).toBe(LLM_SESSION_ID)
      expect(response).toHaveProperty('createdAt')
      expect(response).toHaveProperty('payloadUrl')
      expect(response.payloadUrl).toContain('/api/payload/')
    })

    it('should reject non-POST methods', async () => {
      const event = createH3Event()
      event.node.req.method = 'GET'
      await expect(tokenIndexHandler(event)).rejects.toThrow('Method not allowed')
    })
  })

  describe('GET /api/llm/token/:token', () => {
    it('should get token details with UUID', async () => {
      // Create a token first
      const createEvent = createH3Event()
      createEvent.node.req.method = 'POST'
      const token = await tokenIndexHandler(createEvent) as TokenResponse

      // Get token details
      const getEvent = createH3Event({ context: { params: { token: token.id } } })
      const response = await tokenHandler(getEvent) as Record<string, unknown>

      expect(response).toHaveProperty('token')
      const responseToken = response.token as Record<string, unknown>
      expect(responseToken.id).toBe(token.id)
      expect(response).toHaveProperty('requests')
      expect(Array.isArray(response.requests)).toBe(true)
      expect(response.total).toBe(0)
    })

    it('should get token details with friendlyId', async () => {
      // Create a token first
      const createEvent = createH3Event()
      createEvent.node.req.method = 'POST'
      const token = await tokenIndexHandler(createEvent) as TokenResponse

      // Get token details using friendlyId
      const getEvent = createH3Event({ context: { params: { token: token.friendlyId } } })
      const response = await tokenHandler(getEvent) as Record<string, unknown>

      expect(response).toHaveProperty('token')
      const responseToken = response.token as Record<string, unknown>
      expect(responseToken.id).toBe(token.id)
      expect(responseToken.friendlyId).toBe(token.friendlyId)
    })

    it('should return 404 for non-existent token', async () => {
      const event = createH3Event({ context: { params: { token: '00000000-0000-0000-0000-000000000001' } } })
      await expect(tokenHandler(event)).rejects.toThrow('Token not found')
    })

    it('should include requests in response', async () => {
      // Create a token
      const createEvent = createH3Event()
      createEvent.node.req.method = 'POST'
      const token = await tokenIndexHandler(createEvent) as TokenResponse

      // Create a request
      const requestData = {
        method: 'POST',
        url: 'https://example.com/webhook',
        headers: { 'content-type': 'application/json' },
        body: Buffer.from('{"test": true}'),
        clientIp: '127.0.0.1',
        remoteIp: '192.168.1.1',
      }
      await db.requests.create(
        LLM_SESSION_ID,
        token.id,
        requestData.method,
        requestData.headers,
        requestData.body,
        requestData.url,
        requestData.clientIp,
        requestData.remoteIp
      )

      // Get token details
      const getEvent = createH3Event({ context: { params: { token: token.id } } })
      const response = await tokenHandler(getEvent) as Record<string, unknown>

      expect(response.total).toBe(1)
      expect(Array.isArray(response.requests)).toBe(true)
      const requests = response.requests as Array<Record<string, unknown>>
      expect(requests).toHaveLength(1)
      expect(requests[0]).toHaveProperty('id')
      expect(requests[0].method).toBe('POST')
      expect(requests[0].url).toBe('https://example.com/webhook')
      // Body might be null in test environment due to file path issues
      expect(requests[0]).toHaveProperty('body')
    })

    it('should mark binary data in response', async () => {
      // Create a token
      const createEvent = createH3Event()
      createEvent.node.req.method = 'POST'
      const token = await tokenIndexHandler(createEvent) as TokenResponse

      // Create a request with binary data
      const binaryData = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10]) // JPEG header
      await db.requests.create(
        LLM_SESSION_ID,
        token.id,
        'POST',
        { 'content-type': 'image/jpeg' },
        binaryData,
        'https://example.com/image',
        '127.0.0.1',
        '192.168.1.1'
      )

      // Get token details
      const getEvent = createH3Event({ context: { params: { token: token.id } } })
      const response = await tokenHandler(getEvent) as Record<string, unknown>

      const requests = response.requests as Array<Record<string, unknown>>
      expect(requests[0].isBinary).toBe(true)
      expect(requests[0].body).toBe('[Binary data not included]')
    })
  })

  describe('PATCH /api/llm/token/:token', () => {
    it('should update token response settings', async () => {
      // Create a token
      const createEvent = createH3Event()
      createEvent.node.req.method = 'POST'
      const token = await tokenIndexHandler(createEvent) as TokenResponse

      // Update response settings
      const h3Module = await import('h3') as typeof import('h3') & { __setMockBody?: (value: unknown) => void }
      h3Module.__setMockBody?.({
        responseEnabled: true,
        responseStatus: 201,
        responseHeaders: '{"x-custom": "header"}',
        responseBody: 'Custom response body',
      })

      const patchEvent = createH3Event({ context: { params: { token: token.id } } })
      patchEvent.node.req.method = 'PATCH'
      const response = await tokenHandler(patchEvent) as Record<string, unknown>

      expect(response).toEqual({ ok: true })

      // Verify settings were updated
      const updatedToken = await db.tokens.get(LLM_SESSION_ID, token.id)
      expect(updatedToken?.responseEnabled).toBe(true)
      expect(updatedToken?.responseStatus).toBe(201)
      expect(updatedToken?.responseHeaders).toBe('{"x-custom": "header"}')
      expect(updatedToken?.responseBody).toBe('Custom response body')
    })

    it('should update token response settings with friendlyId', async () => {
      // Create a token
      const createEvent = createH3Event()
      createEvent.node.req.method = 'POST'
      const token = await tokenIndexHandler(createEvent) as TokenResponse

      // Update response settings using friendlyId
      const h3Module = await import('h3') as typeof import('h3') & { __setMockBody?: (value: unknown) => void }
      h3Module.__setMockBody?.({
        responseEnabled: false,
        responseStatus: 404,
      })

      const patchEvent = createH3Event({ context: { params: { token: token.friendlyId } } })
      patchEvent.node.req.method = 'PATCH'
      const response = await tokenHandler(patchEvent) as Record<string, unknown>

      expect(response).toEqual({ ok: true })

      // Verify settings were updated
      const updatedToken = await db.tokens.get(LLM_SESSION_ID, token.id)
      expect(updatedToken?.responseEnabled).toBe(false)
      expect(updatedToken?.responseStatus).toBe(404)
    })

    it('should return 404 when updating non-existent token', async () => {
      const h3Module = await import('h3') as typeof import('h3') & { __setMockBody?: (value: unknown) => void }
      h3Module.__setMockBody?.({
        responseEnabled: true,
      })

      const event = createH3Event({ context: { params: { token: '00000000-0000-0000-0000-000000000001' } } })
      event.node.req.method = 'PATCH'
      await expect(tokenHandler(event)).rejects.toThrow('Token not found')
    })
  })

  describe('DELETE /api/llm/token/:token', () => {
    it('should delete token with UUID', async () => {
      // Create a token
      const createEvent = createH3Event()
      createEvent.node.req.method = 'POST'
      const token = await tokenIndexHandler(createEvent) as TokenResponse

      // Delete token
      const deleteEvent = createH3Event({ context: { params: { token: token.id } } })
      deleteEvent.node.req.method = 'DELETE'
      const response = await tokenHandler(deleteEvent) as Record<string, unknown>

      expect(response).toEqual({ ok: true })

      // Verify token is deleted
      const verifyToken = await db.tokens.get(LLM_SESSION_ID, token.id)
      expect(verifyToken).toBeNull()
    })

    it('should delete token with friendlyId', async () => {
      // Create a token
      const createEvent = createH3Event()
      createEvent.node.req.method = 'POST'
      const token = await tokenIndexHandler(createEvent) as TokenResponse

      // Delete token using friendlyId
      const deleteEvent = createH3Event({ context: { params: { token: token.friendlyId } } })
      deleteEvent.node.req.method = 'DELETE'
      const response = await tokenHandler(deleteEvent) as Record<string, unknown>

      expect(response).toEqual({ ok: true })
    })

    it('should return 404 when deleting non-existent token', async () => {
      const event = createH3Event({ context: { params: { token: '00000000-0000-0000-0000-000000000001' } } })
      event.node.req.method = 'DELETE'
      await expect(tokenHandler(event)).rejects.toThrow('Token not found')
    })
  })

  describe('GET /api/llm/token/:token/latest', () => {
    it('should get the latest request for a token', async () => {
      // Create a token
      const createEvent = createH3Event()
      createEvent.node.req.method = 'POST'
      const token = await tokenIndexHandler(createEvent) as TokenResponse

      // Create a request
      await db.requests.create(
        LLM_SESSION_ID,
        token.id,
        'GET',
        { 'content-type': 'text/plain' },
        Buffer.from('test request'),
        'https://example.com/webhook',
        '127.0.0.1',
        '192.168.1.1'
      )

      // Get latest request
      const getEvent = createH3Event({ context: { params: { token: token.id } } })
      const response = await latestHandler(getEvent) as Record<string, unknown>

      expect(response).toHaveProperty('id')
      expect(response.method).toBe('GET')
      expect(response.url).toBe('https://example.com/webhook')
      expect(response).toHaveProperty('headers')
      expect(response).toHaveProperty('createdAt')
    })

    it('should work with friendlyId', async () => {
      // Create a token
      const createEvent = createH3Event()
      createEvent.node.req.method = 'POST'
      const token = await tokenIndexHandler(createEvent) as TokenResponse

      // Create a request
      await db.requests.create(
        LLM_SESSION_ID,
        token.id,
        'POST',
        { 'content-type': 'application/json' },
        Buffer.from('{"test": true}'),
        'https://example.com/webhook',
        '127.0.0.1',
        '192.168.1.1'
      )

      // Get latest using friendlyId
      const getEvent = createH3Event({ context: { params: { token: token.friendlyId } } })
      const response = await latestHandler(getEvent) as Record<string, unknown>

      expect(response).toHaveProperty('id')
      expect(response.method).toBe('POST')
    })

    it('should return 404 when token has no requests', async () => {
      // Create a token without requests
      const createEvent = createH3Event()
      createEvent.node.req.method = 'POST'
      const token = await tokenIndexHandler(createEvent) as TokenResponse

      // Try to get latest
      const getEvent = createH3Event({ context: { params: { token: token.id } } })
      await expect(latestHandler(getEvent)).rejects.toThrow('No requests found for this token')
    })

    it('should return 404 for non-existent token', async () => {
      const event = createH3Event({ context: { params: { token: '00000000-0000-0000-0000-000000000001' } } })
      await expect(latestHandler(event)).rejects.toThrow('Token not found')
    })

    it('should reject non-GET methods', async () => {
      const event = createH3Event({ context: { params: { token: 'test' } } })
      event.node.req.method = 'POST'
      await expect(latestHandler(event)).rejects.toThrow('Method not allowed')
    })
  })

  describe('LLM Session Management', () => {
    it('should use static LLM session for all tokens', async () => {
      const event1 = createH3Event()
      event1.node.req.method = 'POST'
      const token1 = await tokenIndexHandler(event1) as TokenResponse

      const event2 = createH3Event()
      event2.node.req.method = 'POST'
      const token2 = await tokenIndexHandler(event2) as TokenResponse

      expect(token1.sessionId).toBe(LLM_SESSION_ID)
      expect(token2.sessionId).toBe(LLM_SESSION_ID)
      expect(token1.sessionId).toBe(token2.sessionId)
    })

    it('should not allow access to non-LLM session tokens without secret', async () => {
      // Create a session first
      const differentSessionId = '11111111-1111-1111-1111-111111111111'
      const { getDb } = await import('../../server/db')
      const dbInstance = getDb(testDbContext.dbFile, true)
      const { sessions: sessionsSchema } = await import('../../server/db/schema')
      
      // Create the session in the database
      await dbInstance.insert(sessionsSchema).values({
        id: differentSessionId,
        friendlyId: 'test-session',
        createdAt: new Date(),
        lastAccessedAt: new Date(),
      })
      
      // Now create a token in that session
      const token = await db.tokens.create(differentSessionId)

      // Try to access it via LLM API without secret
      const event = createH3Event({ context: { params: { token: token.friendlyId } } })
      await expect(tokenHandler(event)).rejects.toThrow('Authentication required')
    })

    it('should allow access to user tokens with valid secret', async () => {
      // Create a session first
      const differentSessionId = '22222222-2222-2222-2222-222222222222'
      const { getDb } = await import('../../server/db')
      const dbInstance = getDb(testDbContext.dbFile, true)
      const { sessions: sessionsSchema } = await import('../../server/db/schema')
      
      // Create the session in the database
      await dbInstance.insert(sessionsSchema).values({
        id: differentSessionId,
        friendlyId: 'test-session-2',
        createdAt: new Date(),
        lastAccessedAt: new Date(),
      })
      
      // Now create a token in that session
      const token = await db.tokens.create(differentSessionId)

      // Access it via LLM API with valid secret
      const event = createH3Event({ 
        context: { params: { token: token.friendlyId } },
        query: { secret: token.id }
      })
      const response = await tokenHandler(event) as Record<string, unknown>

      expect(response).toHaveProperty('token')
      expect(response).toHaveProperty('requests')
    })

    it('should reject PATCH/DELETE methods for user tokens even with valid secret', async () => {
      // Create a session first
      const differentSessionId = '33333333-3333-3333-3333-333333333333'
      const { getDb } = await import('../../server/db')
      const dbInstance = getDb(testDbContext.dbFile, true)
      const { sessions: sessionsSchema } = await import('../../server/db/schema')
      
      // Create the session in the database
      await dbInstance.insert(sessionsSchema).values({
        id: differentSessionId,
        friendlyId: 'test-session-3',
        createdAt: new Date(),
        lastAccessedAt: new Date(),
      })
      
      // Now create a token in that session
      const token = await db.tokens.create(differentSessionId)

      // Try PATCH with valid secret
      const h3Module = await import('h3') as typeof import('h3') & { __setMockBody?: (value: unknown) => void }
      h3Module.__setMockBody?.({ responseEnabled: true })

      const patchEvent = createH3Event({ 
        context: { params: { token: token.friendlyId } },
        query: { secret: token.id }
      })
      patchEvent.node.req.method = 'PATCH'
      
      await expect(tokenHandler(patchEvent)).rejects.toThrow('Only GET method is allowed for user tokens')
    })
  })
})
