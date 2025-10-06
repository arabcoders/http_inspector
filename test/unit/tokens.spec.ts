import { describe, it, expect, vi, beforeEach } from 'vitest'
import createH3Event from '../utils/createH3Event'
import type { TestH3Event } from '../utils/createH3Event'
import handler from '../../server/api/token/index'

vi.mock('~~/server/lib/db', () => ({
  getUserTokens: vi.fn(async () => []),
  createToken: vi.fn(async () => ({ 
    id: 'abc123', 
    sessionId: 'session-123',
    createdAt: new Date(),
    responseEnabled: false,
    responseStatus: 200,
    responseHeaders: null,
    responseBody: null,
  })),
  deleteAllTokens: vi.fn(async () => ({})),
}))

vi.mock('~~/server/lib/session', () => ({
  getOrCreateSession: vi.fn(async () => 'session-123'),
}))

vi.mock('~~/server/lib/events', () => ({
  useServerEvents: vi.fn(() => ({
    publish: vi.fn(),
    subscribeToSession: vi.fn(() => vi.fn()),
    subscribeToToken: vi.fn(() => vi.fn()),
    getSubscriberCount: vi.fn(() => 0),
    getActiveChannels: vi.fn(() => []),
    getTotalSubscribers: vi.fn(() => 0),
    __clearAll: vi.fn(),
  })),
}))

describe('tokens api', () => {
  beforeEach(() => vi.clearAllMocks())
  it('creates a token via POST', async () => {
  const override: Partial<TestH3Event> = { node: { req: { method: 'POST' }, res: { statusCode: 0, end: () => {} } } }
  const event = createH3Event(override)
    const result = await handler(event)
    expect(result && typeof (result as Record<string, unknown>).id === 'string').toBe(true)
  })
})
