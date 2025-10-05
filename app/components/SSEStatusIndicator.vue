<template>
    <UTooltip :text="tooltipText" :delay-duration="0">
        <UButton :icon="statusIcon" :color="statusColor" variant="ghost" size="xs" :aria-label="ariaLabel"
            :disabled="status === 'connected'" :class="{ 'cursor-pointer': status === 'disconnected' }"
            @click="handleReconnect" />
    </UTooltip>
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

const tooltipText = computed(() => {
    switch (status.value) {
        case 'connected':
            return 'Connected to live updates'
        case 'connecting':
            return 'Connecting to live updates...'
        case 'disconnected':
            return 'Disconnected - Click to reconnect'
        default:
            return 'Unknown connection status'
    }
})

const ariaLabel = computed(() => {
    switch (status.value) {
        case 'connected':
            return 'Live updates connected'
        case 'connecting':
            return 'Connecting to live updates'
        case 'disconnected':
            return 'Reconnect to live updates'
        default:
            return 'Connection status'
    }
})

const handleReconnect = () => {
    if ('disconnected' === status.value) {
        reconnect()
    }
}
</script>
