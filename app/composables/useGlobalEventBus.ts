/**
 * Global event bus for SSE events and auth state changes
 * Allows components across the app to listen for events and auth changes
 */

import type { ClientEventPayload } from './useClientEvents'

type EventListener = (payload: ClientEventPayload) => void
type AuthChangeListener = () => void

const listeners = new Set<EventListener>()
const authChangeListeners = new Set<AuthChangeListener>()

export const useGlobalEventBus = () => {
  const emit = (event: string, payload?: ClientEventPayload) => {
    if (event === 'sse:event' && payload) {
      // Notify all SSE listeners
      for (const listener of Array.from(listeners)) {
        try {
          listener(payload)
        } catch (err) {
          console.error('Global event bus listener error:', err)
        }
      }
    } else if (event === 'auth:changed') {
      // Notify all auth change listeners
      for (const listener of Array.from(authChangeListeners)) {
        try {
          listener()
        } catch (err) {
          console.error('Auth change listener error:', err)
        }
      }
    }
  }

  const on = (event: string, listener: EventListener | AuthChangeListener) => {
    if (event === 'sse:event') {
      listeners.add(listener as EventListener)
      return () => {
        listeners.delete(listener as EventListener)
      }
    } else if (event === 'auth:changed') {
      authChangeListeners.add(listener as AuthChangeListener)
      return () => {
        authChangeListeners.delete(listener as AuthChangeListener)
      }
    }
    return () => { }
  }

  const off = (event: string, listener: EventListener | AuthChangeListener) => {
    if (event === 'sse:event') {
      listeners.delete(listener as EventListener)
    } else if (event === 'auth:changed') {
      authChangeListeners.delete(listener as AuthChangeListener)
    }
  }

  return { emit, on, off }
}
