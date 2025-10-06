import { ref, readonly, computed } from 'vue'
import type { Ref } from 'vue'
import type {
    SSEConnectionStatus,
    SSEEventPayload,
    SSEEventMap,
    SSEEventType,
    SSEEventListener,
    SSEGenericEventListener,
    SSEStatusListener
} from '~~/shared/types'

let eventSource: EventSource | null = null
let reconnectAttempts = 0
let reconnectTimeoutId: ReturnType<typeof setTimeout> | null = null

const MAX_RECONNECT_DELAY = 30000 // 30 seconds
const BASE_RECONNECT_DELAY = 1000 // 1 second

const connectionStatus = ref<SSEConnectionStatus>('disconnected')
const typedListeners = new Map<SSEEventType, Set<SSEEventListener>>()
const genericListeners = new Set<SSEGenericEventListener>()
const statusListeners = new Set<SSEStatusListener>()

const getReconnectDelay = (): number => {
    const delay = Math.min(BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttempts), MAX_RECONNECT_DELAY)
    reconnectAttempts++
    return delay
}

const updateStatus = (status: SSEConnectionStatus): void => {
    if (connectionStatus.value === status) {
        return
    }

    connectionStatus.value = status

    for (const listener of Array.from(statusListeners)) {
        try {
            listener(status)
        } catch (err) {
            console.error('[SSE] Status listener error:', err)
        }
    }
}

const dispatchEvent = (payload: SSEEventPayload): void => {
    if (payload.type && typedListeners.has(payload.type as SSEEventType)) {
        const listeners = typedListeners.get(payload.type as SSEEventType)!
        for (const listener of Array.from(listeners)) {
            try {
                listener(payload as SSEEventMap[SSEEventType])
            } catch (err) {
                console.error(`[SSE] Event listener error (${payload.type}):`, err)
            }
        }
    }

    for (const listener of Array.from(genericListeners)) {
        try {
            listener(payload)
        } catch (err) {
            console.error('[SSE] Generic listener error:', err)
        }
    }
}

const connect = (url: string = '/api/events', opts: EventSourceInit | undefined = undefined): void => {
    if ('undefined' === typeof window) {
        return
    }

    if (eventSource) {
        try {
            eventSource.close()
        } catch {
            // Ignore errors
        }
        eventSource = null
    }

    if (reconnectTimeoutId) {
        clearTimeout(reconnectTimeoutId)
        reconnectTimeoutId = null
    }

    updateStatus('connecting')

    eventSource = new EventSource(url, opts)

    eventSource.addEventListener('open', () => {
        console.debug('[SSE] Connection established')
        reconnectAttempts = 0
        updateStatus('connected')
    })

    eventSource.addEventListener('message', (event: MessageEvent) => {
        try {
            const payload = JSON.parse(event.data) as SSEEventPayload

            if (!payload || 'object' !== typeof payload) {
                console.warn('[SSE] Invalid event payload:', event.data)
                return
            }

            dispatchEvent(payload)
        } catch (err) {
            console.error('[SSE] Failed to parse event data:', err)
        }
    })

    eventSource.addEventListener('error', () => {
        console.warn('[SSE] Connection error, will attempt to reconnect...')
        updateStatus('disconnected')

        try {
            eventSource?.close()
        } catch {
            // Ignore errors
        }
        eventSource = null

        if (false === hasActiveListeners()) {
            return
        }

        const delay = getReconnectDelay()
        console.log(`[SSE] Reconnecting in ${delay}ms...`)
        reconnectTimeoutId = setTimeout(() => connect(url), delay)
    })
}

const disconnect = (): void => {
    if (reconnectTimeoutId) {
        clearTimeout(reconnectTimeoutId)
        reconnectTimeoutId = null
    }

    if (eventSource) {
        try {
            eventSource.close()
            console.log('[SSE] Connection closed')
        } catch {
            // Ignore errors
        }
        eventSource = null
    }

    reconnectAttempts = 0
    updateStatus('disconnected')
}

const hasActiveListeners = (): boolean => {
    if (genericListeners.size > 0) {
        return true
    }

    for (const listeners of typedListeners.values()) {
        if (listeners.size > 0) {
            return true
        }
    }

    return false
}

const cleanupIfNoListeners = (): void => {
    if (!hasActiveListeners()) {
        disconnect()
    }
}

export const useSSE = (autoConnect: boolean = true) => {
    if (autoConnect && 'undefined' !== typeof window && !eventSource && hasActiveListeners()) {
        connect()
    }

    return {
        status: readonly(connectionStatus) as Readonly<Ref<SSEConnectionStatus>>,

        /**
         * Subscribe to one or more event types
         * 
         * @param eventType - Single event type or array of event types to listen for
         * @param listener - The callback function
         * 
         * @returns Unsubscribe function
         */
        on<T extends SSEEventType>(eventType: T | T[], listener: SSEEventListener<T>): () => void {
            const eventTypes = Array.isArray(eventType) ? eventType : [eventType]
            const unsubscribeFns: Array<() => void> = []

            for (const type of eventTypes) {
                if (!typedListeners.has(type)) {
                    typedListeners.set(type, new Set())
                }

                const listeners = typedListeners.get(type)!
                listeners.add(listener as SSEEventListener)

                unsubscribeFns.push(() => {
                    listeners.delete(listener as SSEEventListener)
                    if (0 === listeners.size) {
                        typedListeners.delete(type)
                    }
                })
            }

            if (!eventSource && typeof window !== 'undefined') {
                connect()
            }

            return () => {
                for (const removeListener of unsubscribeFns) {
                    removeListener()
                }
                cleanupIfNoListeners()
            }
        },

        /**
         * Subscribe to all events (generic listener)
         * 
         * @param listener - The callback function that receives all events
         * @returns Unsubscribe function
         */
        onAny(listener: SSEGenericEventListener): () => void {
            genericListeners.add(listener)

            if (!eventSource && 'undefined' !== typeof window) {
                connect()
            }

            return () => {
                genericListeners.delete(listener)
                cleanupIfNoListeners()
            }
        },

        /**
         * Subscribe to connection status changes
         * 
         * @param listener - The callback function
         * @returns Unsubscribe function
         */
        onStatusChange(listener: SSEStatusListener): () => void {
            statusListeners.add(listener)

            try {
                listener(connectionStatus.value)
            } catch (err) {
                console.error('[SSE] Status listener error:', err)
            }

            return () => statusListeners.delete(listener)
        },

        /**
         * Manually trigger a reconnection
         */
        reconnect(): void {
            console.log('[SSE] Manual reconnection triggered')
            reconnectAttempts = 0
            connect()
        },

        /**
         * Emit an event.
         * 
         * @param payload - The event payload to emit
         */
        emit(payload: SSEEventPayload): void { dispatchEvent(payload) },

        /**
         * Manually disconnect
         */
        disconnect,

        isConnected: computed(() => 'connected' === connectionStatus.value),
        isConnecting: computed(() => 'connecting' === connectionStatus.value),
        isDisconnected: computed(() => 'disconnected' === connectionStatus.value),
    }
}

/**
 * Reset all module state (for testing purposes)
 * @internal
 */
export function __resetSSEState() {
    disconnect()
    typedListeners.clear()
    genericListeners.clear()
    statusListeners.clear()
    reconnectAttempts = 0
    connectionStatus.value = 'disconnected'
}

// Cleanup on window unload
if ('undefined' !== typeof window) {
    window.addEventListener('beforeunload', () => disconnect())
}