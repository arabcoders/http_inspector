<template>

  <div class="flex h-[calc(100vh-180px)] flex-col overflow-hidden">
    <div class="relative flex flex-1 flex-col overflow-hidden lg:flex-row lg:gap-8">
      <div v-if="isSidebarOpen" class="fixed inset-0 z-30 backdrop-blur-sm bg-black/40 transition-opacity lg:hidden"
        @click="closeSidebar" />

      <TokenSidebar :tokens="sortedTokens" :request-counts="requestCounts" :incoming-token-ids="incomingTokenIds"
        :is-open="isSidebarOpen" :show-mobile-close="true" @create="create" @delete-all="showDeleteAllModal = true"
        @delete="deleteToken" @copy-url="copyPayloadURL" @close="closeSidebar" />

      <main class="flex-1 overflow-auto">
        <div class="mb-4 flex items-center justify-between lg:hidden">
          <UButton icon="i-lucide-menu" variant="soft" color="neutral" @click="openSidebar()">
            Tokens
          </UButton>
          <UButton type="button" variant="soft" color="primary" icon="i-lucide-plus" size="sm" aria-label="Create token"
            @click="create()">
            Create
          </UButton>
        </div>
        <article v-if="readmeContent" class="prose dark:prose-invert max-w-7xl" v-html="readmeContent" />
        <article v-else class="prose dark:prose-invert max-w-7xl">
          <h1 class="text-2xl font-bold">HTTP Inspector</h1>
          <p>
            <UIcon name="i-lucide-loader-2" class="inline h-5 w-5 animate-spin" />
            Loading documentation...
          </p>
        </article>
      </main>
    </div>

    <ConfirmModal v-model="showDeleteAllModal" title="Delete All Tokens"
      description="Are you sure you want to delete all tokens and their stored requests? This action cannot be undone."
      confirm-label="Delete All" @confirm="confirmDeleteAll" />

    <ConfirmModal v-model="showDeleteTokenModal" title="Delete Token"
      description="Are you sure you want to delete this token and all its requests? This action cannot be undone."
      confirm-label="Delete" @confirm="confirmDeleteToken" @cancel="tokenToDelete = null" />
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, computed, ref } from 'vue'
import { marked } from 'marked'
import { useSSE, type SSEEventPayload } from '~/composables/useSSE'
import { useTokens } from '~/composables/useTokens'
import { copyText } from '~/utils'
import { notify } from '~/composables/useNotificationBridge'
import type { TokenListItem } from '~~/shared/types'

const { tokens, loadTokens, createToken, clearTokens } = useTokens()

const requestCounts = ref<Map<string, number>>(new Map())
const incomingTokenIds = ref<Set<string>>(new Set())
const showDeleteAllModal = ref(false)
const showDeleteTokenModal = ref(false)
const tokenToDelete = ref<string | null>(null)
const readmeContent = ref('')
const isSidebarOpen = ref(false)

const openSidebar = () => isSidebarOpen.value = true
const closeSidebar = () => isSidebarOpen.value = false

const sortedTokens = computed(() => (tokens.value || []).slice().sort((a: TokenListItem, b: TokenListItem) => new Date(b.createdAt || '').getTime() - new Date(a.createdAt || '').getTime()))
const create = async () => await createToken()

const confirmDeleteAll = async () => {
  showDeleteAllModal.value = false
  await clearTokens()
  notify({
    title: 'All tokens deleted',
    description: 'All tokens and their requests have been removed',
    color: 'success',
  })
}

const confirmDeleteToken = async () => {
  if (!tokenToDelete.value) {
    return
  }

  const id = tokenToDelete.value
  showDeleteTokenModal.value = false
  tokenToDelete.value = null

  await fetch(`/api/token/${id}`, { method: 'DELETE' })
  await loadTokens()

  notify({
    title: 'Token deleted',
    description: 'The token and its requests have been removed',
    color: 'success',
  })
}

const copyPayloadURL = async (id: string) => {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const url = `${origin}/api/payload/${id}`
  await copyText(url)
  notify({ title: 'URL copied', description: url, color: 'success', })
}

const deleteToken = (id: string) => {
  tokenToDelete.value = id
  showDeleteTokenModal.value = true
}

const handleClientEvent = (payload: SSEEventPayload) => {
  const tokenId = payload.token as string

  switch (payload.type) {
    case 'token.created': {
      loadTokens()

      const rTokenId = (payload.token as unknown as { id: string })?.id
      if (rTokenId) {
        notify({
          title: 'Token created',
          description: `Click to view token ${rTokenId}`,
          color: 'success',
          actions: [{
            label: 'View Token',
            onClick: async () => { await navigateTo(`/token/${rTokenId}`) },
          }],
        })
      }
      break
    }

    case 'token.deleted': {
      loadTokens()
      if (tokenId) {
        requestCounts.value.delete(tokenId)
      }
      break
    }

    case 'request.received': {
      if (!tokenId) {
        return
      }

      const token = (tokens.value as TokenListItem[] | undefined)?.find(t => t.id === tokenId)
      const currentCount = requestCounts.value.get(tokenId) ?? (token?._count?.requests ?? 0)
      requestCounts.value.set(tokenId, currentCount + 1)

      // Add to incoming tokens set
      if (!incomingTokenIds.value.has(tokenId)) {
        incomingTokenIds.value.add(tokenId)
        incomingTokenIds.value = new Set(incomingTokenIds.value)

        // Remove from incoming after 3 seconds
        setTimeout(() => {
          incomingTokenIds.value.delete(tokenId)
          incomingTokenIds.value = new Set(incomingTokenIds.value)
        }, 3000)
      }

      const request = payload.request as { id?: number; method?: string } | undefined
      notify({
        title: `${request?.method || 'Request'} → ${tokenId}`,
        description: `Click to view request #${request?.id || ''}`,
        color: 'success',
        actions: [{
          label: 'View Request',
          onClick: async () => { await navigateTo(`/token/${tokenId}`) },
        }],
      })
      break
    }

    case 'request.deleted': {
      if (!tokenId) {
        return
      }

      const currentCount = requestCounts.value.get(tokenId) ?? 0
      requestCounts.value.set(tokenId, Math.max(0, currentCount - 1))
      break
    }

    case 'request.cleared': {
      if (!tokenId) {
        return
      }
      requestCounts.value.set(tokenId, 0)
      break
    }

    default:
      break
  }
}

let unsubscribe: (() => void) | null = null

onMounted(async () => {
  marked.setOptions({ gfm: true, breaks: false })
  await loadTokens()

  readmeContent.value = await marked.parse(await $fetch<string>('/api/readme'))

  const tokenList = tokens.value as TokenListItem[] | undefined
  tokenList?.forEach((token: TokenListItem) => {
    if (token._count?.requests !== undefined) {
      requestCounts.value.set(token.id, token._count.requests)
    }
  })

  unsubscribe = useSSE().onAny(handleClientEvent)
})

onUnmounted(() => {
  if (unsubscribe) {
    unsubscribe()
  }
})
</script>
