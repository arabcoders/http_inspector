<script setup lang="ts">
import { useQueryClient } from '@tanstack/vue-query'
import { useSSE } from '~/composables/useSSE'
import { useSessionStore } from '~/stores/session'

const queryClient = useQueryClient()
const sse = useSSE(false)
const { data: session, isError: sessionError, refetch: retrySession } = useSessionStore().useSession()
const sessionReady = computed(() => !!session.value)
let unsubscribe: (() => void) | undefined
let unsubscribeStatus: (() => void) | undefined

onMounted(() => {
  watch(sessionReady, (ready) => {
    if (!ready || unsubscribe) {
      return
    }
    unsubscribe = sse.onAny(({ type }) => {
      if (['token.created', 'token.deleted', 'token.cleared', 'request.received', 'request.deleted', 'request.cleared'].includes(type)) {
        void queryClient.invalidateQueries({ queryKey: ['tokens'] })
      }
    })
    unsubscribeStatus = sse.onStatusChange((status) => {
      if ('connected' === status) {
        void queryClient.invalidateQueries({ queryKey: ['tokens'] })
        void queryClient.invalidateQueries({ queryKey: ['requests'] })
      }
    })
  }, { immediate: true })
})

onUnmounted(() => {
  unsubscribeStatus?.()
  unsubscribe?.()
})
</script>

<template>
  <div class="inspector-shell flex min-h-dvh flex-col lg:h-dvh">
    <Header />
    <main id="main-content" tabindex="-1" class="flex min-h-0 min-w-0 flex-1 flex-col">
      <!-- Wait for the session cookie before mounting queries or connecting to its event stream. -->
      <slot v-if="sessionReady" />
      <div v-else class="mx-auto w-full max-w-7xl p-4 sm:p-6">
        <UAlert v-if="sessionError" title="Could not start the workspace" color="error" variant="subtle"
          :actions="[{ label: 'Retry', icon: 'i-lucide-refresh-cw', onClick: () => retrySession() }]" />
        <div v-else class="space-y-3" aria-busy="true" aria-label="Opening workspace">
          <USkeleton class="h-9 w-48" />
          <USkeleton class="h-32 w-full" />
        </div>
      </div>
    </main>
  </div>
</template>
