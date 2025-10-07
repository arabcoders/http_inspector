import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import type { Token, TokenListItem } from '~~/shared/types'

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
            queryFn: async () => await $fetch<TokenListItem[]>('/api/token'),
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
            queryFn: async () => await $fetch<Token>(`/api/token/${id.value}`),
            enabled: computed(() => !!id.value),
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
                return await $fetch<Token>(`/api/token/${params.tokenId}`, { method: 'PATCH', body: params.updates })
            },
            onSuccess: (data, variables) => {
                queryClient.invalidateQueries({ queryKey: ['token', variables.tokenId] })
                queryClient.invalidateQueries({ queryKey: ['tokens'] })
            },
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
