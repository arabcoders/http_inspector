import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import createH3Event from '../utils/createH3Event'
import type { H3Event } from 'h3'
import type { Token, Request } from '../../shared/types'

// Mock getQuery from h3 to parse URL query strings
vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  return {
    ...actual,
    getQuery: vi.fn((event: H3Event) => {
      const url = event.node.req.url || ''
      const queryString = url.split('?')[1] || ''
      const params: Record<string, string> = {}
      if (queryString) {
        const pairs = queryString.split('&')
        for (const pair of pairs) {
          const [key, value] = pair.split('=')
          if (key) {
            params[key] = decodeURIComponent(value || '')
          }
        }
      }
      return params
    }),
  }
})

// Mock data
const mockToken: Token = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  friendlyId: 'abc123xy',
  sessionId: '650e8400-e29b-41d4-a716-446655440001',
  createdAt: new Date('2024-01-01'),
  responseEnabled: false,
  responseStatus: 200,
  responseHeaders: null,
  responseBody: null,
}

const mockRequests: Request[] = [
  {
    id: '750e8400-e29b-41d4-a716-446655440002',
    tokenId: '550e8400-e29b-41d4-a716-446655440000',
    sessionId: '650e8400-e29b-41d4-a716-446655440001',
    method: 'POST',
    url: 'https://example.com/test',
    headers: JSON.stringify({ 'Content-Type': 'application/json', 'User-Agent': 'test' }),
    contentType: 'application/json',
    contentLength: 15,
    isBinary: false,
    clientIp: '127.0.0.1',
    remoteIp: '127.0.0.1',
    bodyPath: 'session-123/token-uuid-123/req-1',
    createdAt: new Date('2024-01-01T10:00:00Z'),
  },
  {
    id: '850e8400-e29b-41d4-a716-446655440003',
    tokenId: '550e8400-e29b-41d4-a716-446655440000',
    sessionId: '650e8400-e29b-41d4-a716-446655440001',
    method: 'POST',
    url: 'https://example.com/image',
    headers: JSON.stringify({ 'Content-Type': 'image/png' }),
    contentType: 'image/png',
    contentLength: 6,
    isBinary: true,
    clientIp: '127.0.0.1',
    remoteIp: '127.0.0.1',
    bodyPath: 'session-123/token-uuid-123/req-2',
    createdAt: new Date('2024-01-01T11:00:00Z'),
  },
]

// Mock database operations
const mockGetByFriendlyId = vi.fn(async (friendlyId: string): Promise<Token | null> => {
  if (friendlyId === mockToken.friendlyId) {
    return mockToken
  }
  return null
})

const mockGetSessionId = vi.fn(async (tokenId: string): Promise<string | null> => {
  if (tokenId === mockToken.id) {
    return mockToken.sessionId
  }
  return null
})

const mockGetToken = vi.fn(async (sessionId: string, tokenId: string): Promise<Token | null> => {
  if (sessionId === mockToken.sessionId && tokenId === mockToken.id) {
    return mockToken
  }
  return null
})

const mockListRequests = vi.fn(async (_sessionId: string, _tokenId: string): Promise<Request[]> => {
  return mockRequests
})

const mockGetBody = vi.fn(async (sessionId: string, tokenId: string, requestId: string): Promise<Uint8Array | null> => {
  if (requestId === '750e8400-e29b-41d4-a716-446655440002') {
    return new TextEncoder().encode('{"test":"data"}')
  }
  if (requestId === '850e8400-e29b-41d4-a716-446655440003') {
    return new Uint8Array([0x89, 0x50, 0x4E, 0x47])
  }
  return null
})

vi.mock('~~/server/lib/db', () => ({
  useDatabase: () => ({
    tokens: {
      getByFriendlyId: mockGetByFriendlyId,
      getSessionId: mockGetSessionId,
      get: mockGetToken,
    },
    requests: {
      list: mockListRequests,
      getBody: mockGetBody,
    },
  }),
}))

// Helper to create test event with proper headers
const createTestEvent = (overrides: Parameters<typeof createH3Event>[0]) => {
  return createH3Event({
    ...overrides,
    node: {
      ...overrides?.node,
      req: {
        ...overrides?.node?.req,
        headers: {
          host: 'localhost:3000',
          ...overrides?.node?.req?.headers,
        },
      },
    },
  })
}

describe('GET /api/view/[shortId]', () => {
  let handler: (event: H3Event) => Promise<unknown>

  beforeEach(async () => {
    vi.clearAllMocks()
    handler = (await import('../../server/api/view/[shortId]')).default
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Authentication', () => {
    it('should require secret parameter', async () => {
      const url = `/api/view/${mockToken.friendlyId}`
      
      const event = createTestEvent({
        context: { params: { shortId: mockToken.friendlyId } },
        node: { req: { url } },
      })

      await expect(handler(event)).rejects.toThrow('Secret parameter is required')
    })

    it('should reject invalid secret format', async () => {
      const url = `/api/view/${mockToken.friendlyId}?secret=invalid`
      
      const event = createTestEvent({
        context: { params: { shortId: mockToken.friendlyId } },
        node: { req: { url } },
      })

      await expect(handler(event)).rejects.toThrow('Invalid secret format')
    })

    it('should reject wrong secret (UUID mismatch)', async () => {
      const wrongSecret = '00000000-0000-0000-0000-000000000000'
      const url = `/api/view/${mockToken.friendlyId}?secret=${wrongSecret}`
      
      const event = createTestEvent({
        context: { params: { shortId: mockToken.friendlyId } },
        node: { req: { url } },
      })

      await expect(handler(event)).rejects.toThrow('Invalid secret')
    })

    it('should accept correct secret', async () => {
      const url = `/api/view/${mockToken.friendlyId}?secret=${mockToken.id}`
      
      const event = createTestEvent({
        context: { params: { shortId: mockToken.friendlyId } },
        node: { req: { url } },
      })

      const result = await handler(event)
      expect(result).toBeDefined()
    })
  })

  describe('Token lookup', () => {
    it('should work with friendlyId', async () => {
      const url = `/api/view/${mockToken.friendlyId}?secret=${mockToken.id}`
      
      const event = createTestEvent({
        context: { params: { shortId: mockToken.friendlyId } },
        node: { req: { url } },
      })

      const result = await handler(event) as { token: { id: string; friendlyId: string | null } }
      expect(result.token.id).toBe(mockToken.id)
      expect(result.token.friendlyId).toBe(mockToken.friendlyId)
      expect(mockGetByFriendlyId).toHaveBeenCalledWith(mockToken.friendlyId)
    })

    it('should return 404 for non-existent token', async () => {
      const url = `/api/view/notfound?secret=${mockToken.id}`
      
      const event = createTestEvent({
        context: { params: { shortId: 'notfound' } },
        node: { req: { url } },
      })

      await expect(handler(event)).rejects.toThrow('Token not found')
    })
  })

  describe('Response format', () => {
    it('should return LLM-friendly JSON structure', async () => {
      const url = `/api/view/${mockToken.friendlyId}?secret=${mockToken.id}`
      
      const event = createTestEvent({
        context: { params: { shortId: mockToken.friendlyId } },
        node: { req: { url } },
      })

      const result = await handler(event) as {
        token: { id: string; friendlyId: string | null; createdAt: string; payloadUrl: string }
        requests: unknown[]
        total: number
      }

      // Check top-level structure
      expect(result).toHaveProperty('token')
      expect(result).toHaveProperty('requests')
      expect(result).toHaveProperty('total')

      // Check token structure
      expect(result.token).toHaveProperty('id')
      expect(result.token).toHaveProperty('friendlyId')
      expect(result.token).toHaveProperty('createdAt')
      expect(result.token).toHaveProperty('payloadUrl')
      expect(typeof result.token.createdAt).toBe('string')
      expect(typeof result.token.payloadUrl).toBe('string')
      expect(result.token.payloadUrl).toContain('/api/payload/')

      // Check requests is array
      expect(Array.isArray(result.requests)).toBe(true)
      expect(result.total).toBe(result.requests.length)
    })
  })

  describe('Request data', () => {
    it('should include request details', async () => {
      const url = `/api/view/${mockToken.friendlyId}?secret=${mockToken.id}`
      
      const event = createTestEvent({
        context: { params: { shortId: mockToken.friendlyId } },
        node: { req: { url } },
      })

      const result = await handler(event) as { requests: Array<{
        id: string
        method: string
        url: string
        headers: Record<string, string>
        contentType: string
        contentLength: number
        isBinary: boolean
        body: string | null
        clientIp: string
        remoteIp: string
        createdAt: string
      }> }

      expect(result.requests.length).toBeGreaterThan(0)

      const request = result.requests[0]
      expect(request).toHaveProperty('id')
      expect(request).toHaveProperty('method')
      expect(request).toHaveProperty('url')
      expect(request).toHaveProperty('headers')
      expect(request).toHaveProperty('contentType')
      expect(request).toHaveProperty('contentLength')
      expect(request).toHaveProperty('isBinary')
      expect(request).toHaveProperty('body')
      expect(request).toHaveProperty('clientIp')
      expect(request).toHaveProperty('remoteIp')
      expect(request).toHaveProperty('createdAt')

      expect(typeof request.headers).toBe('object')
      expect(typeof request.createdAt).toBe('string')
    })

    it('should include text body content', async () => {
      const url = `/api/view/${mockToken.friendlyId}?secret=${mockToken.id}`
      
      const event = createTestEvent({
        context: { params: { shortId: mockToken.friendlyId } },
        node: { req: { url } },
      })

      const result = await handler(event) as { requests: Array<{ contentType: string; body: string }> }

      const textRequest = result.requests.find(r => r.contentType === 'application/json')

      expect(textRequest).toBeDefined()
      expect(textRequest?.body).toContain('test')
      expect(textRequest?.body).toContain('data')
    })

    it('should mark binary content appropriately', async () => {
      const url = `/api/view/${mockToken.friendlyId}?secret=${mockToken.id}`
      
      const event = createTestEvent({
        context: { params: { shortId: mockToken.friendlyId } },
        node: { req: { url } },
      })

      const result = await handler(event) as { requests: Array<{ contentType: string; isBinary: boolean; body: string }> }

      const binaryRequest = result.requests.find(r => r.contentType === 'image/png')

      expect(binaryRequest).toBeDefined()
      expect(binaryRequest?.isBinary).toBe(true)
      expect(binaryRequest?.body).toBe('[Binary data not included]')
    })
  })

  describe('Method restrictions', () => {
    it('should only accept GET requests', async () => {
      const methods = ['POST', 'PUT', 'PATCH', 'DELETE']

      for (const method of methods) {
        const url = `/api/view/${mockToken.friendlyId}?secret=${mockToken.id}`
        
        const event = createTestEvent({
          context: { params: { shortId: mockToken.friendlyId } },
          node: { req: { url, method } },
        })

        await expect(handler(event)).rejects.toThrow('Method not allowed')
      }
    })
  })
})

