import { describe, it, expect, vi, beforeEach } from 'vitest'
import createH3Event from '../utils/createH3Event'
import type { TestH3Event } from '../utils/createH3Event'
import handler from '../../server/api/token/index'

vi.mock('~~/server/lib/redis-db', () => ({
  getUserTokens: vi.fn(async () => []),
  createToken: vi.fn(async () => ({ id: 'abc123', createdAt: new Date().toISOString() })),
  deleteAllTokens: vi.fn(async () => ({})),
}))

vi.mock('~~/server/lib/session', () => ({
  getOrCreateSession: vi.fn(async () => 'session-123'),
}))

vi.mock('~~/server/lib/events', () => ({
  publishGlobal: vi.fn(),
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
