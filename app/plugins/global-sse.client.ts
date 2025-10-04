/**
 * Global SSE Plugin
 * Initializes SSE connection on app startup and keeps it alive across all pages
 * Provides global event bus for real-time notifications
 * 
 * Only connects to SSE if:
 * - Auth is not required, OR
 * - User is authenticated
 */

import { subscribeToClientEvents } from '~/composables/useClientEvents'
import type { ClientEventPayload } from '~/composables/useClientEvents'

export default defineNuxtPlugin(() => {
  if (!import.meta.client) {
    return
  }

  const eventBus = useGlobalEventBus()
  let unsubscribe: (() => void) | null = null

  // Check auth status before connecting to SSE
  const checkAuthAndConnect = async () => {
    try {
      const { authenticated, required } = await $fetch<{ authenticated: boolean; required: boolean }>('/api/auth/status')

      if (!required || authenticated) {
        unsubscribe = subscribeToClientEvents((payload: ClientEventPayload) => eventBus.emit('sse:event', payload))
        console.debug('[SSE Plugin] Connected to global event stream')
      } else {
        console.debug('[SSE Plugin] Not connecting - authentication required but user not logged in')
      }
    } catch (err) {
      console.error('[SSE Plugin] Failed to check auth status:', err)
    }
  }

  checkAuthAndConnect()

  eventBus.on('auth:changed', async () => {
    console.log('[SSE Plugin] Auth state changed, reconnecting...')

    if (unsubscribe) {
      unsubscribe()
      unsubscribe = null
    }

    await checkAuthAndConnect()
  })

  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      if (unsubscribe) {
        unsubscribe()
      }
    })
  }

  return { provide: { globalSSE: { on: eventBus.on, off: eventBus.off } } }
})
