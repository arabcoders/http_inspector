<template>
    <UCard>
        <template #header>
            <button type="button" class="w-full flex items-center justify-between text-left" @click="isOpen = !isOpen">
                <div class="flex flex-col gap-1">
                    <span class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        {{ statusSummary }}
                    </span>
                    <span class="text-sm font-medium text-gray-900 dark:text-gray-100">
                        Configure optional response to incoming requests
                    </span>
                </div>
                <UIcon :name="isOpen ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
                    class="h-5 w-5 text-gray-500 dark:text-gray-400" />
            </button>
        </template>

        <div v-if="isOpen" class="flex flex-col gap-4 p-4 border-t border-gray-200 dark:border-gray-700">
            <div
                class="flex items-center gap-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-4">
                <USwitch id="response-enabled" v-model="responseEnabled" :disabled="loading || saving"
                    @update:model-value="handleToggleEnabled" />
                <label for="response-enabled" class="text-sm font-medium cursor-pointer">
                    Send custom response
                </label>
            </div>

            <div class="grid gap-4 md:grid-cols-2">
                <div class="space-y-2">
                    <label for="response-status" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Status code
                    </label>
                    <UInput id="response-status" v-model="responseStatus" type="number" :min="100" :max="599"
                        placeholder="200" :disabled="loading" size="md" class="w-full" />
                </div>

                <div class="space-y-2">
                    <label for="response-headers" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Headers
                    </label>
                    <UTextarea id="response-headers" v-model="responseHeadersText" :rows="4"
                        placeholder="Content-Type: application/json" :disabled="loading" size="md" autoresize
                        class="w-full" />
                    <p class="text-xs text-gray-500 dark:text-gray-400">
                        One header per line, e.g. <code>Content-Type: application/json</code>.
                    </p>
                </div>

                <div class="space-y-2 md:col-span-2">
                    <label for="response-body" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Body
                    </label>
                    <UTextarea id="response-body" v-model="responseBody" :rows="6" placeholder="Optional response body"
                        :disabled="loading" size="md" autoresize class="w-full" />
                </div>
            </div>

            <div class="flex justify-end">
                <UButton type="button" color="primary" :loading="saving" :disabled="loading"
                    @click="() => handleSave()">
                    {{ saving ? 'Saving…' : 'Save response' }}
                </UButton>
            </div>
        </div>
    </UCard>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { notify } from '~/composables/useNotificationBridge'

const props = defineProps<{ tokenId: string }>()

const loading = ref(false)
const saving = ref(false)
const isOpen = usePersistedState('response-settings-open', false)
const responseEnabled = ref(false)
const responseStatus = ref('200')
const responseHeadersText = ref('')
const responseBody = ref('')

const statusSummary = computed(() => {
    const statusLabel = responseStatus.value?.trim().length ? responseStatus.value : '200'
    return responseEnabled.value ? `Custom response enabled · ${statusLabel}` : 'Custom responses disabled'
})

// Helper functions
const headersToText = (headers: Record<string, string> | null | undefined): string => {
    if (!headers) {
        return ''
    }
    return Object.entries(headers).map(([key, value]) => `${key}: ${value}`).join('\n')
}

const textToHeaders = (input: string): Record<string, string> | null => {
    const lines = input.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)

    if (!lines.length) {
        return null
    }

    const out: Record<string, string> = {}
    for (const line of lines) {
        const idx = line.indexOf(':')
        if (idx === -1) {
            continue
        }
        const key = line.slice(0, idx).trim()
        const value = line.slice(idx + 1).trim()
        if (!key) {
            continue
        }
        out[key] = value
    }

    return Object.keys(out).length ? out : null
}

const loadTokenConfig = async () => {
    loading.value = true
    try {
        const res = await fetch(`/api/token/${props.tokenId}`)
        if (!res.ok) {
            if (404 === res.status) {
                notify({
                    title: 'Token not found',
                    description: 'This token does not exist or has been deleted.',
                    color: 'error',
                })
                setTimeout(() => navigateTo('/'), 1500)
                return
            }
            throw new Error(`HTTP ${res.status}: ${res.statusText}`)
        }

        const data = await res.json()
        responseEnabled.value = Boolean(data.responseEnabled)
        responseStatus.value = String(data.responseStatus ?? 200)
        responseHeadersText.value = headersToText(data.responseHeaders)
        responseBody.value = data.responseBody ?? ''
    } catch (error) {
        console.error('Failed to load token config:', error)
        notify({
            title: 'Error loading settings',
            description: 'Failed to load response settings. Please try again.',
            color: 'error',
        })
    } finally {
        loading.value = false
    }
}

const handleToggleEnabled = async (enabled: boolean | 'indeterminate') => {
    if (enabled === 'indeterminate') {
        return
    }
    await handleSave(enabled)
}

const handleSave = async (enabledOverride?: boolean) => {
    saving.value = true

    try {
        const enabledValue = enabledOverride ?? responseEnabled.value
        const parsedStatus = parseInt(responseStatus.value, 10)
        const statusCode = Number.isFinite(parsedStatus) ? Math.min(599, Math.max(100, parsedStatus)) : 200
        const headersObj = textToHeaders(responseHeadersText.value)
        const bodyValue = responseBody.value.length ? responseBody.value : null

        const res = await fetch(`/api/token/${props.tokenId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                enabled: enabledValue,
                status: statusCode,
                headers: headersObj,
                body: bodyValue,
            }),
        })

        if (!res.ok) {
            if (404 === res.status) {
                notify({
                    title: 'Token not found',
                    description: 'This token does not exist or has been deleted.',
                    color: 'error',
                })
                setTimeout(() => navigateTo('/'), 1500)
                return
            }
            throw new Error(`HTTP ${res.status}: ${res.statusText}`)
        }

        notify({ title: 'Response settings saved', color: 'success' })
    } catch (error) {
        console.error('Failed to save response settings:', error)
        notify({
            title: 'Failed to save response settings',
            description: error instanceof Error ? error.message : 'Please try again.',
            color: 'error',
        })
    } finally {
        saving.value = false
    }
}

onMounted(() => loadTokenConfig())
</script>
