/**
 * Composable to track global SSE connection status
 */

export type SSEConnectionStatus = 'connected' | 'connecting' | 'disconnected'

const connectionStatus = ref<SSEConnectionStatus>('connecting')
const reconnectCallbacks = new Set<() => void>()

export const useSSEStatus = () => {
  const setStatus = (status: SSEConnectionStatus) => {
    connectionStatus.value = status
  }

  const registerReconnectCallback = (callback: () => void) => {
    reconnectCallbacks.add(callback)
    return () => reconnectCallbacks.delete(callback)
  }

  const triggerReconnect = () => {
    for (const callback of Array.from(reconnectCallbacks)) {
      try {
        callback()
      } catch (err) {
        console.error('SSE reconnect callback error:', err)
      }
    }
  }

  return {
    status: readonly(connectionStatus),
    setStatus,
    registerReconnectCallback,
    triggerReconnect,
  }
}
