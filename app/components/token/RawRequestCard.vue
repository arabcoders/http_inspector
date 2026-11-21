<script setup lang="ts">
import type { RequestSummary } from '~~/shared/types'
import { useNotificationBridge } from '~/composables/useNotificationBridge'
import { useRequestsStore } from '~/stores/requests'
import { copyText } from '~/utils'

const props = defineProps<{ request: RequestSummary; tokenId: string }>()
const { notify } = useNotificationBridge()
const open = usePersistedState('raw-request-open', false)
const panelId = useId()
const downloadUrl = computed(() => `/api/token/${props.tokenId}/requests/${props.request.id}/raw?download=1`)
const { data: raw, isPending, isError, refetch } = useRequestsStore().useRequestPreview('raw', {
  tokenId: computed(() => props.tokenId),
  requestId: computed(() => props.request.id),
  enabled: computed(() => open.value && !props.request.isBinary),
})

const copy = async () => {
  if (!raw.value || props.request.isBinary || isError.value) {
    return
  }
  const copied = await copyText(raw.value)
  notify({ title: copied ? 'Raw request copied' : 'Could not copy raw request', color: copied ? 'success' : 'error' })
}
</script>

<template>
  <UCard :ui="{ header: 'p-3 sm:p-3', body: 'p-0 sm:p-0' }">
    <template #header>
      <div class="flex items-center gap-1">
        <h2 class="min-w-0 flex-1">
          <button type="button" class="flex w-full items-center gap-2 rounded text-start text-sm font-medium text-highlighted focus-visible:outline-2 focus-visible:outline-primary"
            :aria-expanded="open" :aria-controls="panelId" @click="open = !open">
            <span class="inspector-section-icon size-8"><UIcon name="i-lucide-code" class="size-4" aria-hidden="true" /></span>
            Raw HTTP request
            <UIcon :name="open ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
              class="ms-auto size-4 shrink-0 text-muted" aria-hidden="true" />
          </button>
        </h2>
        <UTooltip v-if="!request.isBinary" text="Copy raw request">
          <UButton color="neutral" variant="ghost" size="xs" icon="i-lucide-copy" aria-label="Copy raw request"
            :disabled="!raw || isError" @click="copy" />
        </UTooltip>
        <UTooltip text="Download raw request">
          <UButton :to="downloadUrl" external target="_blank" color="neutral" variant="ghost" size="xs"
            icon="i-lucide-download" aria-label="Download raw request" />
        </UTooltip>
      </div>
    </template>
    <div v-show="open" :id="panelId" class="min-w-0 overflow-hidden rounded-b-lg">
      <template v-if="open">
        <p v-if="request.isBinary" class="p-3 text-sm text-toned">Binary content can be downloaded but not previewed.</p>
        <p v-else-if="isPending" class="p-3 text-sm text-toned" role="status">Loading raw request…</p>
        <UAlert v-else-if="isError" class="m-3" color="error" variant="subtle" title="Could not load the raw request"
          :actions="[{ label: 'Retry', icon: 'i-lucide-refresh-cw', onClick: () => refetch() }]" />
        <CodeHighlight v-else-if="raw" :code="raw" language="http" />
        <p v-else class="p-3 text-sm text-toned">No raw request content.</p>
      </template>
    </div>
  </UCard>
</template>
