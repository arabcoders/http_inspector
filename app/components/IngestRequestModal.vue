<template>
    <UModal v-model:open="isOpen" :prevent-close="loading">
        <template #header>
            <div class="flex items-center justify-between w-full">
                <h3 class="text-lg font-semibold">Ingest Raw Request</h3>
                <UButton color="neutral" variant="ghost" icon="i-lucide-x" size="sm" class="-my-1" :disabled="loading"
                    @click="handleCancel" />
            </div>
        </template>

        <template #body>
            <div class="space-y-4">
                <div>
                    <label for="raw-request" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Raw HTTP Request <span class="text-red-500">*</span>
                    </label>
                    <UTextarea id="raw-request" v-model="rawRequest" placeholder="GET /api/test HTTP/1.1
Host: example.com
Content-Type: application/json

{&quot;key&quot;: &quot;value&quot;}" :rows="12" :disabled="loading" class="font-mono w-full"
                        :color="errors.raw ? 'error' : 'primary'" />
                    <p v-if="errors.raw" class="mt-1 text-xs text-red-500">
                        {{ errors.raw }}
                    </p>
                    <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        Paste the raw HTTP request including method, URL, headers, and body. Supports both path-only
                        URLs
                        (/api/test) and full URLs (http://example.com/api/test).
                    </p>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label for="client-ip" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Client IP (optional)
                        </label>
                        <UInput id="client-ip" v-model="clientIp" placeholder="192.168.1.100" :disabled="loading"
                            :color="errors.clientIp ? 'error' : 'primary'" />
                        <p v-if="errors.clientIp" class="mt-1 text-xs text-red-500">
                            {{ errors.clientIp }}
                        </p>
                        <p v-else class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            Override the client IP address
                        </p>
                    </div>

                    <div>
                        <label for="remote-ip" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Remote IP (optional)
                        </label>
                        <UInput id="remote-ip" v-model="remoteIp" placeholder="203.0.113.1" :disabled="loading"
                            :color="errors.remoteIp ? 'error' : 'primary'" />
                        <p v-if="errors.remoteIp" class="mt-1 text-xs text-red-500">
                            {{ errors.remoteIp }}
                        </p>
                        <p v-else class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            Override the remote IP address
                        </p>
                    </div>
                </div>

                <div v-if="error"
                    class="rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3">
                    <div class="flex">
                        <div class="flex-shrink-0">
                            <UIcon name="i-lucide-alert-circle" class="h-5 w-5 text-red-400" />
                        </div>
                        <div class="ml-3">
                            <h3 class="text-sm font-medium text-red-800 dark:text-red-200">Error</h3>
                            <div class="mt-2 text-sm text-red-700 dark:text-red-300">
                                {{ error }}
                            </div>
                        </div>
                    </div>
                </div>

                <div v-if="success"
                    class="rounded-md bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-3">
                    <div class="flex">
                        <div class="flex-shrink-0">
                            <UIcon name="i-lucide-check-circle" class="h-5 w-5 text-green-400" />
                        </div>
                        <div class="ml-3">
                            <h3 class="text-sm font-medium text-green-800 dark:text-green-200">Success</h3>
                            <div class="mt-2 text-sm text-green-700 dark:text-green-300">
                                Request #{{ success.id }} has been ingested successfully
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </template>

        <template #footer>
            <div class="flex items-center justify-end w-full gap-3">
                <UButton color="neutral" variant="ghost" label="Cancel" :disabled="loading" @click="handleCancel" />
                <UButton color="primary" label="Ingest Request" :loading="loading" :disabled="!rawRequest.trim()"
                    @click="handleIngest" />
            </div>
        </template>
    </UModal>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'

const props = withDefaults(defineProps<{
    modelValue: boolean
    tokenId: string
}>(), {})

const emit = defineEmits<{
    (e: 'update:modelValue', value: boolean): void
    (e: 'success', requestId: number): void
}>()

const isOpen = computed({
    get: () => props.modelValue,
    set: (value) => emit('update:modelValue', value)
})

const rawRequest = ref('')
const clientIp = ref('')
const remoteIp = ref('')
const loading = ref(false)
const error = ref<string | null>(null)
const success = ref<{ id: number } | null>(null)
const errors = ref<{
    raw?: string
    clientIp?: string
    remoteIp?: string
}>({})

// Reset form when modal is opened/closed
watch(isOpen, (newValue) => {
    if (newValue) {
        rawRequest.value = ''
        clientIp.value = ''
        remoteIp.value = ''
        error.value = null
        success.value = null
        errors.value = {}
    }
})

const validateIP = (ip: string): boolean => {
    if (!ip) return true // Optional field
    // Basic IP validation (IPv4)
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/
    if (!ipv4Regex.test(ip)) return false
    return ip.split('.').every(part => {
        const num = parseInt(part, 10)
        return num >= 0 && num <= 255
    })
}

const validate = (): boolean => {
    errors.value = {}
    let isValid = true

    if (!rawRequest.value.trim()) {
        errors.value.raw = 'Raw request is required'
        isValid = false
    }

    if (clientIp.value && !validateIP(clientIp.value)) {
        errors.value.clientIp = 'Invalid IP address format'
        isValid = false
    }

    if (remoteIp.value && !validateIP(remoteIp.value)) {
        errors.value.remoteIp = 'Invalid IP address format'
        isValid = false
    }

    return isValid
}

const handleIngest = async () => {
    if (!validate()) {
        return
    }

    loading.value = true
    error.value = null
    success.value = null

    try {
        // Normalize line endings to CRLF (\r\n) as required by HTTP specification
        const normalizedRaw = rawRequest.value.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n/g, '\r\n')

        const body: {
            raw: string
            clientIp?: string
            remoteIp?: string
        } = {
            raw: normalizedRaw
        }

        if (clientIp.value) {
            body.clientIp = clientIp.value
        }

        if (remoteIp.value) {
            body.remoteIp = remoteIp.value
        }

        const res = await fetch(`/api/token/${props.tokenId}/ingest`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        })

        if (!res.ok) {
            const data = await res.json().catch(() => ({}))
            throw new Error(data.message || `HTTP ${res.status}: ${res.statusText}`)
        }

        const data = await res.json()
        success.value = { id: data.request.id }

        // Emit success event with request ID
        emit('success', data.request.id)

        // Close modal after a short delay to show success message
        setTimeout(() => {
            handleCancel()
        }, 1500)
    } catch (err) {
        error.value = err instanceof Error ? err.message : 'Failed to ingest request'
        console.error('Failed to ingest request:', err)
    } finally {
        loading.value = false
    }
}

const handleCancel = () => {
    if (!loading.value) {
        emit('update:modelValue', false)
    }
}
</script>
