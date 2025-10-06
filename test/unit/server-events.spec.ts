/**
 * Tests for Server-Side Events System
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useServerEvents, type Subscriber, type ServerEventPayload } from '../../server/lib/events'

describe('useServerEvents', () => {
  let events: ReturnType<typeof useServerEvents>

  beforeEach(() => {
    events = useServerEvents()
    events.__clearAll() // Reset state before each test
  })

  describe('subscription management', () => {
    it('should subscribe to session channel', () => {
      const mockSub: Subscriber = {
        id: 'sub-1',
        send: vi.fn(),
      }

      const unsubscribe = events.subscribeToSession('session-1', mockSub)

      expect(events.getSubscriberCount('session', 'session-1')).toBe(1)
      expect(typeof unsubscribe).toBe('function')
    })

    it('should subscribe to token channel', () => {
      const mockSub: Subscriber = {
        id: 'sub-1',
        send: vi.fn(),
      }

      const unsubscribe = events.subscribeToToken('token-1', mockSub)

      expect(events.getSubscriberCount('token', 'token-1')).toBe(1)
      expect(typeof unsubscribe).toBe('function')
    })

    it('should allow multiple subscribers on same channel', () => {
      const sub1: Subscriber = { id: 'sub-1', send: vi.fn() }
      const sub2: Subscriber = { id: 'sub-2', send: vi.fn() }

      events.subscribeToSession('session-1', sub1)
      events.subscribeToSession('session-1', sub2)

      expect(events.getSubscriberCount('session', 'session-1')).toBe(2)
    })

    it('should unsubscribe from session channel', () => {
      const mockSub: Subscriber = { id: 'sub-1', send: vi.fn() }
      const unsubscribe = events.subscribeToSession('session-1', mockSub)

      expect(events.getSubscriberCount('session', 'session-1')).toBe(1)

      unsubscribe()

      expect(events.getSubscriberCount('session', 'session-1')).toBe(0)
    })

    it('should unsubscribe from token channel', () => {
      const mockSub: Subscriber = { id: 'sub-1', send: vi.fn() }
      const unsubscribe = events.subscribeToToken('token-1', mockSub)

      expect(events.getSubscriberCount('token', 'token-1')).toBe(1)

      unsubscribe()

      expect(events.getSubscriberCount('token', 'token-1')).toBe(0)
    })

    it('should handle unsubscribing one of multiple subscribers', () => {
      const sub1: Subscriber = { id: 'sub-1', send: vi.fn() }
      const sub2: Subscriber = { id: 'sub-2', send: vi.fn() }

      const unsub1 = events.subscribeToSession('session-1', sub1)
      events.subscribeToSession('session-1', sub2)

      expect(events.getSubscriberCount('session', 'session-1')).toBe(2)

      unsub1()

      expect(events.getSubscriberCount('session', 'session-1')).toBe(1)
    })
  })

  describe('event publishing', () => {
    it('should publish request.received event to both channels', () => {
      const sessionSub: Subscriber = { id: 'session-sub', send: vi.fn() }
      const tokenSub: Subscriber = { id: 'token-sub', send: vi.fn() }

      events.subscribeToSession('session-1', sessionSub)
      events.subscribeToToken('token-1', tokenSub)

      const payload: ServerEventPayload<'request.received'> = {
        token: 'token-1',
        request: {
          id: 1,
          tokenId: 'token-1',
          sessionId: 'session-1',
          method: 'POST',
          headers: '{}',
          url: '/test',
          body: null,
          contentType: 'application/json',
          isBinary: false,
          clientIp: '127.0.0.1',
          remoteIp: '127.0.0.1',
          createdAt: new Date().toISOString(),
        },
      }

      const result = events.publish('session-1', 'request.received', payload)

      expect(result.session).toBe(1)
      expect(result.token).toBe(1)
      expect(sessionSub.send).toHaveBeenCalledOnce()
      expect(tokenSub.send).toHaveBeenCalledOnce()

      // Verify message format
      const sessionMessage = (sessionSub.send as ReturnType<typeof vi.fn>).mock.calls[0][0]
      const sessionData = JSON.parse(sessionMessage)
      expect(sessionData.type).toBe('request.received')
      expect(sessionData.token).toBe('token-1')
      expect(sessionData.request.id).toBe(1)

      const tokenMessage = (tokenSub.send as ReturnType<typeof vi.fn>).mock.calls[0][0]
      const tokenData = JSON.parse(tokenMessage)
      expect(tokenData.type).toBe('request.received')
      expect(tokenData.token).toBe('token-1')
    })

    it('should publish token.created event only to session channel', () => {
      const sessionSub: Subscriber = { id: 'session-sub', send: vi.fn() }
      const tokenSub: Subscriber = { id: 'token-sub', send: vi.fn() }

      events.subscribeToSession('session-1', sessionSub)
      events.subscribeToToken('token-1', tokenSub)

      const payload: ServerEventPayload<'token.created'> = {
        token: {
          id: 'token-1',
          createdAt: new Date().toISOString(),
        },
      }

      const result = events.publish('session-1', 'token.created', payload)

      expect(result.session).toBe(1)
      expect(result.token).toBe(0) // No token in payload, so not published to token channel
      expect(sessionSub.send).toHaveBeenCalledOnce()
      expect(tokenSub.send).not.toHaveBeenCalled()
    })

    it('should publish token.cleared event only to session channel', () => {
      const sessionSub: Subscriber = { id: 'session-sub', send: vi.fn() }

      events.subscribeToSession('session-1', sessionSub)

      const payload: ServerEventPayload<'token.cleared'> = {}

      const result = events.publish('session-1', 'token.cleared', payload)

      expect(result.session).toBe(1)
      expect(result.token).toBe(0)
      expect(sessionSub.send).toHaveBeenCalledOnce()
    })

    it('should publish request.deleted event to both channels', () => {
      const sessionSub: Subscriber = { id: 'session-sub', send: vi.fn() }
      const tokenSub: Subscriber = { id: 'token-sub', send: vi.fn() }

      events.subscribeToSession('session-1', sessionSub)
      events.subscribeToToken('token-1', tokenSub)

      const payload: ServerEventPayload<'request.deleted'> = {
        token: 'token-1',
        requestId: 123,
      }

      const result = events.publish('session-1', 'request.deleted', payload)

      expect(result.session).toBe(1)
      expect(result.token).toBe(1)
    })

    it('should handle publishing with no subscribers', () => {
      const payload: ServerEventPayload<'request.deleted'> = {
        token: 'token-1',
        requestId: 123,
      }

      const result = events.publish('session-1', 'request.deleted', payload)

      expect(result.session).toBe(0)
      expect(result.token).toBe(0)
    })

    it('should publish to multiple subscribers on same channel', () => {
      const sub1: Subscriber = { id: 'sub-1', send: vi.fn() }
      const sub2: Subscriber = { id: 'sub-2', send: vi.fn() }
      const sub3: Subscriber = { id: 'sub-3', send: vi.fn() }

      events.subscribeToSession('session-1', sub1)
      events.subscribeToSession('session-1', sub2)
      events.subscribeToSession('session-1', sub3)

      const payload: ServerEventPayload<'token.cleared'> = {}

      const result = events.publish('session-1', 'token.cleared', payload)

      expect(result.session).toBe(3)
      expect(sub1.send).toHaveBeenCalledOnce()
      expect(sub2.send).toHaveBeenCalledOnce()
      expect(sub3.send).toHaveBeenCalledOnce()
    })
  })

  describe('error handling', () => {
    it('should handle subscriber send errors gracefully', () => {
      const goodSub: Subscriber = { id: 'good', send: vi.fn() }
      const badSub: Subscriber = {
        id: 'bad',
        send: vi.fn(() => {
          throw new Error('Send failed')
        }),
      }

      events.subscribeToSession('session-1', goodSub)
      events.subscribeToSession('session-1', badSub)

      const payload: ServerEventPayload<'token.cleared'> = {}

      // Should not throw
      const result = events.publish('session-1', 'token.cleared', payload)

      // Good subscriber still receives event
      expect(result.session).toBe(1) // Only good sub succeeded
      expect(goodSub.send).toHaveBeenCalledOnce()
      expect(badSub.send).toHaveBeenCalledOnce()
    })

    it('should continue publishing to remaining subscribers after error', () => {
      const sub1: Subscriber = { id: 'sub-1', send: vi.fn() }
      const sub2: Subscriber = {
        id: 'sub-2',
        send: vi.fn(() => {
          throw new Error('Failed')
        }),
      }
      const sub3: Subscriber = { id: 'sub-3', send: vi.fn() }

      events.subscribeToSession('session-1', sub1)
      events.subscribeToSession('session-1', sub2)
      events.subscribeToSession('session-1', sub3)

      const payload: ServerEventPayload<'token.cleared'> = {}

      const result = events.publish('session-1', 'token.cleared', payload)

      expect(result.session).toBe(2) // sub1 and sub3 succeeded
      expect(sub1.send).toHaveBeenCalledOnce()
      expect(sub3.send).toHaveBeenCalledOnce()
    })
  })

  describe('channel queries', () => {
    it('should get active session channels', () => {
      events.subscribeToSession('session-1', { id: 'sub-1', send: vi.fn() })
      events.subscribeToSession('session-2', { id: 'sub-2', send: vi.fn() })

      const channels = events.getActiveChannels('session')

      expect(channels).toHaveLength(2)
      expect(channels).toContain('session-1')
      expect(channels).toContain('session-2')
    })

    it('should get active token channels', () => {
      events.subscribeToToken('token-1', { id: 'sub-1', send: vi.fn() })
      events.subscribeToToken('token-2', { id: 'sub-2', send: vi.fn() })

      const channels = events.getActiveChannels('token')

      expect(channels).toHaveLength(2)
      expect(channels).toContain('token-1')
      expect(channels).toContain('token-2')
    })

    it('should get total subscriber count', () => {
      events.subscribeToSession('session-1', { id: 'sub-1', send: vi.fn() })
      events.subscribeToSession('session-1', { id: 'sub-2', send: vi.fn() })
      events.subscribeToSession('session-2', { id: 'sub-3', send: vi.fn() })

      expect(events.getTotalSubscribers('session')).toBe(3)
    })

    it('should clean up empty channels after unsubscribe', () => {
      const unsub = events.subscribeToSession('session-1', { id: 'sub-1', send: vi.fn() })

      expect(events.getActiveChannels('session')).toHaveLength(1)

      unsub()

      expect(events.getActiveChannels('session')).toHaveLength(0)
    })
  })

  describe('type safety', () => {
    it('should enforce correct payload types for request.received', () => {
      const sessionSub: Subscriber = { id: 'sub', send: vi.fn() }
      events.subscribeToSession('session-1', sessionSub)

      const validPayload: ServerEventPayload<'request.received'> = {
        token: 'token-1',
        request: {
          id: 1,
          tokenId: 'token-1',
          sessionId: 'session-1',
          method: 'GET',
          headers: '{}',
          url: '/test',
          body: null,
          contentType: 'text/plain',
          isBinary: false,
          clientIp: '127.0.0.1',
          remoteIp: '127.0.0.1',
          createdAt: new Date().toISOString(),
        },
      }

      // This should compile and work
      events.publish('session-1', 'request.received', validPayload)

      expect(sessionSub.send).toHaveBeenCalledOnce()
    })

    it('should enforce correct payload types for token.deleted', () => {
      const sessionSub: Subscriber = { id: 'sub', send: vi.fn() }
      events.subscribeToSession('session-1', sessionSub)

      const validPayload: ServerEventPayload<'token.deleted'> = {
        token: { id: 'token-1' },
      }

      events.publish('session-1', 'token.deleted', validPayload)

      expect(sessionSub.send).toHaveBeenCalledOnce()
    })
  })

  describe('message format', () => {
    it('should include event type in message', () => {
      const sub: Subscriber = { id: 'sub', send: vi.fn() }
      events.subscribeToSession('session-1', sub)

      events.publish('session-1', 'token.cleared', {})

      const message = (sub.send as ReturnType<typeof vi.fn>).mock.calls[0][0]
      const data = JSON.parse(message)

      expect(data.type).toBe('token.cleared')
    })

    it('should include token in message for token channel', () => {
      const sub: Subscriber = { id: 'sub', send: vi.fn() }
      events.subscribeToToken('token-1', sub)

      const payload: ServerEventPayload<'request.deleted'> = {
        token: 'token-1',
        requestId: 123,
      }

      events.publish('session-1', 'request.deleted', payload)

      const message = (sub.send as ReturnType<typeof vi.fn>).mock.calls[0][0]
      const data = JSON.parse(message)

      expect(data.type).toBe('request.deleted')
      expect(data.token).toBe('token-1')
      expect(data.requestId).toBe(123)
    })

    it('should serialize complex payloads correctly', () => {
      const sub: Subscriber = { id: 'sub', send: vi.fn() }
      events.subscribeToSession('session-1', sub)

      const payload: ServerEventPayload<'token.response.updated'> = {
        token: {
          id: 'token-1',
          responseEnabled: true,
          responseStatus: 404,
        },
      }

      events.publish('session-1', 'token.response.updated', payload)

      const message = (sub.send as ReturnType<typeof vi.fn>).mock.calls[0][0]
      const data = JSON.parse(message)

      expect(data.type).toBe('token.response.updated')
      expect(data.token.id).toBe('token-1')
      expect(data.token.responseEnabled).toBe(true)
      expect(data.token.responseStatus).toBe(404)
    })
  })

  describe('cleanup', () => {
    it('should clear all subscribers', () => {
      events.subscribeToSession('session-1', { id: 'sub-1', send: vi.fn() })
      events.subscribeToSession('session-2', { id: 'sub-2', send: vi.fn() })
      events.subscribeToToken('token-1', { id: 'sub-3', send: vi.fn() })

      expect(events.getTotalSubscribers('session')).toBe(2)
      expect(events.getTotalSubscribers('token')).toBe(1)

      events.__clearAll()

      expect(events.getTotalSubscribers('session')).toBe(0)
      expect(events.getTotalSubscribers('token')).toBe(0)
      expect(events.getActiveChannels('session')).toHaveLength(0)
      expect(events.getActiveChannels('token')).toHaveLength(0)
    })
  })

  describe('real-world scenarios', () => {
    it('should handle typical request flow', () => {
      // User connects to global feed
      const globalSub: Subscriber = { id: 'global', send: vi.fn() }
      events.subscribeToSession('session-123', globalSub)

      // User also subscribes to specific token feed
      const tokenSub: Subscriber = { id: 'token', send: vi.fn() }
      events.subscribeToToken('token-abc', tokenSub)

      // Webhook request comes in
      const payload: ServerEventPayload<'request.received'> = {
        token: 'token-abc',
        request: {
          id: 1,
          tokenId: 'token-abc',
          sessionId: 'session-123',
          method: 'POST',
          headers: '{"content-type":"application/json"}',
          url: '/webhook',
          body: new Uint8Array([1, 2, 3]),
          contentType: 'application/json',
          isBinary: false,
          clientIp: '192.168.1.1',
          remoteIp: '192.168.1.1',
          createdAt: new Date().toISOString(),
        },
      }

      const result = events.publish('session-123', 'request.received', payload)

      // Both feeds should receive the event
      expect(result.session).toBe(1)
      expect(result.token).toBe(1)
      expect(globalSub.send).toHaveBeenCalledOnce()
      expect(tokenSub.send).toHaveBeenCalledOnce()
    })

    it('should handle user clearing all tokens', () => {
      const sub: Subscriber = { id: 'sub', send: vi.fn() }
      events.subscribeToSession('session-123', sub)

      events.publish('session-123', 'token.cleared', {})

      expect(sub.send).toHaveBeenCalledOnce()

      const message = (sub.send as ReturnType<typeof vi.fn>).mock.calls[0][0]
      const data = JSON.parse(message)
      expect(data.type).toBe('token.cleared')
    })

    it('should handle token deletion', () => {
      const sessionSub: Subscriber = { id: 'session', send: vi.fn() }
      events.subscribeToSession('session-123', sessionSub)

      const payload: ServerEventPayload<'token.deleted'> = {
        token: { id: 'token-abc' },
      }

      events.publish('session-123', 'token.deleted', payload)

      expect(sessionSub.send).toHaveBeenCalledOnce()

      const message = (sessionSub.send as ReturnType<typeof vi.fn>).mock.calls[0][0]
      const data = JSON.parse(message)
      expect(data.type).toBe('token.deleted')
      expect(data.token.id).toBe('token-abc')
    })

    it('should handle request clearing for specific token', () => {
      const tokenSub: Subscriber = { id: 'token', send: vi.fn() }
      events.subscribeToToken('token-abc', tokenSub)

      const payload: ServerEventPayload<'request.cleared'> = {
        token: 'token-abc',
      }

      events.publish('session-123', 'request.cleared', payload)

      expect(tokenSub.send).toHaveBeenCalledOnce()

      const message = (tokenSub.send as ReturnType<typeof vi.fn>).mock.calls[0][0]
      const data = JSON.parse(message)
      expect(data.type).toBe('request.cleared')
      expect(data.token).toBe('token-abc')
    })
  })
})
