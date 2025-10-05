<template>
    <header
        class="sticky top-0 z-40 border-b border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-900/80 backdrop-blur">
        <div class="container mx-auto px-4 py-4">
            <div class="flex items-center justify-between gap-4">
                <div class="flex items-center gap-3">
                    <ULink to="/" class="flex items-center gap-3 text-lg font-semibold">
                        <span class="inline-flex h-10 w-10 items-center justify-center rounded-full">
                            <img src="/favicon.svg" class="h-6 w-6" alt="Logo">
                        </span>
                        <span>HTTP Inspector</span>
                    </ULink>
                    <ClientOnly>
                        <SSEStatusIndicator />
                    </ClientOnly>
                    <UTooltip v-if="selectedToken" text="Copy Payload URL">
                        <code
                            class="hidden select-none cursor-pointer sm:inline-block rounded bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-xs font-mono text-gray-900 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                            @click="copyPayloadUrl">
                        /api/payload/{{ shortSlug(selectedToken) }}
                    </code>
                    </UTooltip>
                </div>

                <div class="flex items-center gap-3">
                    <ClientOnly>
                        <div v-if="sessionInfo && sessionRestoreEnabled" class="hidden md:flex items-center gap-2">
                            <UButton color="neutral" variant="soft" size="sm" icon="i-lucide-user"
                                @click="copySessionId">
                                {{ sessionInfo.friendlyId }}
                            </UButton>
                        </div>
                    </ClientOnly>

                    <UButton v-if="sessionRestoreEnabled" color="neutral" variant="ghost" icon="i-lucide-upload"
                        aria-label="Restore session" @click="showRestoreModal = true" />

                    <NotificationToggle />

                    <ClientOnly>
                        <UButton :icon="colorMode.value === 'dark' ? 'i-lucide-moon' : 'i-lucide-sun'" color="neutral"
                            variant="ghost" aria-label="Toggle theme" @click="toggleTheme" />
                    </ClientOnly>

                    <ClientOnly>
                        <UButton v-if="authRequired" color="neutral" variant="ghost" icon="i-lucide-log-out"
                            aria-label="Logout" @click="handleLogout" />
                    </ClientOnly>

                    <div v-if="isTokenPage" class="hidden md:flex items-center gap-3">
                        <USelectMenu v-if="tokenOptions.length > 0" v-model="selectedToken" :items="tokenOptions"
                            value-key="value" label-key="label" placeholder="Select token" class="min-w-[220px]"
                            size="md" @update:model-value="handleTokenChange" />
                        <UButton v-if="selectedToken" color="error" variant="solid" icon="i-lucide-trash-2"
                            :loading="isDeleting" @click="showDeleteModal = true">
                            Delete
                        </UButton>
                    </div>

                    <UButton v-if="hasMobileExtras" class="md:hidden" color="neutral" variant="soft" size="sm"
                        :icon="showMobileExtras ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
                        :aria-expanded="showMobileExtras" aria-controls="header-mobile-extras"
                        aria-label="Toggle header actions" @click="toggleMobileExtras" />
                </div>
            </div>

            <Transition name="header-slide">
                <div v-if="showMobileExtras && hasMobileExtras" id="header-mobile-extras"
                    class="mt-3 grid gap-3 rounded-lg border border-gray-200 dark:border-gray-800 bg-white/90 dark:bg-gray-900/90 p-3 shadow-sm md:hidden">
                    <ClientOnly>
                        <UButton v-if="sessionInfo && sessionRestoreEnabled" color="neutral" variant="soft" size="sm"
                            icon="i-lucide-user" @click="copySessionId">
                            {{ sessionInfo.friendlyId }}
                        </UButton>
                    </ClientOnly>

                    <USelectMenu v-if="isTokenPage && tokenOptions.length > 0" v-model="selectedToken"
                        :items="tokenOptions" value-key="value" label-key="label" placeholder="Select token" size="md"
                        class="w-full" @update:model-value="handleTokenChange" />
                    <UButton v-if="isTokenPage && selectedToken" color="error" variant="solid" icon="i-lucide-trash-2"
                        :loading="isDeleting" @click="showDeleteModal = true">
                        Delete Token
                    </UButton>
                </div>
            </Transition>
        </div>

        <ConfirmModal v-model="showDeleteModal" title="Delete Token" confirm-label="Delete" :loading="isDeleting"
            description="Delete token and all it's associated requests?" @confirm="confirmDelete" />

        <RestoreSessionModal v-if="sessionRestoreEnabled" v-model="showRestoreModal" />
    </header>
</template>

<script setup lang="ts">
import { computed, watch, onMounted, onUnmounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useTokens } from '~/composables/useTokens'
import { useSSE, type SSEEventPayload } from '~/composables/useSSE'
import { notify } from '~/composables/useNotificationBridge'
import { copyText, shortSlug } from '~/utils'

const route = useRoute()
const colorMode = useColorMode()
const runtimeConfig = useRuntimeConfig()

const { tokens, loadTokens, deleteToken: removeToken } = useTokens()
const sse = useSSE()

const sessionRestoreEnabled = runtimeConfig.public?.sessionRestoreEnabled !== false

const selectedToken = ref<string>('')
const isDeleting = ref(false)
const showDeleteModal = ref(false)
const showRestoreModal = ref(false)
const sessionInfo = ref<{ friendlyId: string } | null>(null)
const authRequired = ref(false)
const showMobileExtras = ref(false)

const checkAuthStatus = async () => {
    try {
        const response = await $fetch('/api/auth/status')
        authRequired.value = response.required
    } catch {
        authRequired.value = false
    }
}

watch(selectedToken, newVal => {
    if (newVal) {
        useHead({ title: shortSlug(newVal) })
    }
})

const loadSessionInfo = async () => {
    try {
        const data = await $fetch('/api/session')
        if (data?.friendlyId) {
            sessionInfo.value = { friendlyId: data.friendlyId }
        }
    } catch (err) {
        console.error('Failed to load session info:', err)
    }
}

const copySessionId = async () => {
    if (!sessionInfo.value?.friendlyId) {
        return
    }

    try {
        const success = await copyText(sessionInfo.value.friendlyId)

        if (success) {
            notify({
                title: 'Session ID Copied',
                description: `"${sessionInfo.value.friendlyId}" copied to clipboard`,
                color: 'success',
            })
        }
    } catch (err) {
        console.error('Failed to copy:', err)
    }
}

const copyPayloadUrl = async () => {
    if (!selectedToken.value) {
        return
    }

    const origin = 'undefined' !== typeof window ? window.location.origin : ''
    const url = `${origin}/api/payload/${selectedToken.value}`

    try {
        if (false === (await copyText(url))) {
            return
        }

        notify({ title: 'Payload URL Copied', description: url, color: 'success' })
    } catch (err) {
        console.error('Failed to copy:', err)
    }
}

const isTokenPage = computed(() => route.path.startsWith('/token/'))

const hasMobileExtras = computed(() => Boolean(sessionInfo.value) || isTokenPage.value)

const tokenOptions = computed(() => {
    // Sort tokens DESC by createdAt (newest first)
    const sortedTokens = (tokens.value || []).slice()
        .sort((a: { createdAt?: string }, b: { createdAt?: string }) => {
            const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0
            const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0
            return dateB - dateA
        })

    return sortedTokens.map((token: { id: string; _count?: { requests: number } }) => {
        const requestCount = token._count?.requests ?? 0
        const plural = requestCount === 1 ? 'request' : 'requests'
        return { label: `${shortSlug(token.id)} · ${requestCount} ${plural}`, value: token.id }
    })
})

watch(() => route.path, (path) => {
    const match = path.match(/\/token\/(.+)/)
    if (match && match[1]) {
        selectedToken.value = match[1]
    } else {
        selectedToken.value = ''
    }
    showMobileExtras.value = false
}, { immediate: true })

watch([isTokenPage, hasMobileExtras], ([tokenPage, mobileExtras]) => {
    if (!tokenPage && !mobileExtras) {
        showMobileExtras.value = false
    }
})

function handleClientEvent(payload: SSEEventPayload) {
    if (!payload?.type) {
        return
    }

    if (!['request.received', 'request.deleted', 'request.cleared'].includes(payload.type)) {
        return
    }

    loadTokens()
}

let unsubscribe: (() => void) | null = null

onMounted(async () => {
    await loadTokens()
    await loadSessionInfo()
    await checkAuthStatus()
    unsubscribe = sse.onAny(handleClientEvent)
})

onUnmounted(() => {
    if (unsubscribe) {
        unsubscribe()
        unsubscribe = null
    }
})

const toggleTheme = () => {
    colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'
}

const toggleMobileExtras = () => {
    showMobileExtras.value = !showMobileExtras.value
}

const handleLogout = async () => {
    try {
        await $fetch('/api/auth/logout', { method: 'POST' })
        notify({
            title: 'Logged out',
            description: 'You have been logged out successfully.',
            color: 'success',
        })

        sse.emit({ type: 'auth:changed' })
        await navigateTo('/login')
    } catch (error) {
        console.error('Logout failed:', error)
        notify({
            title: 'Logout failed',
            description: 'Could not logout. Please try again.',
            color: 'error',
        })
    }
}

const handleTokenChange = async (value: string | { value: string; label: string }) => {
    const newTokenId = 'string' === typeof value ? value : value?.value
    if (newTokenId) {
        await navigateTo(`/token/${newTokenId}`)
    }
}

const confirmDelete = async () => {
    if (!selectedToken.value) {
        return
    }

    showDeleteModal.value = false
    isDeleting.value = true

    try {
        const currentTokens = tokens.value || []
        const activeIndex = currentTokens.findIndex((t: { id: string }) => t.id === selectedToken.value)
        const fallback = activeIndex !== -1 ? currentTokens[activeIndex + 1] ?? currentTokens[activeIndex - 1] : undefined

        await removeToken(selectedToken.value)

        if (fallback) {
            await navigateTo(`/token/${fallback.id}`)
        } else {
            await navigateTo('/')
        }

        notify({
            title: 'Token deleted',
            description: 'The token and all its requests have been removed.',
            color: 'success',
        })
    } catch (error) {
        console.error('Failed to delete token:', error)
        notify({
            title: 'Delete failed',
            description: 'Could not delete the token. Please try again.',
            color: 'error',
        })
    } finally {
        isDeleting.value = false
    }
}
</script>
