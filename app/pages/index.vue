<script setup lang="ts">
import type { SSEEventMap } from '~~/shared/types'
import { useNotificationBridge } from '~/composables/useNotificationBridge'
import { useSSE } from '~/composables/useSSE'
import { useTokensStore } from '~/stores/tokens'
import { copyText, shortSlug } from '~/utils'

const tokensStore = useTokensStore()
const { data: tokens, isPending, isError, refetch } = tokensStore.useTokensList()
const { mutateAsync: createToken, isPending: creating } = tokensStore.useCreateToken()
const { mutateAsync: deleteToken, isPending: deleting } = tokensStore.useDeleteToken()
const { mutateAsync: deleteAllTokens, isPending: deletingAll } = tokensStore.useDeleteAllTokens()
const { notify } = useNotificationBridge()
const router = useRouter()
const sse = useSSE(false)

const sidebarOpen = ref(false)
const showDelete = ref(false)
const showDeleteAll = ref(false)
const tokenToDelete = ref('')
const incomingIds = ref(new Set<string>())
const incomingTimers = new Map<string, ReturnType<typeof setTimeout>>()

const sortedTokens = computed(() => [...(tokens.value || [])].sort(
  (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime(),
))

const create = async () => {
  try {
    const token = await createToken()
    sidebarOpen.value = false
    await router.push(`/token/${token.id}`)
    notify({ title: 'Token created', color: 'success' })
  } catch (error) {
    console.error('Could not create token:', error)
    notify({ title: 'Could not create a token', color: 'error' })
  }
}

const copyWebhook = async (id: string) => {
  const endpoint = tokens.value?.find(token => token.id === id)?.friendlyId || id
  const success = await copyText(`${window.location.origin}/api/payload/${endpoint}`)
  notify({ title: success ? 'Webhook URL copied' : 'Could not copy webhook URL', color: success ? 'success' : 'error' })
}

const askToDelete = (id: string) => {
  sidebarOpen.value = false
  tokenToDelete.value = id
  showDelete.value = true
}

const askToDeleteAll = () => {
  sidebarOpen.value = false
  showDeleteAll.value = true
}

const confirmDelete = async (all: boolean) => {
  try {
    if (all) {
      await deleteAllTokens()
      showDeleteAll.value = false
    } else {
      await deleteToken(tokenToDelete.value)
      showDelete.value = false
    }
    notify({ title: all ? 'All tokens deleted' : 'Token deleted', color: 'success' })
  } catch (error) {
    console.error('Could not delete tokens:', error)
    notify({ title: 'Could not delete tokens', color: 'error' })
  }
}

const onRequest = ({ token, request }: SSEEventMap['request.received']) => {
  const requestId = typeof request.id === 'string' ? request.id : undefined
  incomingIds.value.add(token)
  clearTimeout(incomingTimers.get(token))
  incomingTimers.set(token, setTimeout(() => {
    incomingIds.value.delete(token)
    incomingTimers.delete(token)
  }, 3000))

  notify({
    title: `Captured ${request.method} request`,
    description: tokens.value?.find(item => item.id === token)?.friendlyId || shortSlug(token),
    color: 'success',
    actions: [{ label: 'View request', icon: 'i-lucide-arrow-right', onClick: () => {
      void router.push({ path: `/token/${token}`, query: { request: requestId } })
    } }],
  })
}

let unsubscribe: (() => void) | undefined
onMounted(() => { unsubscribe = sse.on('request.received', onRequest) })
onUnmounted(() => {
  unsubscribe?.()
  for (const timer of incomingTimers.values()) {
    clearTimeout(timer)
  }
})
</script>

<template>
  <WorkspacePane v-model:open="sidebarOpen" title="Tokens" icon="i-lucide-panel-left"
    description="Create a token or open an existing capture.">
    <template #sidebar>
      <TokenSidebar :tokens="sortedTokens" :pending="isPending" :failed="isError" :creating="creating"
        :incoming-ids="incomingIds" @create="create" @select="sidebarOpen = false" @retry="refetch()"
        @copy-url="copyWebhook" @delete="askToDelete" @delete-all="askToDeleteAll" />
    </template>

    <PageHeader section="Workspace" title="Capture requests" icon="i-lucide-webhook"
      description="Get a webhook URL, send it an HTTP request, and inspect what arrived.">
      <template #actions>
        <UButton icon="i-lucide-plus" label="New token" :loading="creating" @click="create" />
        <UButton to="/help" icon="i-lucide-book-open" label="Documentation" color="neutral" variant="outline" />
      </template>
    </PageHeader>

    <UCard>
      <template #header>
        <h2 class="font-semibold text-highlighted">Get started</h2>
      </template>
      <ol class="grid gap-4 md:grid-cols-3">
        <li class="flex gap-3">
          <span class="inspector-section-icon"><UIcon name="i-lucide-webhook" class="size-5" aria-hidden="true" /></span>
          <div>
            <h3 class="text-sm font-semibold text-highlighted">1. Create a token</h3>
            <p class="mt-1 text-sm text-toned">Each token has its own webhook URL and request history.</p>
          </div>
        </li>
        <li class="flex gap-3">
          <span class="inspector-section-icon"><UIcon name="i-lucide-send" class="size-5" aria-hidden="true" /></span>
          <div>
            <h3 class="text-sm font-semibold text-highlighted">2. Send a request</h3>
            <p class="mt-1 text-sm text-toned">Copy the URL into your app or HTTP client. Any HTTP method works.</p>
          </div>
        </li>
        <li class="flex gap-3">
          <span class="inspector-section-icon"><UIcon name="i-lucide-scan-search" class="size-5" aria-hidden="true" /></span>
          <div>
            <h3 class="text-sm font-semibold text-highlighted">3. Inspect the capture</h3>
            <p class="mt-1 text-sm text-toned">Open a request to see its headers, query parameters, and body.</p>
          </div>
        </li>
      </ol>
    </UCard>
    <ConfirmModal v-model="showDelete" title="Delete token?" description="This also deletes all requests for the token."
      confirm-label="Delete token" :loading="deleting" @confirm="confirmDelete(false)" />
    <ConfirmModal v-model="showDeleteAll" title="Delete all tokens?"
      description="This deletes every token in this session and all of their stored requests."
      confirm-label="Delete all tokens" :loading="deletingAll" @confirm="confirmDelete(true)" />
  </WorkspacePane>
</template>
