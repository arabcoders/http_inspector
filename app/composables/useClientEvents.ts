/**
 * Client-side SSE composable for global server-sent events (/api/events)
 * Provides real-time updates for requests across the application
 */

import { useSSEStatus } from './useSSEStatus'

export type ClientEventPayload = {
  type?: string
  token?: string
  request?: Record<string, unknown>
  requestId?: number
}

type Listener = (payload: ClientEventPayload) => void

const listeners = new Set<Listener>()
let source: EventSource | null = null
let reconnectAttempts = 0
const MAX_RECONNECT_DELAY = 10000 // 10 seconds
const BASE_RECONNECT_DELAY = 1000 // 1 second

const getReconnectDelay = (): number => {
  // Exponential backoff: 1s, 2s, 4s, 8s, 10s (max)
  const delay = Math.min(BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttempts), MAX_RECONNECT_DELAY)
  reconnectAttempts++
  return delay
}

const ensureSource = () => {
  if ('undefined' === typeof window || source) {
    return
  }

  const { setStatus } = useSSEStatus()
  setStatus('connecting')

  source = new EventSource('/api/events')

  source.addEventListener('message', event => {
    reconnectAttempts = 0

    let payload: ClientEventPayload | null = null
    try {
      payload = JSON.parse((event as MessageEvent).data || '{}') as ClientEventPayload
    } catch {
      payload = null
    }

    if (!payload) {
      return
    }

    for (const listener of Array.from(listeners)) {
      try {
        listener(payload)
      } catch (err) {
        console.error('Client event listener error', err)
      }
    }
  })

  source.addEventListener('open', () => {
    reconnectAttempts = 0
    setStatus('connected')
  })

  source.onerror = () => {
    console.warn('[SSE] Connection error, attempting to reconnect...')
    setStatus('disconnected')
    
    try {
      source?.close()
    } catch {
      // ignore
    }
    source = null

    if (listeners.size) {
      const delay = getReconnectDelay()
      setTimeout(() => ensureSource(), delay)
    }
  }
}

/**
 * Subscribe to client-side SSE events.
 * @param listener Callback function to handle incoming events
 * @returns Unsubscribe function to cleanup the listener
 */
export const subscribeToClientEvents = (listener: Listener) => {
  if ('undefined' === typeof window) {
    return () => { }
  }

  listeners.add(listener)
  ensureSource()

  return () => {
    listeners.delete(listener)

    if (listeners.size === 0 && source) {
      try {
        source.close()
        console.log('[SSE] Closed connection (no active listeners)')
      } catch {
        // ignore
      }
      source = null
      reconnectAttempts = 0
      
      const { setStatus } = useSSEStatus()
      setStatus('disconnected')
    }
  }
}

/**
 * Force reconnect the SSE connection
 */
export const reconnectSSE = () => {
  if ('undefined' === typeof window) {
    return
  }

  console.log('[SSE] Manual reconnect triggered')
  
  if (source) {
    try {
      source.close()
    } catch {
      // ignore
    }
    source = null
  }

  reconnectAttempts = 0
  ensureSource()
}

// Cleanup on page unload
if ('undefined' !== typeof window) {
  window.addEventListener('beforeunload', () => {
    if (source) {
      try {
        source.close()
      } catch {
        // ignore
      }
      source = null
    }
  })
}

export default subscribeToClientEvents
