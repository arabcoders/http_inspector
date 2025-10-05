<template>
  <div class="flex h-[calc(100vh-180px)] flex-col overflow-hidden">
    <div class="relative flex flex-1 flex-col overflow-hidden lg:flex-row">
      <div v-if="isSidebarOpen" class="fixed inset-0 z-30 backdrop-blur-sm bg-black/40 transition-opacity lg:hidden"
        @click="closeSidebar()" />
      <RequestSidebar :class="[
        'fixed inset-y-0 left-0 z-40 max-w-[20rem] shrink-0 transform shadow-xl transition-transform duration-300 ease-in-out lg:relative lg:inset-auto lg:z-auto lg:max-w-none lg:shadow-none',
        isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      ]" :requests="requests" :selected-request-id="selectedRequestId" :incoming-ids="incomingIds"
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
              {{ selectedRequest.id }}
            </UBadge>
            <div class="flex gap-2">
              <UButton type="button" variant="soft" color="primary" icon="i-lucide-upload"
                @click="showIngestModal = true">
                Ingest
              </UButton>
              <UButton type="button" variant="soft" color="error" icon="i-lucide-trash-2" :disabled="!requests.length"
                @click="showClearModal = true">
                Clear
              </UButton>
            </div>
          </div>
          <div class="grid gap-6 px-6 pb-6 lg:p-6">
            <ResponseSettingsCard :token-id="tokenId" />
            <RawRequestCard :request="selectedRequest" :token-id="tokenId" />
            <RequestDetailsCard :request="selectedRequest" :token-id="tokenId" />
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
import { useSSE, type SSEEventPayload } from '~/composables/useSSE'
import { notify } from '~/composables/useNotificationBridge'
import RequestSidebar from '~/components/RequestSidebar.vue'
import ResponseSettingsCard from '~/components/token/ResponseSettingsCard.vue'
import RequestDetailsCard from '~/components/token/RequestDetailsCard.vue'
import RawRequestCard from '~/components/token/RawRequestCard.vue'
import IngestRequestModal from '~/components/IngestRequestModal.vue'
import { copyText } from '~/utils'

const route = useRoute()

const tokenId = computed(() => String(route.params.id || ''))

type RequestSummary = {
  id: number
  tokenId: string
  method: string
  headers: string
  url: string
  body?: string | null
  contentType?: string
  isBinary: boolean
  clientIp?: string
  remoteIp?: string
  createdAt: string
}

const requests = ref<RequestSummary[]>([])
const selectedRequestId = ref<number | null>(null)
const incomingIds = ref<Set<number>>(new Set())
const copyState = ref<'idle' | 'copied'>('idle')
const showClearModal = ref(false)
const showIngestModal = ref(false)
const isSidebarOpen = useState<boolean>('token-request-sidebar-open', () => false)
const tokenExists = ref(false)

const latestRequestIdRef = ref<number | null>(null)
const selectedRequestIdRef = ref<number | null>(null)

const selectedRequest = computed(() => requests.value.find(r => r.id === selectedRequestId.value) || null)
watch(requests, n => latestRequestIdRef.value = n.length && n[0] ? n[0].id : null)

watch(selectedRequestId, async newId => {
  selectedRequestIdRef.value = newId

  if (!import.meta.client) {
    return
  }

  const basePath = `/token/${tokenId.value}`

  if (typeof newId === 'number') {
    const newIdStr = newId.toString()
    if (route.query.request !== newIdStr) {
      const nextQuery: LocationQueryRaw = { ...route.query, request: newIdStr }
      await navigateTo({ path: basePath, query: nextQuery }, { replace: true })
    }
  } else if (route.query.request) {
    const nextQuery: LocationQueryRaw = { ...route.query }
    delete nextQuery.request
    await navigateTo({ path: basePath, query: nextQuery }, { replace: true })
  }
})

const loadRequests = async () => {
  try {
    const res = await fetch(`/api/token/${tokenId.value}/requests`)
    if (!res.ok) {
      if (404 === res.status) {
        notify({
          title: 'Token not found',
          description: 'This token does not exist or has been deleted.',
          color: 'error'
        })
        await navigateTo('/')
        return
      }
      throw new Error(`HTTP ${res.status}: ${res.statusText}`)
    }

    const data = await res.json() as RequestSummary[]
    requests.value = data
    tokenExists.value = true

    // Check for request query parameter
    const requestIdParam = route.query.request
    if (requestIdParam) {
      const requestId = Number(requestIdParam)
      if (!isNaN(requestId) && data.some(r => r.id === requestId)) {
        selectedRequestId.value = requestId
        return
      }
    }

    if (!selectedRequestId.value && data.length > 0 && data[0]) {
      selectedRequestId.value = data[0].id
    }
  } catch (error) {
    console.error('Failed to load requests:', error)
    notify({
      title: 'Error loading requests',
      description: 'Failed to load requests. Please try again.',
      color: 'error',
    })
  }
}

const handleSelectRequest = async (id: number) => {
  selectedRequestId.value = id
  closeSidebar()
  if (incomingIds.value.has(id)) {
    incomingIds.value.delete(id)
    incomingIds.value = new Set(incomingIds.value)
  }
}

const handleDeleteRequest = async (id: number) => {
  try {
    const res = await fetch(`/api/token/${tokenId.value}/requests/${id}`, { method: 'DELETE' })
    if (res.ok) {
      requests.value = requests.value.filter(r => r.id !== id)

      // If the deleted request was selected, clear selection or select next
      if (selectedRequestId.value === id) {
        const firstRequest = requests.value.length > 0 ? requests.value[0] : null
        selectedRequestId.value = firstRequest ? firstRequest.id : null
      }

      notify({ title: 'Request deleted', variant: 'success' })
    } else {
      throw new Error('Failed to delete request')
    }
  } catch (error) {
    console.error('Failed to delete request:', error)
    notify({ title: 'Failed to delete request', variant: 'error' })
  }
}

const copyPayloadURL = async () => {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const url = `${origin}/api/payload/${tokenId.value}`

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
    const res = await fetch(`/api/token/${tokenId.value}/requests`, { method: 'DELETE' })
    if (res.ok) {
      requests.value = []
      selectedRequestId.value = null
      notify({ title: 'Requests cleared', variant: 'success' })
    }
  } catch (error) {
    console.error('Failed to clear requests:', error)
    notify({ title: 'Failed to delete requests', variant: 'error' })
  }
}

const handleIngestSuccess = async (requestId: number) => {
  // Reload requests to get the newly ingested request
  await loadRequests()

  // Select the newly ingested request
  selectedRequestId.value = requestId

  notify({
    title: 'Request ingested',
    description: `Request #${requestId} has been added successfully`,
    variant: 'success'
  })
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

      if (!requests.value.some(r => r.id === incoming.id)) {
        requests.value = [incoming, ...requests.value]
      }

      // Auto-select if no selection or if latest was selected
      const shouldAutoselect = selectedRequestIdRef.value === null || selectedRequestIdRef.value === latestRequestIdRef.value

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

      notify({
        title: `Request ${incoming.method}`,
        description: `Captured #${incoming.id}`,
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
      if (typeof payload.requestId !== 'number') {
        break
      }
      console.log('Deleting request with ID:', payload.requestId, requests.value.map(r => r.id))

      requests.value = requests.value.filter(r => r.id !== payload.requestId)

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
      requests.value = []
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
  await loadRequests()
  unsubscribe = useSSE().onAny(handleClientEvent)
})

onUnmounted(() => {
  isSidebarOpen.value = false
  if (unsubscribe) {
    unsubscribe()
  }
})
</script>
