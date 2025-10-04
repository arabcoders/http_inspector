<template>
    <aside
        class="flex w-80 flex-col border-gray-200 dark:border-gray-800 bg-white/95 dark:bg-gray-950/95 lg:bg-transparent lg:dark:bg-transparent"
        :class="[
            'fixed inset-y-0 left-0 z-40 max-w-[20rem] shrink-0 transform border-r shadow-xl transition-transform duration-300 ease-in-out lg:relative lg:inset-auto lg:z-auto lg:max-w-none lg:border-r lg:shadow-none',
            isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        ]">

        <div class="flex items-center justify-between gap-3 border-b border-gray-200 dark:border-gray-800 px-4 py-3">
            <div class="flex items-center gap-2">
                <UBadge color="neutral" variant="subtle" size="md" class="uppercase tracking-wide">
                    TOKENS
                </UBadge>
                <UBadge color="primary" variant="soft" size="md">
                    {{ tokens.length }}
                </UBadge>
            </div>

            <div class="flex items-center gap-2">
                <UButton v-if="showMobileClose" class="lg:hidden" type="button" variant="ghost" color="neutral"
                    icon="i-lucide-x" aria-label="Close tokens sidebar" @click="$emit('close')" />
                <UButton type="button" variant="ghost" color="primary" icon="i-lucide-plus" size="sm"
                    aria-label="Create token" @click="$emit('create')">Create</UButton>
                <UButton type="button" variant="ghost" color="error" icon="i-lucide-trash-2" size="sm"
                    aria-label="Delete all tokens" :disabled="!tokens.length" @click="$emit('delete-all')" />
            </div>
        </div>

        <!-- Token List -->
        <div class="flex-1 overflow-auto">
            <div class="space-y-1 p-2">
                <template v-if="tokens && tokens.length">
                    <div v-for="token in tokens" :key="token.id"
                        class="w-full rounded-lg px-3 py-2.5 transition-all duration-150 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800">
                        <div class="flex items-start justify-between gap-3">
                            <div class="space-y-1 flex-1 min-w-0">
                                <ULink :to="`/token/${token.id}`"
                                    class="font-mono text-sm text-primary hover:underline block truncate"
                                    :title="token.id">
                                    {{ token.id }}
                                </ULink>
                                <p class="text-xs text-gray-500 dark:text-gray-400">
                                    {{ getRequestCount(token) }} requests · {{ formatDate(token.createdAt) }}
                                </p>
                            </div>
                            <div class="flex items-center gap-1 flex-shrink-0">
                                <UButton variant="ghost" color="neutral" size="sm" icon="i-lucide-copy"
                                    @click="$emit('copy-url', token.id)" />
                                <UButton variant="ghost" color="error" size="sm" icon="i-lucide-trash-2"
                                    aria-label="Delete token" @click="$emit('delete', token.id)" />
                            </div>
                        </div>
                    </div>
                </template>
                <template v-else>
                    <div
                        class="flex flex-col items-center justify-center gap-3 rounded border-2 border-dashed border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-6 text-center text-sm text-gray-500 dark:text-gray-400">
                        <UIcon name="i-lucide-inbox" class="h-8 w-8 text-gray-400 dark:text-gray-600" />
                        <span>No tokens yet. Create one to get started.</span>
                    </div>
                </template>
            </div>
        </div>
    </aside>
</template>

<script setup lang="ts">
import { formatDate } from '~/utils'

type Token = {
    id: string
    createdAt?: string
    _count?: { requests?: number }
}

const props = defineProps<{
    tokens: Array<Token>
    requestCounts?: Map<string, number>
    isOpen?: boolean
    showMobileClose?: boolean
}>()

defineEmits<{
    (e: 'create' | 'delete-all' | 'close'): void
    (e: 'delete' | 'copy-url', id: string): void
}>()

const getRequestCount = (token: Token): string => {
    try {
        if (!token?.id) {
            return '0'
        }

        const liveCount = props.requestCounts?.get(token.id)
        if (undefined !== liveCount) {
            return liveCount.toLocaleString()
        }

        return ((token?._count?.requests ?? 0) as number).toLocaleString()
    } catch {
        return '0'
    }
}
</script>
