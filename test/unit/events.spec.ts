import { describe, it, expect } from 'vitest'
import { subscribeToToken, unsubscribeFromToken, publish } from '../../server/lib/events'

describe('events pubsub', () => {
  it('delivers messages to token subscriber', () => {
    const messages: string[] = []
    const sub = { id: 's1', send: (d: string) => messages.push(d) }
    subscribeToToken('t1', sub)
    publish('t1', { type: 'foo', payload: 1 })
    expect(messages.length).toBe(1)
    unsubscribeFromToken('t1', 's1')
  })
})
