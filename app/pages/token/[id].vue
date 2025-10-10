<template>
  <div class="flex h-[calc(100vh-180px)] flex-col overflow-hidden">
    <div class="relative flex flex-1 flex-col overflow-hidden lg:flex-row">
      <div v-if="isSidebarOpen" class="fixed inset-0 z-30 backdrop-blur-sm bg-black/40 transition-opacity lg:hidden"
        @click="closeSidebar()" />
      <RequestSidebar :class="[
        'fixed inset-y-0 left-0 z-40 max-w-[20rem] shrink-0 transform shadow-xl transition-transform duration-300 ease-in-out lg:relative lg:inset-auto lg:z-auto lg:max-w-none lg:shadow-none',
        isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      ]" :requests="requests || []" :selected-request-id="selectedRequestId" :incoming-ids="incomingIds"
        :copy-state="copyState" show-mobile-close @close="closeSidebar" @select="handleSelectRequest"
        @copy-url="copyPayloadURL" @clear="showClearModal = true" @ingest="showIngestModal = true"
        @delete="handleDeleteRequest" />

      <ClientOnly>
        <main class="flex-1 overflow-y-auto bg-background">
          <div class="flex items-center justify-between gap-3 px-6 pt-6 pb-6 lg:hidden">
            <UButton icon="i-lucide-menu" variant="soft" color="neutral" @click="openSidebar()">
              Requests
            </UButton>
            <UBadge v-if="selectedRequest" size="sm">
              {{ requests?.length || 0 }} / {{ selectedRequestNumber }}
            </UBadge>
            <div class="flex gap-2">
              <UButton type="button" variant="soft" color="primary" icon="i-lucide-upload"
                @click="showIngestModal = true">
                Ingest
              </UButton>
              <UButton type="button" variant="soft" color="error" icon="i-lucide-trash-2" :disabled="!requests?.length"
                @click="showClearModal = true">
                Clear
              </UButton>
            </div>
          </div>
          <div class="grid gap-6 px-6 pb-6 lg:p-6">
            <ResponseSettingsCard :token-id="tokenId" />
            <RawRequestCard :request="selectedRequest" :request-number="selectedRequestNumber" :token-id="tokenId" />
            <RequestDetailsCard :request="selectedRequest" :request-number="selectedRequestNumber"
              :token-id="tokenId" />
          </div>
        </main>
      </ClientOnly>
    </div>

    <ConfirmModal v-model="showClearModal" title="Clear All Requests"
      description="Are you sure you want to delete all requests for this token? This action cannot be undone."
      confirm-label="Clear All" @confirm="handleClearRequests" />

    <IngestRequestModal v-model="showIngestModal" :token-id="tokenId" @success="handleIngestSuccess" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import type { LocationQueryRaw } from 'vue-router'
import { useRequestsStore } from '~/stores/requests'
import { useTokensStore } from '~/stores/tokens'
import { useSSE } from '~/composables/useSSE'
import type { SSEEventPayload, RequestSummary } from '~~/shared/types'
import { notify } from '~/composables/useNotificationBridge'
import RequestSidebar from '~/components/RequestSidebar.vue'
import ResponseSettingsCard from '~/components/token/ResponseSettingsCard.vue'
import RequestDetailsCard from '~/components/token/RequestDetailsCard.vue'
import RawRequestCard from '~/components/token/RawRequestCard.vue'
import IngestRequestModal from '~/components/IngestRequestModal.vue'
import { copyText, shortSlug } from '~/utils'

const route = useRoute()

const tokenId = computed(() => String(route.params.id || ''))

const { data: token } = useTokensStore().useToken(tokenId)

const requestsStore = useRequestsStore()
const { data: requests } = requestsStore.useRequestsList(tokenId)
const { mutateAsync: deleteRequestMutation } = requestsStore.useDeleteRequest()
const { mutateAsync: deleteAllRequestsMutation } = requestsStore.useDeleteAllRequests()

const selectedRequestId = ref<string | null>(null)
const incomingIds = ref<Set<string>>(new Set())
const copyState = ref<'idle' | 'copied'>('idle')
const showClearModal = ref(false)
const showIngestModal = ref(false)
const isSidebarOpen = useState<boolean>('token-request-sidebar-open', () => false)

const selectedRequestIdRef = ref<string | null>(null)

const selectedRequest = computed(() => requests.value?.find(r => r.id === selectedRequestId.value) || null)
const selectedRequestNumber = computed(() => {
  if (!selectedRequest.value || !requests.value) return null
  const index = requests.value.findIndex(r => r.id === selectedRequest.value!.id)
  return index !== -1 ? requests.value.length - index : null
})

watch(selectedRequestId, async newId => {
  selectedRequestIdRef.value = newId

  if (!import.meta.client) {
    return
  }

  const basePath = `/token/${tokenId.value}`

  if (typeof newId === 'string') {
    if (route.query.request !== newId) {
      const nextQuery: LocationQueryRaw = { ...route.query, request: newId }
      await navigateTo({ path: basePath, query: nextQuery }, { replace: true })
    }
  } else if (route.query.request) {
    const nextQuery: LocationQueryRaw = { ...route.query }
    delete nextQuery.request
    await navigateTo({ path: basePath, query: nextQuery }, { replace: true })
  }
})

// Watch for initial request selection from query params
// This should only run to sync with query params on initial load or when manually navigating
watch(requests, (data) => {
  if (!data || !data.length) return

  // If we already have a selection and it exists in the data, keep it
  if (selectedRequestId.value && data.some(r => r.id === selectedRequestId.value)) {
    return
  }

  // Check for request query parameter (for initial load / URL navigation)
  const requestIdParam = route.query.request
  if (requestIdParam) {
    const requestId = String(requestIdParam)
    if (data.some(r => r.id === requestId)) {
      selectedRequestId.value = requestId
      return
    }
  }

  // No selection and no query param - select the first request
  if (!selectedRequestId.value && data[0]) {
    selectedRequestId.value = data[0].id
  }
}, { immediate: true })

const handleSelectRequest = async (id: string) => {
  selectedRequestId.value = id
  closeSidebar()
  if (incomingIds.value.has(id)) {
    incomingIds.value.delete(id)
    incomingIds.value = new Set(incomingIds.value)
  }
}

const handleDeleteRequest = async (id: string) => {
  try {
    await deleteRequestMutation({ tokenId: tokenId.value, requestId: id })

    // If the deleted request was selected, clear selection or select next
    if (selectedRequestId.value === id) {
      const firstRequest = requests.value && requests.value.length > 0 ? requests.value[0] : null
      selectedRequestId.value = firstRequest ? firstRequest.id : null
    }

    notify({ title: 'Request deleted', variant: 'success' })
  } catch (error) {
    console.error('Failed to delete request:', error)
    notify({ title: 'Failed to delete request', variant: 'error' })
  }
}

const copyPayloadURL = async () => {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const friendlyId = token.value?.friendlyId ?? shortSlug(tokenId.value)
  const url = `${origin}/api/payload/${friendlyId}`

  try {
    await copyText(url)
    copyState.value = 'copied'
    notify({ title: 'Payload URL copied', description: url, variant: 'success' })
    setTimeout(() => copyState.value = 'idle', 1200)
  } catch (error) {
    console.error('Failed to copy URL:', error)
  }
}

const handleClearRequests = async () => {
  showClearModal.value = false

  try {
    await deleteAllRequestsMutation(tokenId.value)
    selectedRequestId.value = null
    notify({ title: 'Requests cleared', variant: 'success' })
  } catch (error) {
    console.error('Failed to clear requests:', error)
    notify({ title: 'Failed to delete requests', variant: 'error' })
  }
}

const handleIngestSuccess = () => {
  // The store will auto-refetch after the mutation
}
const openSidebar = () => isSidebarOpen.value = true
const closeSidebar = () => isSidebarOpen.value = false

const handleClientEvent = (payload: SSEEventPayload) => {
  if (payload.token !== tokenId.value) {
    return
  }

  switch (payload.type) {
    case 'request.received': {
      const incoming = payload.request as RequestSummary | undefined
      if (!incoming) {
        break
      }

      // Determine if we should auto-select before modifying the cache
      // Auto-select if: no selection OR currently viewing the first (latest) request
      const isViewingLatest = requests.value && requests.value.length > 0 && selectedRequestIdRef.value === requests.value[0]?.id
      const shouldAutoselect = selectedRequestIdRef.value === null || isViewingLatest

      // Use store's cache helper to add the request
      requestsStore.addRequestToCache(tokenId.value, incoming)

      if (shouldAutoselect) {
        selectedRequestId.value = incoming.id
      }

      if (!incomingIds.value.has(incoming.id)) {
        incomingIds.value.add(incoming.id)
        incomingIds.value = new Set(incomingIds.value)

        setTimeout(() => {
          incomingIds.value.delete(incoming.id)
          incomingIds.value = new Set(incomingIds.value)
        }, 3000)
      }

      // Calculate request number: requests are in reverse order (newest first)
      const currentRequests = requests.value || []
      const index = currentRequests.findIndex(r => r.id === incoming.id)
      const requestNumber = index !== -1 ? currentRequests.length - index : currentRequests.length

      notify({
        title: `Request ${incoming.method}`,
        description: `Captured #${requestNumber}`,
        color: 'success',
        actions: [{
          label: 'View',
          onClick: async () => {
            await navigateTo(`/token/${tokenId.value}?request=${incoming.id}`)
            selectedRequestId.value = incoming.id
            if (incomingIds.value.has(incoming.id)) {
              incomingIds.value.delete(incoming.id)
              incomingIds.value = new Set(incomingIds.value)
            }
          },
        }],
      })
      break
    }

    case 'request.deleted': {
      if (typeof payload.requestId !== 'string') {
        break
      }

      // Use store's cache helper to remove the request
      requestsStore.removeRequestFromCache(tokenId.value, payload.requestId)

      if (selectedRequestIdRef.value === payload.requestId) {
        selectedRequestId.value = null
      }

      if (incomingIds.value.has(payload.requestId)) {
        incomingIds.value.delete(payload.requestId)
        incomingIds.value = new Set(incomingIds.value)
      }
      break
    }

    case 'request.cleared': {
      // Use store's cache helper to clear requests
      requestsStore.clearRequestsCache(tokenId.value)
      selectedRequestId.value = null

      if (incomingIds.value.size) {
        incomingIds.value.clear()
        incomingIds.value = new Set()
      }
      break
    }

    default:
      break
  }
}

let unsubscribe: (() => void) | null = null

onMounted(async () => {
  isSidebarOpen.value = false
  unsubscribe = useSSE().onAny(handleClientEvent)
})

onUnmounted(() => {
  isSidebarOpen.value = false
  if (unsubscribe) {
    unsubscribe()
  }
})
</script>
