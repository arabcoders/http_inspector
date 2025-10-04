import { ref } from 'vue'

type FetchFn = (url: string, init?: RequestInit) => Promise<unknown>

export const useTokens = (opts?: { fetchFn?: FetchFn }) => {
  const fetchFn: FetchFn = opts?.fetchFn ?? (async (u: string, i?: RequestInit) => {
    const res = await fetch(u, i)
    const txt = await res.text()
    try {
      return txt ? JSON.parse(txt) : null
    } catch {
      return txt
    }
  })

  const tokens = ref<Array<{ id: string; createdAt?: string }>>([])

  const loadTokens = async () => {
    const res = await fetchFn('/api/token')
    tokens.value = (res || []) as Array<{ id: string; createdAt?: string }>
  }

  const createToken = async () => {
    const res = await fetchFn('/api/token', { method: 'POST' })
    await loadTokens()
    return res
  }

  const clearTokens = async () => {
    await fetchFn('/api/token', { method: 'DELETE' })
    await loadTokens()
  }

  const deleteToken = async (id: string) => {
    await fetchFn(`/api/token/${id}`, { method: 'DELETE' })
    await loadTokens()
  }

  return { tokens, loadTokens, createToken, clearTokens, deleteToken }
}
