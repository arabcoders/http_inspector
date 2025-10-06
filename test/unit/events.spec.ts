import { describe, it, expect } from 'vitest'
import { useServerEvents } from '../../server/lib/events'

describe('events pubsub', () => {
  it('delivers messages to token subscriber', () => {
    const events = useServerEvents()
    events.__clearAll() // Clean up before test
    
    const messages: string[] = []
    const sub = { id: 's1', send: (d: string) => messages.push(d) }
    const unsubscribe = events.subscribeToToken('t1', sub)
    
    // Publish event - need to provide sessionId and proper payload
    events.publish('session-1', 'request.received', {
      token: 't1',
      request: {
        id: 1,
        tokenId: 't1',
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
      }
    })
    
    expect(messages.length).toBe(1)
    unsubscribe()
    events.__clearAll() // Clean up after test
  })
})
