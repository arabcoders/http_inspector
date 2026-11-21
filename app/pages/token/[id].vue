<script setup lang="ts">
import type { RequestSummary, SSEEventPayload } from '~~/shared/types'
import { useNotificationBridge } from '~/composables/useNotificationBridge'
import { useSSE } from '~/composables/useSSE'
import { useRequestsStore } from '~/stores/requests'
import { useTokensStore } from '~/stores/tokens'
import { shortSlug } from '~/utils'
import { selectRequest } from '~/utils/request-presentation'
import EndpointBar from '~/components/token/EndpointBar.vue'
import RawRequestCard from '~/components/token/RawRequestCard.vue'
import RequestDetailsCard from '~/components/token/RequestDetailsCard.vue'
import ResponseSettingsModal from '~/components/token/ResponseSettingsModal.vue'

const route = useRoute()
const router = useRouter()
const { notify } = useNotificationBridge()
const sse = useSSE(false)
const tokenId = computed(() => String(route.params.id || ''))
const tokensStore = useTokensStore()
const { data: tokens } = tokensStore.useTokensList()
const { data: token, isError: tokenError, refetch: retryToken } = tokensStore.useToken(tokenId)
const { mutateAsync: deleteToken, isPending: deletingToken } = tokensStore.useDeleteToken()
const requestsStore = useRequestsStore()
const { data: requests, isPending, isError, refetch } = requestsStore.useRequestsList(tokenId)
const { mutateAsync: deleteRequest, isPending: deletingRequest } = requestsStore.useDeleteRequest()
const { mutateAsync: clearRequests, isPending: clearing } = requestsStore.useDeleteAllRequests()

const llmEnabled = useRuntimeConfig().public.llmEndpointEnabled === true
const tokenLabel = computed(() => token.value?.friendlyId || shortSlug(tokenId.value))
const endpoint = computed(() => token.value?.friendlyId || tokenId.value)
const tokenOptions = computed(() => (tokens.value || []).map(item => ({
  label: item.friendlyId || shortSlug(item.id),
  value: item.id,
})))
useHead(() => ({ title: tokenLabel.value }))

const sidebarOpen = ref(false)
const showClear = ref(false)
const showDeleteToken = ref(false)
const showDeleteRequest = ref(false)
const showIngest = ref(false)
const requestToDelete = ref('')
const incomingIds = ref(new Set<string>())
const incomingTimers = new Map<string, ReturnType<typeof setTimeout>>()
const selected = computed(() => selectRequest(requests.value || [], route.query.request))
const requestNumber = computed(() => {
  if (!requests.value || !selected.value) {
    return null
  }
  return requests.value.length - requests.value.findIndex(item => item.id === selected.value?.id)
})
const pinned = computed(() => 'string' === typeof route.query.request)

const showRequest = (id?: string) => {
  sidebarOpen.value = false
  return router.replace({ query: { ...route.query, request: id } })
}

const switchToken = (id: string) => {
  if (id !== tokenId.value) {
    return router.push(`/token/${id}`)
  }
}

const askToDeleteRequest = (id: string) => {
  sidebarOpen.value = false
  requestToDelete.value = id
  showDeleteRequest.value = true
}

const confirmDeleteRequest = async () => {
  const id = requestToDelete.value
  try {
    await deleteRequest({ tokenId: tokenId.value, requestId: id })
    showDeleteRequest.value = false
    if (route.query.request === id) {
      await showRequest()
    }
    notify({ title: 'Request deleted', color: 'success' })
  } catch (error) {
    console.error('Could not delete request:', error)
    notify({ title: 'Could not delete request', color: 'error' })
  }
}

const confirmClear = async () => {
  try {
    await clearRequests(tokenId.value)
    showClear.value = false
    await showRequest()
    notify({ title: 'Requests cleared', color: 'success' })
  } catch (error) {
    console.error('Could not clear requests:', error)
    notify({ title: 'Could not clear requests', color: 'error' })
  }
}

const confirmDeleteToken = async () => {
  const id = tokenId.value
  const list = tokens.value ?? []
  const index = list.findIndex(item => item.id === id)
  const next = -1 === index ? undefined : list[index + 1] ?? list[index - 1]
  try {
    await deleteToken(id)
    showDeleteToken.value = false
    await router.push(next ? `/token/${next.id}` : '/')
    notify({ title: 'Token deleted', color: 'success' })
  } catch (error) {
    console.error('Could not delete token:', error)
    notify({ title: 'Could not delete token', color: 'error' })
  }
}

const resetUpdates = () => {
  for (const timer of incomingTimers.values()) {
    clearTimeout(timer)
  }
  incomingTimers.clear()
  incomingIds.value.clear()
}

watch(tokenId, () => {
  sidebarOpen.value = showClear.value = showDeleteToken.value = showDeleteRequest.value = showIngest.value = false
  resetUpdates()
})

const onEvent = (event: SSEEventPayload) => {
  if (event.token !== tokenId.value) {
    return
  }
  const id = tokenId.value
  if ('request.received' === event.type) {
    const request = event.request as RequestSummary | undefined
    if (!request?.id) {
      return
    }
    requestsStore.addRequestToCache(id, request)
    incomingIds.value.add(request.id)
    clearTimeout(incomingTimers.get(request.id))
    incomingTimers.set(request.id, setTimeout(() => {
      incomingIds.value.delete(request.id)
      incomingTimers.delete(request.id)
    }, 3000))
    notify({
      title: `Captured ${request.method} request`,
      color: 'success',
      actions: [{ label: 'View request', icon: 'i-lucide-arrow-right', onClick: () => {
        void router.push({ path: `/token/${id}`, query: { request: request.id } })
      } }],
    })
  } else if ('request.deleted' === event.type && 'string' === typeof event.requestId) {
    requestsStore.removeRequestFromCache(id, event.requestId)
    if (route.query.request === event.requestId) {
      void showRequest()
    }
  } else if ('request.cleared' === event.type) {
    requestsStore.clearRequestsCache(id)
    if (pinned.value) {
      void showRequest()
    }
  }
}

let unsubscribe: (() => void) | undefined
onMounted(() => { unsubscribe = sse.onAny(onEvent) })
onUnmounted(() => {
  unsubscribe?.()
  resetUpdates()
})
</script>

<template>
  <WorkspacePane v-model:open="sidebarOpen" title="Requests" icon="i-lucide-panel-left"
    description="Browse the requests captured by this token.">
    <template #sidebar>
      <RequestSidebar :requests="requests || []" :selected-id="selected?.id" :incoming-ids="incomingIds"
        :pending="isPending" :failed="isError" :pinned="pinned"
        @select="showRequest" @latest="showRequest()" @delete="askToDeleteRequest" @retry="refetch()" />
    </template>

    <PageHeader section="Capture token" :title="tokenLabel" icon="i-lucide-webhook">
      <template #actions>
        <USelectMenu v-if="tokenOptions.length > 1" :model-value="tokenId" :items="tokenOptions" value-key="value"
          icon="i-lucide-arrow-left-right" aria-label="Switch token" class="min-w-0 max-w-full"
          @update:model-value="switchToken" />
        <UButton v-if="token" color="neutral" variant="outline" icon="i-lucide-clipboard-paste"
          label="Ingest request" @click="showIngest = true" />
        <ResponseSettingsModal v-if="token" :key="tokenId" :token-id="tokenId" />
        <UDropdownMenu v-if="token" :items="[
          [{ label: 'All tokens', icon: 'i-lucide-list', to: '/' }],
          [
            { label: 'Clear requests', icon: 'i-lucide-list-x', color: 'error', disabled: !requests?.length, onSelect: () => showClear = true },
            { label: 'Delete token', icon: 'i-lucide-trash-2', color: 'error', onSelect: () => showDeleteToken = true },
          ],
        ]" :content="{ align: 'end' }">
          <UButton variant="ghost" color="neutral" icon="i-lucide-ellipsis" aria-label="Token actions" />
        </UDropdownMenu>
      </template>
    </PageHeader>

    <UAlert v-if="tokenError" color="error" variant="subtle" title="Could not load this token"
      description="It may have been deleted or belong to another session."
      :actions="[
        { label: 'Retry', icon: 'i-lucide-refresh-cw', onClick: () => retryToken() },
        { label: 'All tokens', icon: 'i-lucide-list', to: '/' },
      ]" />
    <USkeleton v-else-if="!token" class="h-14 w-full" aria-label="Loading token" />
    <EndpointBar v-else :token-id="tokenId" :endpoint="endpoint" :automation-enabled="llmEnabled" />

    <div v-if="isPending && !tokenError" class="space-y-2" aria-label="Loading request details" aria-busy="true">
      <USkeleton class="h-20 w-full" />
      <USkeleton class="h-40 w-full" />
    </div>
    <UAlert v-else-if="isError && !tokenError" color="error" variant="subtle" title="Could not load requests"
      :actions="[{ label: 'Retry', icon: 'i-lucide-refresh-cw', onClick: () => refetch() }]" />
    <template v-else-if="selected">
      <RequestDetailsCard :request="selected" :request-number="requestNumber" :token-id="tokenId" />
      <RawRequestCard :request="selected" :token-id="tokenId" />
    </template>
    <UEmpty v-else-if="token" icon="i-lucide-inbox" title="Waiting for a request"
      description="Send a request to the webhook URL above, or ingest a raw HTTP request.">
      <template #actions>
        <UButton variant="outline" color="neutral" label="Ingest request" icon="i-lucide-clipboard-paste"
          @click="showIngest = true" />
      </template>
    </UEmpty>

    <ConfirmModal v-model="showClear" title="Clear request history?" description="This deletes all stored requests for this token."
      confirm-label="Clear requests" :loading="clearing" @confirm="confirmClear" />
    <ConfirmModal v-model="showDeleteToken" title="Delete token?" description="This also deletes all requests for the token."
      confirm-label="Delete token" :loading="deletingToken" @confirm="confirmDeleteToken" />
    <ConfirmModal v-model="showDeleteRequest" title="Delete request?" description="This permanently removes the captured request."
      confirm-label="Delete request" :loading="deletingRequest" @confirm="confirmDeleteRequest" />
    <IngestRequestModal v-model="showIngest" :token-id="tokenId" />
  </WorkspacePane>
</template>
