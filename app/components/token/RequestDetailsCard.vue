<script setup lang="ts">
import type { RequestSummary } from '~~/shared/types'
import RequestFields from './RequestFields.vue'
import { useNotificationBridge } from '~/composables/useNotificationBridge'
import { useRequestsStore } from '~/stores/requests'
import { copyText } from '~/utils'
import { formatRequestBody, getMethodBadgeProps } from '~/utils/request-presentation'

const props = defineProps<{ request: RequestSummary; requestNumber: number | null; tokenId: string }>()
const { notify } = useNotificationBridge()
const bodyOpen = usePersistedState('request-body-open', false)
const queryOpen = usePersistedState('request-query-open', true)
const headersOpen = usePersistedState('request-headers-open', true)
const bodyPanelId = useId()
const clientIp = computed(() => props.request.remoteIp || props.request.clientIp)

const queryParams = computed(() => {
  try {
    const url = new URL(props.request.url, 'http://localhost')
    return Array.from(url.searchParams, ([key, value]) => ({ key, value }))
  } catch {
    return []
  }
})
const headers = computed(() => {
  try {
    const parsed = JSON.parse(props.request.headers) as Record<string, unknown>
    return Object.entries(parsed).map(([name, value]) => ({
      key: name.replace(/(^|[-_])[a-z]/g, part => part.toUpperCase()).replace(/_/g, '-'),
      value: String(value),
    }))
  } catch {
    return []
  }
})

const { data, isPending, isError, refetch } = useRequestsStore().useRequestPreview('body', {
  tokenId: computed(() => props.tokenId),
  requestId: computed(() => props.request.id),
  enabled: computed(() => bodyOpen.value && !props.request.isBinary && 0 < props.request.contentLength),
})
const preview = computed(() => data.value && !data.value.isBinary
  ? formatRequestBody(data.value.text ?? '', data.value.contentType ?? '')
  : null)
const bodyDownload = computed(() => `/api/token/${props.tokenId}/requests/${props.request.id}/body/download?download=1`)

const copy = async (value: string, label: string) => {
  const copied = await copyText(value)
  notify({ title: copied ? `${label} copied` : 'Could not copy', color: copied ? 'success' : 'error' })
}
const copyUrl = () => {
  const url = /^https?:\/\//i.test(props.request.url)
    ? props.request.url
    : `${window.location.origin}/${props.request.url.replace(/^\//, '')}`
  return copy(url, 'Request URL')
}
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex min-w-0 flex-wrap items-center gap-2">
        <span class="inspector-section-icon size-8"><UIcon name="i-lucide-scan-search" class="size-4" aria-hidden="true" /></span>
        <h2 class="font-semibold text-highlighted">Request details</h2>
        <UBadge v-if="requestNumber" color="neutral" variant="subtle">#{{ requestNumber }}</UBadge>
        <UBadge v-bind="getMethodBadgeProps(request.method)">{{ request.method }}</UBadge>
        <UBadge v-if="request.isBinary" color="neutral" variant="subtle" icon="i-lucide-file">Binary</UBadge>
      </div>
    </template>

    <div class="space-y-4">
      <div class="flex min-w-0 items-start justify-between gap-2 rounded-md border border-default bg-elevated/30 px-3 py-2">
        <code class="min-w-0 self-center text-sm wrap-anywhere text-highlighted">{{ request.url }}</code>
        <UTooltip text="Copy request URL">
          <UButton color="neutral" variant="ghost" icon="i-lucide-copy" size="xs" aria-label="Copy request URL" @click="copyUrl" />
        </UTooltip>
      </div>

      <div v-if="clientIp" class="flex flex-wrap items-center gap-2">
        <span class="text-xs font-medium text-toned">Client IP</span>
        <UButton :label="clientIp" color="neutral" variant="soft" icon="i-lucide-copy" size="xs"
          aria-label="Copy client IP" @click="copy(clientIp, 'Client IP')" />
        <UButton :to="`https://who.is/whois-ip/ip-address/${encodeURIComponent(clientIp)}`" external target="_blank"
          color="neutral" variant="link" trailing-icon="i-lucide-external-link" size="xs" label="Whois" />
      </div>

      <div class="grid gap-3 xl:grid-cols-2">
        <RequestFields v-model:open="headersOpen" title="Headers" icon="i-lucide-list" :entries="headers"
          empty="No headers captured." :copy-all-text="headers.map(({ key, value }) => `${key}: ${value}`).join('\n')" />
        <RequestFields v-model:open="queryOpen" title="Query parameters" icon="i-lucide-list-filter" :entries="queryParams"
          empty="No query parameters captured."
          :copy-all-text="queryParams.map(({ key, value }) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&')" />
      </div>

      <section v-if="request.contentLength > 0" class="min-w-0 overflow-hidden rounded-lg border border-default bg-elevated/20">
        <div class="flex items-center gap-2 p-2.5">
          <button type="button" class="flex min-w-0 flex-1 items-center gap-2 rounded text-start focus-visible:outline-2 focus-visible:outline-primary"
            :aria-expanded="bodyOpen" :aria-controls="bodyPanelId" @click="bodyOpen = !bodyOpen">
            <UIcon name="i-lucide-file-text" class="size-4 shrink-0 text-muted" aria-hidden="true" />
            <span class="text-sm font-medium text-highlighted">Body</span>
            <UBadge color="neutral" variant="subtle" size="xs">{{ request.contentLength }} bytes</UBadge>
            <UIcon :name="bodyOpen ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
              class="ms-auto size-4 shrink-0 text-muted" aria-hidden="true" />
          </button>
          <UTooltip text="Download body">
            <UButton :to="bodyDownload" external target="_blank" icon="i-lucide-download" variant="ghost" color="neutral"
              size="xs" aria-label="Download body" />
          </UTooltip>
        </div>

        <div v-show="bodyOpen" :id="bodyPanelId" class="border-t border-default">
          <template v-if="bodyOpen">
            <p v-if="request.isBinary || data?.isBinary" class="p-3 text-sm text-toned">
              Binary content can be downloaded but not previewed.
            </p>
            <p v-else-if="isPending" class="p-3 text-sm text-toned" role="status">Loading body…</p>
            <UAlert v-else-if="isError" class="m-3" color="error" variant="subtle" title="Could not load the body"
              :actions="[{ label: 'Retry', icon: 'i-lucide-refresh-cw', onClick: () => refetch() }]" />
            <CodeHighlight v-else-if="preview?.content" :code="preview.content" :language="preview.language" />
            <p v-else class="p-3 text-sm text-toned">No body content.</p>
          </template>
        </div>
      </section>
    </div>
  </UCard>
</template>
