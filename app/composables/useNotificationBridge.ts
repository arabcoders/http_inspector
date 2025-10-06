/**
 * Notification Bridge Composable
 * Provides a unified interface to dispatch notifications either via Nuxt UI Toast or Browser Notifications
 * Users can toggle their preference which is persisted in localStorage
 */

import type {
    NotificationVariant,
    NotificationType,
    ToastColor,
    NotificationPayload
} from '~~/shared/types'

/**
 * Maps notification variants to appropriate icons
 */
const getIconForVariant = (variant: NotificationVariant = 'default'): string => {
    const iconMap: Record<NotificationVariant, string> = {
        default: 'i-lucide-info',
        success: 'i-lucide-check-circle',
        error: 'i-lucide-x-circle',
        warning: 'i-lucide-alert-triangle',
        info: 'i-lucide-info'
    }
    return iconMap[variant]
}

/**
 * Maps notification variants to Nuxt UI colors
 */
const getColorForVariant = (variant: NotificationVariant = 'default'): ToastColor => {
    const colorMap: Record<NotificationVariant, ToastColor> = {
        default: 'neutral',
        success: 'success',
        error: 'error',
        warning: 'warning',
        info: 'primary'
    }
    return colorMap[variant]
}

/**
 * Request browser notification permission
 */
const requestNotificationPermission = async (): Promise<NotificationPermission> => {
    if (!('Notification' in window)) {
        console.warn('Browser notifications are not supported')
        return 'denied'
    }

    if ('granted' === Notification.permission) {
        return 'granted'
    }

    if ('denied' !== Notification.permission) {
        const permission = await Notification.requestPermission()
        return permission
    }

    return Notification.permission
}

/**
 * Show a browser notification
 */
const showBrowserNotification = (payload: NotificationPayload) => {
    if (!('Notification' in window)) {
        console.warn('Browser notifications are not supported')
        return
    }

    if ('granted' !== Notification.permission) {
        console.warn('Notification permission not granted')
        return
    }

    const { title, description, icon } = payload

    const notification = new Notification(title, {
        body: description,
        icon: icon || '/favicon.ico',
        badge: '/favicon.ico',
        tag: `notification-${Date.now()}`,
        requireInteraction: false,
        silent: false
    })

    const timeout = payload.timeout ?? 5000
    if (timeout > 0) {
        setTimeout(() => notification.close(), timeout)
    }

    notification.onclick = () => {
        window.focus()
        notification.close()
    }
}

/**
 * Show a toast notification using Nuxt UI
 */
const showToastNotification = (payload: NotificationPayload) => {
    const toast = useToast()

    const { title, description, variant = 'default', color, icon } = payload

    toast.add({
        title,
        description,
        color: color || getColorForVariant(variant),
        icon: icon || getIconForVariant(variant),
        actions: payload.actions || [],
    })
}

/**
 * Main composable for notification bridge
 */
export const useNotificationBridge = () => {
    const notificationType = usePersistedState<NotificationType>('notification-type', 'toast')
    const browserPermission = ref<NotificationPermission>('default')

    if (import.meta.client && 'Notification' in window) {
        browserPermission.value = Notification.permission
    }

    const notify = (payload: NotificationPayload) => {
        if (notificationType.value === 'browser') {
            showBrowserNotification(payload)
        } else {
            showToastNotification(payload)
        }
    }

    const setNotificationType = async (type: NotificationType) => {
        if ('browser' === type) {
            const permission = await requestNotificationPermission()
            browserPermission.value = permission

            if ('granted' !== permission) {
                showToastNotification({
                    title: 'Permission Required',
                    description: 'Please allow notifications in your browser settings to use browser notifications.',
                    variant: 'warning'
                })
                return
            }
        }

        notificationType.value = type
    }

    const toggleNotificationType = async () => {
        const newType = 'toast' === notificationType.value ? 'browser' : 'toast'
        await setNotificationType(newType)
    }

    const isBrowserNotificationSupported = computed(() => import.meta.client && 'Notification' in window)

    const isBrowserNotificationAvailable = computed(() => isBrowserNotificationSupported.value && 'granted' === browserPermission.value)

    return {
        notify,
        notificationType: readonly(notificationType),
        setNotificationType,
        toggleNotificationType,
        isBrowserNotificationSupported,
        isBrowserNotificationAvailable,
        browserPermission: readonly(browserPermission)
    }
}

export const notify = (payload: NotificationPayload) => {
    const { notify } = useNotificationBridge()
    notify(payload)
}

export default useNotificationBridge
