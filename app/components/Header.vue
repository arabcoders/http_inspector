<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { useQueryClient } from '@tanstack/vue-query'
import { useSessionStore } from '~/stores/session'
import { useNotificationBridge } from '~/composables/useNotificationBridge'
import { useSSE } from '~/composables/useSSE'
import { copyText } from '~/utils'

const { theme, cycleTheme } = useTheme()
const queryClient = useQueryClient()
const { notify } = useNotificationBridge()
const sse = useSSE(false)
const restoreEnabled = useRuntimeConfig().public.sessionRestoreEnabled !== false
const showRestore = ref(false)
const sessionStore = useSessionStore()
const { data: auth } = sessionStore.useAuthStatus()
const { data: session } = sessionStore.useSession()
const { mutateAsync: logout } = sessionStore.useLogout()

const copySessionId = async () => {
  if (session.value?.friendlyId && await copyText(session.value.friendlyId)) {
    notify({ title: 'Session ID copied', color: 'success' })
  }
}

const signOut = async () => {
  try {
    await logout()
    sse.disconnect()
    queryClient.clear()
    await navigateTo('/login')
  } catch (error) {
    console.error('Sign out failed:', error)
    notify({ title: 'Could not sign out', color: 'error' })
  }
}

const menu = computed<DropdownMenuItem[][]>(() => [
  [{ label: 'Documentation', icon: 'i-lucide-book-open', to: '/help' }],
  ...(restoreEnabled ? [[
    ...(session.value?.friendlyId ? [{
      label: 'Copy session ID',
      icon: 'i-lucide-copy',
      onSelect: copySessionId,
    }] : []),
    { label: 'Restore session', icon: 'i-lucide-history', onSelect: () => { showRestore.value = true } },
  ]] : []),
  [{
    label: `Theme: ${theme.value.label}`,
    icon: theme.value.icon,
    onSelect: cycleTheme,
  }],
  ...(auth.value?.required ? [[{
    label: 'Sign out',
    icon: 'i-lucide-log-out',
    color: 'error' as const,
    onSelect: signOut,
  }]] : []),
])
</script>

<template>
  <header class="sticky top-[env(safe-area-inset-top)] z-30 shrink-0 border-b border-default bg-default/75 backdrop-blur-md">
    <a href="#main-content"
      class="sr-only focus:not-sr-only focus:absolute focus:start-3 focus:top-2 focus:z-10 focus:rounded-md focus:bg-default focus:p-2">
      Skip to main content
    </a>
    <div class="flex min-h-15 items-center justify-between gap-2 px-3 sm:px-5">
      <NuxtLink to="/" class="flex min-w-0 items-center gap-2.5 rounded-md focus-visible:outline-2 focus-visible:outline-primary">
        <span class="inspector-section-icon size-9">
          <img src="/favicon.svg" alt="" class="size-6">
        </span>
        <span class="min-w-0">
          <span class="block truncate text-sm font-semibold text-highlighted">HTTP Inspector</span>
          <span class="hidden text-xs text-toned sm:block">Request capture workspace</span>
        </span>
      </NuxtLink>

      <div class="flex shrink-0 items-center gap-0.5 sm:gap-2">
        <ClientOnly>
          <SSEStatusIndicator />
          <UButton v-if="restoreEnabled && session?.friendlyId" class="hidden lg:inline-flex" variant="ghost" color="neutral"
            icon="i-lucide-copy" :label="session.friendlyId" aria-label="Copy session ID" @click="copySessionId" />
          <NotificationToggle />
          <UDropdownMenu :items="menu" :content="{ align: 'end' }">
            <UButton icon="i-lucide-ellipsis" variant="ghost" color="neutral" aria-label="Workspace menu" />
          </UDropdownMenu>
        </ClientOnly>
      </div>
    </div>
    <RestoreSessionModal v-if="restoreEnabled" v-model="showRestore" />
  </header>
</template>
