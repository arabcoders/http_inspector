import { useMutation, useQuery } from '@tanstack/vue-query'
import type { ApiSuccessResponse, Session } from '~~/shared/types'

/** API operations for authentication and session controls. */
export const useSessionStore = () => {
  const useAuthStatus = () => useQuery({
    queryKey: ['auth-status'],
    queryFn: ({ signal }) => $fetch<{ required: boolean; authenticated: boolean }>('/api/auth/status', { signal }),
    enabled: import.meta.client,
  })

  const useSession = () => useQuery({
    queryKey: ['session'],
    queryFn: ({ signal }) => $fetch<Session>('/api/session', { signal }),
    enabled: import.meta.client,
  })

  const useLogin = () => useMutation({
    mutationFn: (body: { username: string; password: string }) =>
      $fetch<ApiSuccessResponse>('/api/auth/login', { method: 'POST', body }),
  })

  const useLogout = () => useMutation({
    mutationFn: () => $fetch<ApiSuccessResponse>('/api/auth/logout', { method: 'POST' }),
  })

  const useRestoreSession = () => useMutation({
    mutationFn: (sessionId: string) => $fetch<{ success: boolean }>('/api/session/restore', {
      method: 'POST',
      body: { sessionId },
    }),
  })

  return { useAuthStatus, useSession, useLogin, useLogout, useRestoreSession }
}
