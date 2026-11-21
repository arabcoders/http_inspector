<template>
    <div class="flex items-center gap-1">
        <span role="status" class="sr-only">{{ statusLabel }}</span>
        <UBadge v-if="'disconnected' !== status" :icon="statusIcon" :color="statusColor" variant="subtle" aria-hidden="true">
            <span class="hidden sm:inline">{{ statusLabel }}</span>
        </UBadge>
        <UTooltip v-else text="Reconnect to live updates">
            <UButton :icon="statusIcon" color="error" variant="ghost" aria-label="Reconnect to live updates"
                @click="reconnect">
                <span class="hidden sm:inline">Offline</span>
            </UButton>
        </UTooltip>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useSSE } from '~/composables/useSSE'

const { status, reconnect } = useSSE(false)

const statusIcon = computed(() => {
    switch (status.value) {
        case 'connected':
            return 'i-lucide-wifi'
        case 'connecting':
            return 'i-lucide-wifi'
        case 'disconnected':
            return 'i-lucide-wifi-off'
        default:
            return 'i-lucide-wifi'
    }
})

const statusColor = computed(() => {
    switch (status.value) {
        case 'connected':
            return 'success'
        case 'connecting':
            return 'warning'
        case 'disconnected':
            return 'error'
        default:
            return 'neutral'
    }
})

const statusLabel = computed(() => {
    switch (status.value) {
        case 'connected':
            return 'Live'
        case 'connecting':
            return 'Connecting'
        case 'disconnected':
            return 'Live updates offline'
        default:
            return 'Connection status'
    }
})
</script>
