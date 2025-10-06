import { describe, it, expect, vi, beforeEach } from 'vitest'
import createH3Event from '../utils/createH3Event'
import type { H3Event } from 'h3'
import { useServerEvents } from '../../server/lib/events'

// Partial mock of h3 to control readBody during the test. We keep the real
// h3 exports otherwise by importing the actual module and overriding readBody.
vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  return { ...actual, readBody: vi.fn(async (_ev: unknown) => Buffer.from('hello world')) }
})

// Mock the DB layer so the test is hermetic and fast. We assert these mocks
// are called as part of the integration flow.
const insertRequestMock = vi.fn(async (
  sessionId: string,
  tokenId: string,
  method: string,
  headers: Record<string, string>,
  _body: Buffer | null,
  url?: string,
  remoteIp?: string,
  clientIp?: string,
) => {
  return {
    id: 123,
    sessionId,
    tokenId,
    method,
    headers: JSON.stringify(headers || {}),
    url,
    contentType: headers['content-type'] || 'application/octet-stream',
    contentLength: _body ? _body.length : 0,
    remoteIp,
    clientIp,
    createdAt: new Date(),
  }
})

vi.mock('~~/server/lib/db', () => ({
  getToken: vi.fn(async (sessionId: string, id: string) => ({ 
    id, 
    sessionId,
    createdAt: new Date(),
    responseEnabled: false, 
    responseStatus: 200, 
    responseHeaders: null, 
    responseBody: null 
  })),
  getSessionIdForToken: vi.fn(async () => 'session-123'),
  insertRequest: insertRequestMock,
  listRequestsForToken: vi.fn(async (tokenId: string) => [{ 
    id: 123, 
    tokenId, 
    method: 'POST', 
    headers: '{}', 
    url: `/api/${tokenId}`, 
    createdAt: new Date() 
  }]),
}))

describe('integration: payload -> events -> db (handler-level)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('publishes request.received to subscribers and calls insertRequest', async () => {
  // import the handler after mocks are registered
  const handler = (await import('../../server/api/payload/[token].ts')).default as (event: H3Event) => Promise<unknown>

    const tokenId = 'test-token'
    const events = useServerEvents()

    const received: string[] = []
    const sub = { id: 'sub-1', send: (data: string) => received.push(data) }
    const unsubscribe = events.subscribeToToken(tokenId, sub)

    const event = createH3Event({
      node: {
        req: {
          method: 'POST',
          headers: { 'content-type': 'text/plain' },
          url: `/api/payload/${tokenId}`,
        },
        res: {
          statusCode: 0,
          end: () => {},
        },
      },
      context: { params: { token: tokenId } },
    })

    ;(event.node.req as unknown as { body?: Buffer }).body = Buffer.from('hello world')

    // Call the payload handler which should call insertRequest and publish an event
    await handler(event)

    // allow microtasks to flush (publish uses sync in-memory publish)
    expect(insertRequestMock).toHaveBeenCalled()
    // the subscriber should have received at least one SSE data message
    expect(received.length).toBeGreaterThanOrEqual(1)

    // Check that the published payload contains type 'request.received'
    const parsed = JSON.parse(received[received.length - 1])
    expect(parsed.type).toBe('request.received')
    expect(parsed.request).toBeDefined()
    expect(parsed.request.tokenId).toBe(tokenId)

    // cleanup
    unsubscribe()
  })
})
