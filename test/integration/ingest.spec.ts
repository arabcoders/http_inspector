import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import createH3Event from '../utils/createH3Event'
import type { H3Event } from 'h3'
import { useServerEvents } from '../../server/lib/events'

// Mock readBody to return our test data
vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  let mockBodyValue: unknown = null
  return {
    ...actual,
    readBody: vi.fn(async (_event: unknown) => mockBodyValue),
    __setMockBody: (value: unknown) => { mockBodyValue = value }
  }
})

// Mock the DB and session layer
const mockInsertRequest = vi.fn(async (
  sessionId: string,
  tokenId: string,
  method: string,
  headers: Record<string, string>,
  body: Buffer | null,
  url: string,
  clientIp: string,
  remoteIp: string,
) => {
  return {
    id: 999,
    tokenId,
    sessionId,
    method,
    headers: JSON.stringify(headers),
    url,
    body: body ? new Uint8Array(body) : null,
    contentType: headers['content-type'] || 'application/octet-stream',
    isBinary: false,
    clientIp,
    remoteIp,
    createdAt: new Date().toISOString(),
  }
})

const mockGetToken = vi.fn(async (_sessionId: string, tokenId: string): Promise<{
  id: string
  sessionId: string
  createdAt: string
  responseEnabled: boolean
  responseStatus: number
  responseHeaders: null
  responseBody: null
} | null> => ({
  id: tokenId,
  sessionId: 'test-session',
  createdAt: new Date().toISOString(),
  responseEnabled: false,
  responseStatus: 200,
  responseHeaders: null,
  responseBody: null,
}))

vi.mock('~~/server/lib/redis-db', () => ({
  getToken: mockGetToken,
  insertRequest: mockInsertRequest,
}))

vi.mock('~~/server/lib/session', () => ({
  getOrCreateSession: vi.fn(async () => 'test-session'),
}))

describe('POST /api/token/[token]/ingest', () => {
  let handler: (event: H3Event) => Promise<unknown>
  let h3Module: typeof import('h3') & { __setMockBody?: (value: unknown) => void }

  beforeEach(async () => {
    vi.clearAllMocks()
    h3Module = await import('h3') as typeof import('h3') & { __setMockBody?: (value: unknown) => void }
    handler = (await import('../../server/api/token/[token]/ingest.post')).default
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should successfully ingest a simple GET request', async () => {
    const tokenId = 'test-token-123'
    const rawRequest = 'GET /api/test HTTP/1.1\r\nHost: example.com\r\nUser-Agent: TestClient/1.0\r\n\r\n'

    h3Module.__setMockBody?.({ raw: rawRequest })

    const event = createH3Event({
      context: { params: { token: tokenId } },
    })

    const result = await handler(event)

    expect(result).toEqual({
      ok: true,
      request: {
        id: 999,
        method: 'GET',
        url: '/api/test',
        createdAt: expect.any(String),
      },
    })

    expect(mockInsertRequest).toHaveBeenCalledWith(
      'test-session',
      tokenId,
      'GET',
      { host: 'example.com', 'user-agent': 'TestClient/1.0' },
      null,
      '/api/test',
      '127.0.0.1',
      '127.0.0.1'
    )
  })

  it('should successfully ingest a POST request with body', async () => {
    const tokenId = 'test-token-456'
    const rawRequest = 'POST /api/data HTTP/1.1\r\nHost: api.example.com\r\nContent-Type: application/json\r\nContent-Length: 27\r\n\r\n{"name":"test","value":123}'

    h3Module.__setMockBody?.({ raw: rawRequest })

    const event = createH3Event({
      context: { params: { token: tokenId } },
    })

    const result = await handler(event)

    expect(result).toHaveProperty('ok', true)
    expect(mockInsertRequest).toHaveBeenCalledWith(
      'test-session',
      tokenId,
      'POST',
      {
        host: 'api.example.com',
        'content-type': 'application/json',
        'content-length': '27',
      },
      Buffer.from('{"name":"test","value":123}'),
      '/api/data',
      expect.any(String),
      expect.any(String)
    )
  })

  it('should use custom clientIp and remoteIp if provided', async () => {
    const tokenId = 'test-token-789'
    const rawRequest = 'GET /test HTTP/1.1\r\nHost: example.com\r\n\r\n'

    h3Module.__setMockBody?.({
      raw: rawRequest,
      clientIp: '10.0.0.5',
      remoteIp: '203.0.113.1',
    })

    const event = createH3Event({
      context: { params: { token: tokenId } },
    })

    await handler(event)

    expect(mockInsertRequest).toHaveBeenCalledWith(
      'test-session',
      tokenId,
      'GET',
      { host: 'example.com' },
      null,
      '/test',
      '10.0.0.5',
      '203.0.113.1'
    )
  })

  it('should publish request.received event', async () => {
    const tokenId = 'test-token-events'
    const rawRequest = 'GET /events HTTP/1.1\r\nHost: example.com\r\n\r\n'

    h3Module.__setMockBody?.({ raw: rawRequest })

    const events = useServerEvents()
    const received: string[] = []
    const sub = { id: 'sub-test', send: (data: string) => received.push(data) }
    const unsubscribe = events.subscribeToToken(tokenId, sub)

    const event = createH3Event({
      context: { params: { token: tokenId } },
    })

    await handler(event)

    expect(received.length).toBeGreaterThanOrEqual(1)
    const parsed = JSON.parse(received[received.length - 1])
    expect(parsed.type).toBe('request.received')
    expect(parsed.request).toBeDefined()
    expect(parsed.request.tokenId).toBe(tokenId)
    expect(parsed.token).toBe(tokenId)

    unsubscribe()
  })

  it('should handle requests with multiple headers', async () => {
    const tokenId = 'test-multi-headers'
    const rawRequest = [
      'POST /api/webhook HTTP/1.1',
      'Host: webhook.example.com',
      'Content-Type: application/json',
      'Authorization: Bearer token123',
      'X-Custom-Header: custom-value',
      'User-Agent: Mozilla/5.0',
      '',
      '{"event":"test"}',
    ].join('\r\n')

    h3Module.__setMockBody?.({ raw: rawRequest })

    const event = createH3Event({
      context: { params: { token: tokenId } },
    })

    await handler(event)

    expect(mockInsertRequest).toHaveBeenCalledWith(
      'test-session',
      tokenId,
      'POST',
      {
        host: 'webhook.example.com',
        'content-type': 'application/json',
        authorization: 'Bearer token123',
        'x-custom-header': 'custom-value',
        'user-agent': 'Mozilla/5.0',
      },
      Buffer.from('{"event":"test"}'),
      '/api/webhook',
      expect.any(String),
      expect.any(String)
    )
  })

  it('should handle PUT and PATCH methods', async () => {
    const tokenId = 'test-put-patch'
    
    // Test PUT
    let rawRequest = 'PUT /api/resource/1 HTTP/1.1\r\nHost: api.example.com\r\n\r\n{"updated":true}'
    h3Module.__setMockBody?.({ raw: rawRequest })
    
    let event = createH3Event({
      context: { params: { token: tokenId } },
    })
    
    await handler(event)
    expect(mockInsertRequest).toHaveBeenLastCalledWith(
      expect.any(String),
      tokenId,
      'PUT',
      expect.any(Object),
      Buffer.from('{"updated":true}'),
      '/api/resource/1',
      expect.any(String),
      expect.any(String)
    )

    // Test PATCH
    rawRequest = 'PATCH /api/resource/2 HTTP/1.1\r\nHost: api.example.com\r\n\r\n{"patched":true}'
    h3Module.__setMockBody?.({ raw: rawRequest })
    
    event = createH3Event({
      context: { params: { token: tokenId } },
    })
    
    await handler(event)
    expect(mockInsertRequest).toHaveBeenLastCalledWith(
      expect.any(String),
      tokenId,
      'PATCH',
      expect.any(Object),
      Buffer.from('{"patched":true}'),
      '/api/resource/2',
      expect.any(String),
      expect.any(String)
    )
  })

  it('should return 400 if token is missing', async () => {
    h3Module.__setMockBody?.({ raw: 'GET /test HTTP/1.1\r\n\r\n' })

    const event = createH3Event({
      context: { params: {} },
    })

    await expect(handler(event)).rejects.toThrow('Token ID is required')
  })

  it('should return 404 if token does not exist', async () => {
    const tokenId = 'non-existent-token'
    mockGetToken.mockResolvedValueOnce(null)

    h3Module.__setMockBody?.({ raw: 'GET /test HTTP/1.1\r\n\r\n' })

    const event = createH3Event({
      context: { params: { token: tokenId } },
    })

    await expect(handler(event)).rejects.toThrow('Token not found')
  })

  it('should return 400 if raw field is missing', async () => {
    const tokenId = 'test-token'
    h3Module.__setMockBody?.({ notRaw: 'wrong field' })

    const event = createH3Event({
      context: { params: { token: tokenId } },
    })

    await expect(handler(event)).rejects.toThrow('Invalid request body')
  })

  it('should return 400 if raw request is malformed', async () => {
    const tokenId = 'test-token'
    h3Module.__setMockBody?.({ raw: 'This is not a valid HTTP request' })

    const event = createH3Event({
      context: { params: { token: tokenId } },
    })

    await expect(handler(event)).rejects.toThrow('Failed to parse raw request')
  })

  it('should return 400 if request line is missing', async () => {
    const tokenId = 'test-token'
    h3Module.__setMockBody?.({ raw: '' })

    const event = createH3Event({
      context: { params: { token: tokenId } },
    })

    await expect(handler(event)).rejects.toThrow('Failed to parse raw request')
  })

  it('should handle requests with empty body', async () => {
    const tokenId = 'test-empty-body'
    const rawRequest = 'DELETE /api/resource/123 HTTP/1.1\r\nHost: api.example.com\r\n\r\n'

    h3Module.__setMockBody?.({ raw: rawRequest })

    const event = createH3Event({
      context: { params: { token: tokenId } },
    })

    await handler(event)

    expect(mockInsertRequest).toHaveBeenCalledWith(
      'test-session',
      tokenId,
      'DELETE',
      { host: 'api.example.com' },
      null,
      '/api/resource/123',
      expect.any(String),
      expect.any(String)
    )
  })

  it('should handle requests with query parameters', async () => {
    const tokenId = 'test-query-params'
    const rawRequest = 'GET /api/search?q=test&limit=10 HTTP/1.1\r\nHost: example.com\r\n\r\n'

    h3Module.__setMockBody?.({ raw: rawRequest })

    const event = createH3Event({
      context: { params: { token: tokenId } },
    })

    await handler(event)

    expect(mockInsertRequest).toHaveBeenCalledWith(
      'test-session',
      tokenId,
      'GET',
      { host: 'example.com' },
      null,
      '/api/search?q=test&limit=10',
      expect.any(String),
      expect.any(String)
    )
  })

  it('should handle requests with full URLs', async () => {
    const tokenId = 'test-full-url'
    const rawRequest = 'GET http://example.com/api/test HTTP/1.1\r\nHost: example.com\r\n\r\n'

    h3Module.__setMockBody?.({ raw: rawRequest })

    const event = createH3Event({
      context: { params: { token: tokenId } },
    })

    await handler(event)

    expect(mockInsertRequest).toHaveBeenCalledWith(
      'test-session',
      tokenId,
      'GET',
      { host: 'example.com' },
      null,
      'http://example.com/api/test',
      expect.any(String),
      expect.any(String)
    )
  })

  it('should handle requests with full URLs', async () => {
    const tokenId = 'test-full-url'
    const rawRequest = 'GET http://example.com/api/test HTTP/1.1\r\nHost: example.com\r\n\r\n'

    h3Module.__setMockBody?.({ raw: rawRequest })

    const event = createH3Event({
      context: { params: { token: tokenId } },
    })

    await handler(event)

    expect(mockInsertRequest).toHaveBeenCalledWith(
      'test-session',
      tokenId,
      'GET',
      { host: 'example.com' },
      null,
      'http://example.com/api/test',
      expect.any(String),
      expect.any(String)
    )
  })

  it('should handle requests with full HTTPS URLs and query parameters', async () => {
    const tokenId = 'test-https-url'
    const rawRequest = 'POST https://api.example.com/webhook?key=value&token=abc123 HTTP/1.1\r\nHost: api.example.com\r\nContent-Type: application/json\r\n\r\n{"event":"test"}'

    h3Module.__setMockBody?.({ raw: rawRequest })

    const event = createH3Event({
      context: { params: { token: tokenId } },
    })

    await handler(event)

    expect(mockInsertRequest).toHaveBeenCalledWith(
      'test-session',
      tokenId,
      'POST',
      {
        host: 'api.example.com',
        'content-type': 'application/json',
      },
      Buffer.from('{"event":"test"}'),
      'https://api.example.com/webhook?key=value&token=abc123',
      expect.any(String),
      expect.any(String)
    )
  })

  it('should normalize header names to lowercase', async () => {
    const tokenId = 'test-header-case'
    const rawRequest = [
      'POST /test HTTP/1.1',
      'Host: example.com',
      'Content-Type: text/plain',
      'X-Custom-Header: value',
      'UPPERCASE-HEADER: test',
      '',
      'body',
    ].join('\r\n')

    h3Module.__setMockBody?.({ raw: rawRequest })

    const event = createH3Event({
      context: { params: { token: tokenId } },
    })

    await handler(event)

    expect(mockInsertRequest).toHaveBeenCalledWith(
      'test-session',
      tokenId,
      'POST',
      {
        host: 'example.com',
        'content-type': 'text/plain',
        'x-custom-header': 'value',
        'uppercase-header': 'test',
      },
      Buffer.from('body'),
      '/test',
      expect.any(String),
      expect.any(String)
    )
  })

  it('should handle multiline body content', async () => {
    const tokenId = 'test-multiline'
    const bodyContent = 'Line 1\r\nLine 2\r\nLine 3'
    const rawRequest = `POST /api/text HTTP/1.1\r\nHost: example.com\r\nContent-Type: text/plain\r\n\r\n${bodyContent}`

    h3Module.__setMockBody?.({ raw: rawRequest })

    const event = createH3Event({
      context: { params: { token: tokenId } },
    })

    await handler(event)

    expect(mockInsertRequest).toHaveBeenCalledWith(
      'test-session',
      tokenId,
      'POST',
      {
        host: 'example.com',
        'content-type': 'text/plain',
      },
      Buffer.from(bodyContent),
      '/api/text',
      expect.any(String),
      expect.any(String)
    )
  })
})
