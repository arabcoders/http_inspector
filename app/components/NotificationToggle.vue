<template>
    <ClientOnly>
        <UTooltip :text="tooltipText" :shortcuts="[]">
            <UButton :icon="currentIcon" :color="notificationType === 'browser' ? 'primary' : 'neutral'" variant="ghost"
                :aria-label="ariaLabel" :disabled="!isBrowserNotificationSupported && notificationType === 'toast'"
                @click="handleToggle" />
        </UTooltip>
    </ClientOnly>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useNotificationBridge } from '~/composables/useNotificationBridge'

const {
    notificationType,
    toggleNotificationType,
    isBrowserNotificationSupported,
    browserPermission
} = useNotificationBridge()

const currentIcon = computed(() => 'browser' === notificationType.value ? 'i-lucide-bell' : 'i-lucide-bell-off')

const tooltipText = computed(() => {
    if (!isBrowserNotificationSupported.value) {
        return 'Browser notifications not supported'
    }

    if ('browser' === notificationType.value) {
        return 'Using browser notifications (click to switch to toast)'
    }

    if ('denied' === browserPermission.value) {
        return 'Browser notifications blocked. Enable in browser settings to use.'
    }

    return 'Using toast notifications (click to switch to browser)'
})

const ariaLabel = computed(() => 'browser' === notificationType.value ? 'Switch to toast notifications' : 'Switch to browser notifications')

const handleToggle = async () => await toggleNotificationType()
</script>
