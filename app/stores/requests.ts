import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import type { Request, RequestSummary } from '~~/shared/types'

/**
 * Requests store - handles all request-related API operations
 * Uses TanStack Query for caching and state management
 */
export const useRequestsStore = () => {
    const queryClient = useQueryClient()

    /**
     * Query to fetch all requests for a token
     */
    const useRequestsList = (tokenId: Ref<string> | string) => {
        const id = computed(() => unref(tokenId))

        return useQuery({
            queryKey: ['requests', id],
            queryFn: async () => await $fetch<RequestSummary[]>(`/api/token/${id.value}/requests`),
            enabled: computed(() => !!id.value),
            staleTime: 1000 * 10,
        })
    }

    /**
     * Query to fetch a single request by ID
     */
    const useRequest = (params: { tokenId: Ref<string> | string; requestId: Ref<string> | string }) => {
        const tokenId = computed(() => unref(params.tokenId))
        const requestId = computed(() => unref(params.requestId))

        return useQuery({
            queryKey: ['request', tokenId, requestId],
            queryFn: async () => await $fetch<RequestSummary>(`/api/token/${tokenId.value}/requests/${requestId.value}`),
            enabled: computed(() => !!tokenId.value && !!requestId.value),
            staleTime: 1000 * 60,
        })
    }

    /**
     * Mutation to delete a single request
     */
    const useDeleteRequest = () => useMutation({
        mutationFn: async (params: { tokenId: string; requestId: string }) => {
            await $fetch(`/api/token/${params.tokenId}/requests/${params.requestId}`, { method: 'DELETE' })
        },
        onSuccess: (data, variables) => queryClient.invalidateQueries({ queryKey: ['requests', variables.tokenId] }),
    })

    /**
     * Mutation to delete all requests for a token
     */
    const useDeleteAllRequests = () => useMutation({
        mutationFn: async (tokenId: string) => await $fetch<unknown>(`/api/token/${tokenId}/requests`, { method: 'DELETE' }),
        onSuccess: (data, variables) => queryClient.invalidateQueries({ queryKey: ['requests', variables] }),
    })

    /**
     * Mutation to ingest a new request manually
     */
    const useIngestRequest = () => {
        type reqType = { tokenId: string, body: { raw: string, clientIp?: string, remoteIp?: string } }
        type respType = { ok: boolean, request: Pick<Request, 'id' | 'method' | 'createdAt' | 'url'> }
        return useMutation({
            mutationFn: async (params: reqType) => {
                return await $fetch<respType>(`/api/token/${params.tokenId}/ingest`, {
                    method: 'POST',
                    body: params.body,
                })
            },
            onSuccess: (data, variables) => queryClient.invalidateQueries({ queryKey: ['requests', variables.tokenId] }),
        })
    }

    /**
     * Helper to add a new request to the cache (from SSE events)
     * This optimistically updates the cache without a network request
     */
    const addRequestToCache = (tokenId: string, request: RequestSummary) => queryClient.setQueryData<RequestSummary[]>(
        ['requests', tokenId],
        old => old ? [request, ...old] : [request]
    )

    /**
     * Helper to remove a request from the cache (from SSE events)
     * This optimistically updates the cache without a network request
     */
    const removeRequestFromCache = (tokenId: string, requestId: string) => queryClient.setQueryData<RequestSummary[]>(
        ['requests', tokenId],
        old => old ? old.filter(r => r.id !== requestId) : []
    )

    /**
     * Helper to clear all requests from the cache (from SSE events)
     * This optimistically updates the cache without a network request
     */
    const clearRequestsCache = (tokenId: string) => queryClient.setQueryData<RequestSummary[]>(['requests', tokenId], [])

    return {
        // Query hooks
        useRequestsList,
        useRequest,
        // Mutation hooks
        useDeleteRequest,
        useDeleteAllRequests,
        useIngestRequest,
        // Cache helpers for SSE events
        addRequestToCache,
        removeRequestFromCache,
        clearRequestsCache,
    }
}
