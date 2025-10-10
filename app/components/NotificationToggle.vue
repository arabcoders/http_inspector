<template>
    <ClientOnly>
        <div class="flex items-center gap-2">
            <UTooltip :text="muteTooltipText" :shortcuts="[]">
                <UButton :icon="muteIcon" :color="isMuted ? 'error' : 'neutral'" variant="ghost"
                    :aria-label="muteAriaLabel" @click="handleMuteToggle" />
            </UTooltip>
            <UTooltip :text="tooltipText" :shortcuts="[]">
                <UButton :icon="currentIcon" :color="notificationType === 'browser' ? 'primary' : 'neutral'"
                    variant="ghost" :aria-label="ariaLabel"
                    :disabled="!isBrowserNotificationSupported && notificationType === 'toast'"
                    @click="handleToggle" />
            </UTooltip>
        </div>
    </ClientOnly>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useNotificationBridge } from '~/composables/useNotificationBridge'

const {
    notificationType,
    toggleNotificationType,
    isBrowserNotificationSupported,
    browserPermission,
    isMuted,
    toggleMute
} = useNotificationBridge()

const currentIcon = computed(() => 'browser' === notificationType.value ? 'i-lucide-monitor' : 'i-lucide-message-square')

const muteIcon = computed(() => isMuted.value ? 'i-lucide-bell-off' : 'i-lucide-bell-ring')

const muteTooltipText = computed(() => isMuted.value ? 'Notifications muted (click to unmute)' : 'Notifications active (click to mute)')

const muteAriaLabel = computed(() => isMuted.value ? 'Unmute notifications' : 'Mute notifications')

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

const handleMuteToggle = () => toggleMute()
</script>
