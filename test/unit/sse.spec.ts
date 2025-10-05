/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useSSE, __resetSSEState } from '../../app/composables/useSSE'
import type { SSEEventPayload } from '../../app/composables/useSSE'

// Mock EventSource
type EventHandler = (event: unknown) => void

class MockEventSource {
  private listeners: Map<string, Set<EventHandler>> = new Map()
  public readyState: number = 0
  public url: string
  public static instances: MockEventSource[] = []

  constructor(url: string) {
    this.url = url
    MockEventSource.instances.push(this)
    // Simulate async connection
    setTimeout(() => {
      this.readyState = 1
      this.dispatchEvent('open', {})
    }, 10)
  }

  addEventListener(event: string, handler: EventHandler) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(handler)
  }

  removeEventListener(event: string, handler: EventHandler) {
    this.listeners.get(event)?.delete(handler)
  }

  close() {
    this.readyState = 2
  }

  // Test helper to simulate events
  dispatchEvent(event: string, data: unknown) {
    const handlers = this.listeners.get(event)
    if (handlers) {
      for (const handler of handlers) {
        handler(data)
      }
    }
  }

  // Test helper to simulate messages
  sendMessage(payload: SSEEventPayload) {
    const event = { data: JSON.stringify(payload) }
    this.dispatchEvent('message', event)
  }

  // Test helper to simulate errors
  triggerError() {
    this.dispatchEvent('error', {})
  }

  static getLatest(): MockEventSource | undefined {
    return this.instances[this.instances.length - 1]
  }

  static reset() {
    this.instances = []
  }
}

describe('useSSE', () => {
  let originalEventSource: typeof EventSource

  beforeEach(() => {
    // Mock EventSource globally
    originalEventSource = global.EventSource
    global.EventSource = MockEventSource as unknown as typeof EventSource
    MockEventSource.reset()

    // Reset SSE module state
    __resetSSEState()

    // Mock window
    if (typeof global.window === 'undefined') {
      global.window = {} as Window & typeof globalThis
    }
  })

  afterEach(() => {
    // Reset SSE state before restoring EventSource
    __resetSSEState()
    
    global.EventSource = originalEventSource
    vi.clearAllTimers()
    MockEventSource.reset()
  })

  // Helper to get the current mock EventSource instance
  const getMockSource = (): MockEventSource => {
    const instance = MockEventSource.getLatest()
    if (!instance) {
      throw new Error('No MockEventSource instance found. Make sure to wait for connection.')
    }
    return instance
  }

  describe('connection management', () => {
    it('should start with disconnected status', () => {
      const sse = useSSE(false)
      expect(sse.status.value).toBe('disconnected')
      expect(sse.isDisconnected.value).toBe(true)
      expect(sse.isConnected.value).toBe(false)
      expect(sse.isConnecting.value).toBe(false)
    })

    it('should transition to connecting then connected', async () => {
      const sse = useSSE(false)
      const statuses: string[] = []

      sse.onStatusChange((status) => {
        statuses.push(status)
      })

      // Trigger connection by adding a listener
      sse.on('request.received', () => {})

      // Initial status
      expect(statuses[0]).toBe('disconnected')
      expect(statuses[1]).toBe('connecting')

      // Wait for connection
      await new Promise((resolve) => setTimeout(resolve, 20))
      expect(statuses[2]).toBe('connected')
      expect(sse.isConnected.value).toBe(true)
    })

    it('should handle manual reconnection', async () => {
      const sse = useSSE(false)
      const unsubscribe = sse.on('request.received', () => {})

      await new Promise((resolve) => setTimeout(resolve, 20))
      expect(sse.isConnected.value).toBe(true)

      sse.reconnect()
      expect(sse.status.value).toBe('connecting')

      await new Promise((resolve) => setTimeout(resolve, 20))
      expect(sse.isConnected.value).toBe(true)

      unsubscribe()
    })

    it('should handle manual disconnect', async () => {
      const sse = useSSE(false)
      const unsubscribe = sse.on('request.received', () => {})

      await new Promise((resolve) => setTimeout(resolve, 20))
      expect(sse.isConnected.value).toBe(true)

      sse.disconnect()
      expect(sse.isDisconnected.value).toBe(true)

      unsubscribe()
    })
  })

  describe('event listeners', () => {
    it('should receive typed events', async () => {
      const sse = useSSE(false)
      const receivedEvents: SSEEventPayload[] = []

      const unsubscribe = sse.on('request.received', (payload) => {
        receivedEvents.push(payload)
      })

      await new Promise((resolve) => setTimeout(resolve, 20))

      // Simulate incoming event
      const mockSource = getMockSource()
      mockSource.sendMessage({
        type: 'request.received',
        token: 'test-token',
        requestId: 123,
        request: { method: 'POST' },
      })

      expect(receivedEvents).toHaveLength(1)
      expect(receivedEvents[0].type).toBe('request.received')
      expect((receivedEvents[0] as any).token).toBe('test-token')
      expect((receivedEvents[0] as any).requestId).toBe(123)

      unsubscribe()
    })

    it('should receive all events with onAny', async () => {
      const sse = useSSE(false)
      const receivedEvents: SSEEventPayload[] = []

      const unsubscribe = sse.onAny((payload) => {
        receivedEvents.push(payload)
      })

      await new Promise((resolve) => setTimeout(resolve, 20))

      // Get the mock EventSource instance
      const mockSource = getMockSource()

      // Simulate multiple event types
      mockSource.sendMessage({
        type: 'request.received',
        token: 'test-token',
        requestId: 123,
        request: {},
      })

      mockSource.sendMessage({
        type: 'request.deleted',
        token: 'test-token',
        requestId: 456,
      })

      expect(receivedEvents).toHaveLength(2)
      expect(receivedEvents[0].type).toBe('request.received')
      expect(receivedEvents[1].type).toBe('request.deleted')

      unsubscribe()
    })

    it('should support multiple listeners for same event', async () => {
      const sse = useSSE(false)
      const calls1: SSEEventPayload[] = []
      const calls2: SSEEventPayload[] = []

      const unsub1 = sse.on('request.received', (payload) => calls1.push(payload))
      const unsub2 = sse.on('request.received', (payload) => calls2.push(payload))

      await new Promise((resolve) => setTimeout(resolve, 20))

      const mockSource = getMockSource()

      mockSource.sendMessage({
        type: 'request.received',
        token: 'test',
        requestId: 1,
        request: {},
      })

      expect(calls1).toHaveLength(1)
      expect(calls2).toHaveLength(1)

      unsub1()
      unsub2()
    })

    it('should unsubscribe correctly', async () => {
      const sse = useSSE(false)
      const receivedEvents: SSEEventPayload[] = []

      const unsubscribe = sse.on('request.received', (payload) => {
        receivedEvents.push(payload)
      })

      await new Promise((resolve) => setTimeout(resolve, 20))

      const mockSource = getMockSource()

      mockSource.sendMessage({
        type: 'request.received',
        token: 'test',
        requestId: 1,
        request: {},
      })

      expect(receivedEvents).toHaveLength(1)

      // Unsubscribe
      unsubscribe()

      // Send another message
      mockSource.sendMessage({
        type: 'request.received',
        token: 'test',
        requestId: 2,
        request: {},
      })

      // Should still be 1 (not received after unsubscribe)
      expect(receivedEvents).toHaveLength(1)
    })

    it('should handle listener errors gracefully', async () => {
      const sse = useSSE(false)
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

      const unsubscribe = sse.on('request.received', () => {
        throw new Error('Listener error')
      })

      await new Promise((resolve) => setTimeout(resolve, 20))

      const mockSource = getMockSource()

      mockSource.sendMessage({
        type: 'request.received',
        token: 'test',
        requestId: 1,
        request: {},
      })

      expect(consoleError).toHaveBeenCalled()

      consoleError.mockRestore()
      unsubscribe()
    })
  })

  describe('extensibility', () => {
    it('should handle custom event types', async () => {
      const sse = useSSE(false)
      const receivedEvents: SSEEventPayload[] = []

      const unsubscribe = sse.onAny((payload) => {
        receivedEvents.push(payload)
      })

      await new Promise((resolve) => setTimeout(resolve, 20))

      const mockSource = getMockSource()

      // Send a custom event type (not in SSEEventMap)
      mockSource.sendMessage({
        type: 'custom.event',
        customField: 'test-data',
      })

      expect(receivedEvents).toHaveLength(1)
      expect(receivedEvents[0].type).toBe('custom.event')
      expect((receivedEvents[0] as any).customField).toBe('test-data')

      unsubscribe()
    })

    it('should handle all predefined event types', async () => {
      const sse = useSSE(false)
      const eventTypes: string[] = []

      const unsubscribe = sse.onAny((payload) => {
        eventTypes.push(payload.type)
      })

      await new Promise((resolve) => setTimeout(resolve, 20))

      const mockSource = getMockSource()

      // Test all predefined event types
      mockSource.sendMessage({ type: 'request.received', token: 't1', requestId: 1, request: {} })
      mockSource.sendMessage({ type: 'request.deleted', token: 't1', requestId: 1 })
      mockSource.sendMessage({ type: 'request.cleared', token: 't1' })
      mockSource.sendMessage({ type: 'token.created', token: 't1' })
      mockSource.sendMessage({ type: 'token.deleted', token: 't1' })

      expect(eventTypes).toEqual([
        'request.received',
        'request.deleted',
        'request.cleared',
        'token.created',
        'token.deleted',
      ])

      unsubscribe()
    })
  })

  describe('array event subscription', () => {
    it('should subscribe to multiple event types with array', async () => {
      const sse = useSSE(false)
      const receivedEvents: SSEEventPayload[] = []

      const unsubscribe = sse.on(['request.received', 'request.deleted'], (payload) => {
        receivedEvents.push(payload)
      })

      await new Promise((resolve) => setTimeout(resolve, 20))

      const mockSource = getMockSource()

      // Send events of subscribed types
      mockSource.sendMessage({
        type: 'request.received',
        token: 't1',
        requestId: 1,
        request: {},
      })

      mockSource.sendMessage({
        type: 'request.deleted',
        token: 't1',
        requestId: 2,
      })

      // Send event of non-subscribed type
      mockSource.sendMessage({
        type: 'request.cleared',
        token: 't1',
      })

      expect(receivedEvents).toHaveLength(2)
      expect(receivedEvents[0].type).toBe('request.received')
      expect(receivedEvents[1].type).toBe('request.deleted')

      unsubscribe()
    })

    it('should unsubscribe from all events when using array', async () => {
      const sse = useSSE(false)
      const receivedEvents: SSEEventPayload[] = []

      const unsubscribe = sse.on(['request.received', 'request.deleted', 'token.created'], (payload) => {
        receivedEvents.push(payload)
      })

      await new Promise((resolve) => setTimeout(resolve, 20))

      const mockSource = getMockSource()

      mockSource.sendMessage({ type: 'request.received', token: 't1', requestId: 1, request: {} })
      expect(receivedEvents).toHaveLength(1)

      // Unsubscribe
      unsubscribe()

      // Send more events
      mockSource.sendMessage({ type: 'request.deleted', token: 't1', requestId: 1 })
      mockSource.sendMessage({ type: 'token.created', token: 't1' })

      // Should still be 1 (not received after unsubscribe)
      expect(receivedEvents).toHaveLength(1)
    })

    it('should work with mix of single and array subscriptions', async () => {
      const sse = useSSE(false)
      const arrayEvents: SSEEventPayload[] = []
      const singleEvents: SSEEventPayload[] = []

      const unsub1 = sse.on(['request.received', 'request.deleted'], (payload) => {
        arrayEvents.push(payload)
      })

      const unsub2 = sse.on('request.received', (payload) => {
        singleEvents.push(payload)
      })

      await new Promise((resolve) => setTimeout(resolve, 20))

      const mockSource = getMockSource()

      mockSource.sendMessage({
        type: 'request.received',
        token: 't1',
        requestId: 1,
        request: {},
      })

      // Both listeners should receive the event
      expect(arrayEvents).toHaveLength(1)
      expect(singleEvents).toHaveLength(1)

      mockSource.sendMessage({
        type: 'request.deleted',
        token: 't1',
        requestId: 2,
      })

      // Only array listener should receive this
      expect(arrayEvents).toHaveLength(2)
      expect(singleEvents).toHaveLength(1)

      unsub1()
      unsub2()
    })
  })

  describe('manual event emission', () => {
    it('should emit events manually', () => {
      const sse = useSSE(false)
      const receivedEvents: SSEEventPayload[] = []

      sse.on('request.received', (payload) => {
        receivedEvents.push(payload)
      })

      // Manually emit an event
      sse.emit({
        type: 'request.received',
        token: 'manual-token',
        requestId: 999,
        request: { manual: true },
      })

      expect(receivedEvents).toHaveLength(1)
      expect((receivedEvents[0] as any).token).toBe('manual-token')
      expect((receivedEvents[0] as any).requestId).toBe(999)
    })

    it('should emit to multiple listeners', () => {
      const sse = useSSE(false)
      const listener1Events: SSEEventPayload[] = []
      const listener2Events: SSEEventPayload[] = []

      sse.on('token.created', (payload) => listener1Events.push(payload))
      sse.on('token.created', (payload) => listener2Events.push(payload))

      sse.emit({
        type: 'token.created',
        token: 'new-token',
      })

      expect(listener1Events).toHaveLength(1)
      expect(listener2Events).toHaveLength(1)
    })

    it('should emit to generic listeners', () => {
      const sse = useSSE(false)
      const genericEvents: SSEEventPayload[] = []
      const typedEvents: SSEEventPayload[] = []

      sse.onAny((payload) => genericEvents.push(payload))
      sse.on('request.deleted', (payload) => typedEvents.push(payload))

      sse.emit({
        type: 'request.deleted',
        token: 't1',
        requestId: 123,
      })

      expect(genericEvents).toHaveLength(1)
      expect(typedEvents).toHaveLength(1)
    })

    it('should emit custom event types', () => {
      const sse = useSSE(false)
      const customEvents: SSEEventPayload[] = []

      sse.onAny((payload) => customEvents.push(payload))

      sse.emit({
        type: 'custom.event',
        customData: 'test',
      })

      expect(customEvents).toHaveLength(1)
      expect(customEvents[0].type).toBe('custom.event')
      expect((customEvents[0] as any).customData).toBe('test')
    })

    it('should emit without active connection', () => {
      const sse = useSSE(false)
      const receivedEvents: SSEEventPayload[] = []

      // Don't wait for connection
      sse.on('request.received', (payload) => {
        receivedEvents.push(payload)
      })

      // Emit immediately (may not be connected yet)
      sse.emit({
        type: 'request.received',
        token: 't1',
        requestId: 1,
        request: {},
      })

      expect(receivedEvents).toHaveLength(1)
    })
  })

  describe('type safety', () => {
    it('should enforce correct payload types', () => {
      const sse = useSSE(false)

      // This should compile without errors
      sse.on('request.received', (payload) => {
        // TypeScript should know these fields exist
        const _token: string = payload.token
        const _requestId: number = payload.requestId
        const _request: Record<string, unknown> = payload.request
      })

      sse.on('request.deleted', (payload) => {
        // TypeScript should know these fields exist
        const _token: string = payload.token
        const _requestId: number = payload.requestId
      })

      sse.on('token.created', (payload) => {
        // TypeScript should know this field exists
        const _token: string = payload.token
      })
    })
  })

  describe('auto-cleanup', () => {
    it('should disconnect when no listeners remain', async () => {
      const sse = useSSE(false)

      const unsub1 = sse.on('request.received', () => {})
      const unsub2 = sse.on('request.deleted', () => {})

      await new Promise((resolve) => setTimeout(resolve, 20))
      expect(sse.isConnected.value).toBe(true)

      // Remove first listener
      unsub1()
      
      // Small delay to allow for any async cleanup
      await new Promise((resolve) => setTimeout(resolve, 5))
      expect(sse.isConnected.value).toBe(true) // Still connected (has listener)

      // Remove second listener
      unsub2()
      
      // Small delay to allow for cleanup
      await new Promise((resolve) => setTimeout(resolve, 5))
      
      // Should auto-disconnect
      expect(sse.isDisconnected.value).toBe(true)
    })

    it('should not disconnect if generic listener exists', async () => {
      const sse = useSSE(false)

      const unsub1 = sse.on('request.received', () => {})
      const unsub2 = sse.onAny(() => {})

      await new Promise((resolve) => setTimeout(resolve, 20))
      expect(sse.isConnected.value).toBe(true)

      // Remove typed listener
      unsub1()
      
      await new Promise((resolve) => setTimeout(resolve, 5))
      expect(sse.isConnected.value).toBe(true) // Still connected (has generic listener)

      // Remove generic listener
      unsub2()
      
      await new Promise((resolve) => setTimeout(resolve, 5))
      expect(sse.isDisconnected.value).toBe(true)
    })
  })

  describe('error handling', () => {
    it('should handle invalid JSON gracefully', async () => {
      const sse = useSSE(false)
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
      const receivedEvents: SSEEventPayload[] = []

      const unsubscribe = sse.onAny((payload) => {
        receivedEvents.push(payload)
      })

      await new Promise((resolve) => setTimeout(resolve, 20))

      const mockSource = getMockSource()

      // Simulate invalid JSON
      mockSource.dispatchEvent('message', { data: 'invalid json{' })

      expect(receivedEvents).toHaveLength(0)
      expect(consoleError).toHaveBeenCalled()

      consoleError.mockRestore()
      unsubscribe()
    })

    it('should handle connection errors', async () => {
      vi.useFakeTimers()
      const sse = useSSE(false)
      const statuses: string[] = []

      sse.onStatusChange((status) => {
        statuses.push(status)
      })

      const unsubscribe = sse.on('request.received', () => {})

      await vi.advanceTimersByTimeAsync(20)

      const mockSource = getMockSource()

      // Trigger error
      mockSource.triggerError()

      expect(statuses).toContain('disconnected')

      vi.useRealTimers()
      unsubscribe()
    })
  })
})
