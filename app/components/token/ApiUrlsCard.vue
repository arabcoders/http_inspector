<template>
    <UCard>
        <template #header>
            <button type="button" class="w-full flex items-center justify-between text-left" @click="isOpen = !isOpen">
                <div class="flex flex-col gap-1">
                    <span class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        API Endpoints
                    </span>
                    <span class="text-sm font-medium text-gray-900 dark:text-gray-100">
                        Webhook and automation URLs
                    </span>
                </div>
                <UIcon :name="isOpen ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
                    class="h-5 w-5 text-gray-500 dark:text-gray-400" />
            </button>
        </template>

        <div v-if="isOpen" class="flex flex-col gap-4 p-4 border-t border-gray-200 dark:border-gray-700">
            <div class="space-y-2">
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Webhook URL
                </label>
                <div class="flex gap-2">
                    <UInput :model-value="payloadUrl" readonly size="md" class="flex-1 font-mono text-xs" />
                    <UTooltip :text="copyPayloadState === 'copied' ? 'Copied!' : 'Copy URL'">
                        <UButton :icon="copyPayloadState === 'copied' ? 'i-lucide-check' : 'i-lucide-copy'"
                            color="neutral" variant="soft" @click="handleCopyPayload" />
                    </UTooltip>
                </div>
                <p class="text-xs text-gray-500 dark:text-gray-400">
                    Use this URL to capture requests.
                </p>
            </div>

            <div class="space-y-2">
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Automation API URL
                </label>
                <div class="flex gap-2">
                    <UInput :model-value="viewUrl" readonly size="md" class="flex-1 font-mono text-xs" />
                    <UTooltip :text="copyViewState === 'copied' ? 'Copied!' : 'Copy URL'">
                        <UButton :icon="copyViewState === 'copied' ? 'i-lucide-check' : 'i-lucide-copy'" color="neutral"
                            variant="soft" @click="handleCopyView" />
                    </UTooltip>
                </div>
                <p class="text-xs text-gray-500 dark:text-gray-400">
                    Read-only API for automation/LLMs.
                </p>
            </div>
        </div>
    </UCard>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { notify } from '~/composables/useNotificationBridge'
import { useTokensStore } from '~/stores/tokens'
import { copyText } from '~/utils'

const props = defineProps<{ tokenId: string }>()

const tokensStore = useTokensStore()
const { data: token } = tokensStore.useToken(computed(() => props.tokenId))

const isOpen = usePersistedState('api-urls-open', false)
const copyPayloadState = ref<'idle' | 'copied'>('idle')
const copyViewState = ref<'idle' | 'copied'>('idle')

const origin = computed(() => typeof window !== 'undefined' ? window.location.origin : '')

const payloadUrl = computed(() => {
    const friendlyId = token.value?.friendlyId || ''
    return `${origin.value}/api/payload/${friendlyId}`
})

const viewUrl = computed(() => {
    const friendlyId = token.value?.friendlyId || ''
    return `${origin.value}/api/llm/token/${friendlyId}?secret=${props.tokenId}`
})

const handleCopyPayload = async () => {
    try {
        await copyText(payloadUrl.value)
        copyPayloadState.value = 'copied'
        setTimeout(() => copyPayloadState.value = 'idle', 1200)
    } catch (error) {
        console.error('Failed to copy URL:', error)
        notify({ title: 'Failed to copy URL', variant: 'error' })
    }
}

const handleCopyView = async () => {
    try {
        await copyText(viewUrl.value)
        copyViewState.value = 'copied'
        setTimeout(() => copyViewState.value = 'idle', 1200)
    } catch (error) {
        console.error('Failed to copy URL:', error)
        notify({ title: 'Failed to copy URL', variant: 'error' })
    }
}
</script>
