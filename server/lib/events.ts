/**
 * Server-Side Event (SSE) Management System
 * 
 * Provides two event channels:
 * - Session Channel: Global feed for all events in a user's session
 * - Token Channel: Specific feed for events related to a particular token
 * 
 * All events are published to the session channel, and token-specific events
 * are also published to their respective token channels.
 */

import type { Request, Token } from './redis-db'

/**
 * Event type definitions for type-safe event publishing and subscription
 */
export interface ServerEventMap {
  'request.received': { token: string; request: Request }
  'request.deleted': { token: string; requestId: string }
  'request.cleared': { token: string }
  'token.created': { token: Pick<Token, 'id' | 'createdAt'> }
  'token.deleted': { token: { id: string } }
  'token.cleared': Record<string, never>
  'token.response.updated': { token: { id: string; responseEnabled: boolean; responseStatus: number } }
}

export type ServerEventType = keyof ServerEventMap
export type ServerEventPayload<T extends ServerEventType> = ServerEventMap[T]

/**
 * Subscriber interface for SSE connections
 */
export interface Subscriber {
  id: string
  send: (data: string) => void
}

/**
 * Event channel types
 */
export type ChannelType = 'session' | 'token'

/**
 * Internal subscriber storage
 */
class SubscriberStore {
  private sessionSubs = new Map<string, Map<string, Subscriber>>()
  private tokenSubs = new Map<string, Map<string, Subscriber>>()

  /**
   * Subscribe to a channel
   * 
   * @param channel - 'session' or 'token'
   * @param key - Session ID or Token ID
   * @param subscriber - Subscriber object with unique ID and send function
   */
  subscribe(channel: ChannelType, key: string, subscriber: Subscriber): void {
    const store = 'session' === channel ? this.sessionSubs : this.tokenSubs
    let map = store.get(key)

    if (!map) {
      map = new Map()
      store.set(key, map)
    }

    map.set(subscriber.id, subscriber)
  }

  /**
   * Unsubscribe from a channel
   * 
   * @param channel - 'session' or 'token'
   * @param key - Session ID or Token ID
   * @param subscriberId - Unique ID of the subscriber to remove
   * 
   * @returns true if the subscriber was found and removed, false otherwise
   */
  unsubscribe(channel: ChannelType, key: string, subscriberId: string): boolean {
    const store = 'session' === channel ? this.sessionSubs : this.tokenSubs
    const map = store.get(key)

    if (!map) {
      return false
    }

    const result = map.delete(subscriberId)

    if (0 === map.size) {
      store.delete(key)
    }

    return result
  }

  /**
   * Get all subscribers for a channel key
   * 
   * @param channel - 'session' or 'token'
   * @param key - Session ID or Token ID
   * 
   * @returns Array of subscribers (empty if none)
   */
  getSubscribers(channel: ChannelType, key: string): Subscriber[] {
    const store = 'session' === channel ? this.sessionSubs : this.tokenSubs
    const map = store.get(key)
    return map ? Array.from(map.values()) : []
  }

  /**
   * Get subscriber count for a channel key
   * 
   * @param channel - 'session' or 'token'
   * @param key - Session ID or Token ID
   * 
   * @returns Number of subscribers (0 if none)
   */
  getSubscriberCount(channel: ChannelType, key: string): number {
    const store = 'session' === channel ? this.sessionSubs : this.tokenSubs
    return store.get(key)?.size ?? 0
  }

  /**
   * Get all active channel keys
   * 
   * @param channel - 'session' or 'token'
   * 
   * @returns Array of active keys (session IDs or token IDs)
   */
  getActiveChannels(channel: ChannelType): string[] {
    const store = 'session' === channel ? this.sessionSubs : this.tokenSubs
    return Array.from(store.keys())
  }

  /**
   * Clear all subscribers (for testing)
   * @internal
   */
  clear(): void {
    this.sessionSubs.clear()
    this.tokenSubs.clear()
  }

  /**
   * Get total subscriber count across all channels
   * 
   * @param channel - 'session' or 'token'
   * 
   * @returns Total number of subscribers
   */
  getTotalCount(channel: ChannelType): number {
    const store = 'session' === channel ? this.sessionSubs : this.tokenSubs
    let total = 0
    for (const map of store.values()) {
      total += map.size
    }
    return total
  }
}

// Singleton instance
const store = new SubscriberStore()

/**
 * Event broadcasting utility
 */
class EventBroadcaster {
  /**
   * Broadcast message to all subscribers on a channel
   */
  private broadcast(subscribers: Subscriber[], message: string): number {
    let successCount = 0

    for (const sub of subscribers) {
      try {
        sub.send(message)
        successCount++
      } catch (err) {
        console.warn(`[SSE] Failed to send event to subscriber ${sub.id}:`, err)
      }
    }

    return successCount
  }

  /**
   * Publish event to session channel
   * 
   * @param sessionId - Session ID
   * @param eventType - Type of event to publish
   * @param payload - Event payload (must match ServerEventMap)
   * 
   * @returns Number of subscribers notified
   */
  publishToSession(sessionId: string, eventType: ServerEventType, payload: unknown): number {
    const subscribers = store.getSubscribers('session', sessionId)

    if (0 === subscribers.length) {
      return 0
    }

    const message = JSON.stringify({ type: eventType, ...payload as object })
    return this.broadcast(subscribers, message)
  }

  /**
   * Publish event to token channel
   * 
   * @param token - Token ID
   * @param eventType - Type of event to publish
   * @param payload - Event payload (must match ServerEventMap)
   * 
   * @returns Number of subscribers notified
   */
  publishToToken(token: string, eventType: ServerEventType, payload: unknown): number {
    const subscribers = store.getSubscribers('token', token)

    if (0 === subscribers.length) {
      return 0
    }

    // Token channel includes the token in the message
    const message = JSON.stringify({ type: eventType, token, ...payload as object })
    return this.broadcast(subscribers, message)
  }
}

const broadcaster = new EventBroadcaster()

export const useServerEvents = () => ({
  /**
   * Subscribe to session channel (global feed)
   * 
   * @param sessionId - Session ID
   * @param subscriber - Subscriber object with unique ID and send function
   * 
   * @returns Unsubscribe function
   */
  subscribeToSession(sessionId: string, subscriber: Subscriber): () => void {
    store.subscribe('session', sessionId, subscriber)
    return () => store.unsubscribe('session', sessionId, subscriber.id)
  },

  /**
   * Subscribe to token channel (token-specific feed)
   * 
   * @param token - Token ID
   * @param subscriber - Subscriber object with unique ID and send function
   * 
   * @returns Unsubscribe function
   */
  subscribeToToken(token: string, subscriber: Subscriber): () => void {
    store.subscribe('token', token, subscriber)
    return () => store.unsubscribe('token', token, subscriber.id)
  },

  /**
   * Publish event to appropriate channels
   * 
   * @param sessionId - Session ID for global feed
   * @param eventType - Type of event to publish
   * @param payload - Event payload (must match ServerEventMap)
   * 
   * @returns Object with counts of subscribers notified on each channel
   */
  publish<T extends ServerEventType>(sessionId: string, eventType: T, payload: ServerEventPayload<T>): { session: number; token: number } {
    // Always publish to session channel
    const sessionCount = broadcaster.publishToSession(sessionId, eventType, payload)

    // If event has a token, also publish to token channel
    let tokenCount = 0
    const payloadObj = payload as { token?: string }

    if (payloadObj.token) {
      tokenCount = broadcaster.publishToToken(payloadObj.token, eventType, payload)
    }

    return { session: sessionCount, token: tokenCount }
  },

  /**
   * Get subscriber count for a channel
   * 
   * @param channel - 'session' or 'token'
   * @param key - Session ID or Token ID
   * 
   * @returns Number of subscribers (0 if none)
   */
  getSubscriberCount(channel: ChannelType, key: string): number {
    return store.getSubscriberCount(channel, key)
  },

  /**
   * Get all active channels
   * 
   * @param channel - 'session' or 'token'
   * 
   * @returns Array of active keys (session IDs or token IDs)
   */
  getActiveChannels(channel: ChannelType): string[] {
    return store.getActiveChannels(channel)
  },

  /**
   * Get total subscriber count
   * 
   * @param channel - 'session' or 'token'
   * 
   * @returns Total number of subscribers
   */
  getTotalSubscribers(channel: ChannelType): number {
    return store.getTotalCount(channel)
  },

  /**
   * Internal testing utility - DO NOT USE IN PRODUCTION
   * @internal
   */
  __clearAll(): void {
    store.clear()
  },
})
