import { ref, watch, type Ref } from 'vue'

/**
 * Creates a reactive ref that persists to localStorage
 * @param key - localStorage key
 * @param defaultValue - default value if nothing stored
 * @returns Reactive ref synchronized with localStorage
 */
export function usePersistedState<T>(key: string, defaultValue: T): Ref<T> {
  const state = ref<T>(defaultValue) as Ref<T>

  // Only run on client side
  if (import.meta.client) {
    try {
      const stored = localStorage.getItem(key)
      if (stored !== null) {
        state.value = JSON.parse(stored) as T
      }
    } catch (error) {
      console.warn(`Failed to load persisted state for key "${key}":`, error)
    }

    // Watch for changes and persist
    watch(state, (newValue) => {
      try {
        localStorage.setItem(key, JSON.stringify(newValue))
      } catch (error) {
        console.warn(`Failed to persist state for key "${key}":`, error)
      }
    })
  }

  return state
}
