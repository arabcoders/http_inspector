import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import type { ApiSuccessResponse, Token, TokenListItem } from '~~/shared/types'

type TokenDetails = Omit<Token, 'responseHeaders' | 'createdAt'> & {
    responseHeaders: Record<string, string> | null
    createdAt: string
}

/**
 * Tokens store - handles all token-related API operations
 * Uses TanStack Query for caching and state management
 */
export const useTokensStore = () => {
    const queryClient = useQueryClient()

    /**
     * Query to fetch all tokens for the current session
     */
    const useTokensList = () => {
        return useQuery({
            queryKey: ['tokens'],
            queryFn: ({ signal }) => $fetch<TokenListItem[]>('/api/token', { signal }),
            enabled: import.meta.client,
            staleTime: 1000 * 30,
        })
    }

    /**
     * Query to fetch a single token by ID
     */
    const useToken = (tokenId: Ref<string> | string) => {
        const id = computed(() => unref(tokenId))

        return useQuery({
            queryKey: ['token', id],
            queryFn: ({ queryKey: [, token], signal }) => $fetch<TokenDetails>(`/api/token/${token}`, { signal }),
            enabled: computed(() => import.meta.client && !!id.value),
            staleTime: 1000 * 60, // 1 minute
        })
    }

    /**
     * Mutation to create a new token
     */
    const useCreateToken = () => {
        return useMutation({
            mutationFn: async () => await $fetch<Token>('/api/token', { method: 'POST' }),
            onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tokens'] }),
        })
    }

    /**
     * Mutation to update a token (response settings)
     */
    const useUpdateToken = () => {
        return useMutation({
            mutationFn: async (params: {
                tokenId: string
                updates: Pick<Token, 'responseEnabled' | 'responseStatus' | 'responseHeaders' | 'responseBody'>
            }) => {
                return await $fetch<ApiSuccessResponse>(`/api/token/${params.tokenId}`, { method: 'PATCH', body: params.updates })
            },
            onSuccess: (_, { tokenId }) => Promise.all([
                queryClient.invalidateQueries({ queryKey: ['token', tokenId] }),
                queryClient.invalidateQueries({ queryKey: ['tokens'] }),
            ]),
        })
    }

    /**
     * Mutation to delete a single token
     */
    const useDeleteToken = () => useMutation({
        mutationFn: async (tokenId: string) => await $fetch<unknown>(`/api/token/${tokenId}`, { method: 'DELETE' }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tokens'] }),
    })

    /**
     * Mutation to delete all tokens
     */
    const useDeleteAllTokens = () => useMutation({
        mutationFn: async () => await $fetch<unknown>('/api/token', { method: 'DELETE' }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tokens'] }),
    })

    return {
        // Query hooks
        useTokensList,
        useToken,
        // Mutation hooks
        useCreateToken,
        useUpdateToken,
        useDeleteToken,
        useDeleteAllTokens,
    }
}
