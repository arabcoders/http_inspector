<script setup lang="ts">
import type { RequestSummary } from '~~/shared/types'
import { getMethodBadgeProps } from '~/utils/request-presentation'

defineProps<{
  requests: RequestSummary[]
  selectedId?: string
  incomingIds: Set<string>
  pending: boolean
  failed: boolean
  pinned: boolean
}>()
defineEmits<{
  select: [id: string]
  delete: [id: string]
  retry: []
  latest: []
}>()

const formatTime = (timestamp: string) => new Date(timestamp).toLocaleString([], {
  month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit',
})
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <div class="flex items-center justify-between gap-2 border-b border-default p-3">
      <div class="flex items-center gap-2">
        <span class="hidden text-sm font-semibold text-highlighted lg:inline">Requests</span>
        <UBadge v-if="!pending && !failed" color="neutral" variant="subtle">{{ requests.length }}</UBadge>
      </div>
      <UButton v-if="pinned" color="neutral" variant="ghost" icon="i-lucide-radio" label="Follow latest"
        @click="$emit('latest')" />
      <UBadge v-else color="success" variant="subtle" icon="i-lucide-radio">Following latest</UBadge>
    </div>
    <div class="min-h-0 flex-1 overflow-y-auto p-2.5">
      <div v-if="pending" class="space-y-2" aria-label="Loading requests" aria-busy="true">
        <USkeleton v-for="index in 3" :key="index" class="h-14 w-full" />
      </div>
      <UAlert v-else-if="failed" title="Could not load requests" color="error" variant="subtle"
        :actions="[{ label: 'Retry', icon: 'i-lucide-refresh-cw', onClick: () => $emit('retry') }]" />
      <UEmpty v-else-if="!requests.length" icon="i-lucide-inbox" title="No requests yet"
        description="Requests appear here as they arrive." :ui="{ root: 'p-4' }" />
      <ul v-else class="space-y-0.5">
        <li v-for="(request, index) in requests" :key="request.id" class="inspector-row"
          :data-selected="selectedId === request.id">
          <button type="button" class="min-w-0 flex-1 rounded text-start focus-visible:outline-2 focus-visible:outline-primary"
            :aria-current="selectedId === request.id ? 'true' : undefined" @click="$emit('select', request.id)">
            <span class="flex flex-wrap items-center gap-1.5">
              <UBadge v-bind="getMethodBadgeProps(request.method)" size="xs">{{ request.method }}</UBadge>
              <span class="text-xs text-toned">#{{ requests.length - index }}</span>
              <UBadge v-if="incomingIds.has(request.id)" color="success" variant="subtle" size="xs">New</UBadge>
              <UBadge v-if="request.isBinary" color="neutral" variant="subtle" size="xs">Binary</UBadge>
            </span>
            <span class="mt-1 block truncate font-mono text-xs text-highlighted" :title="request.url">{{ request.url }}</span>
            <ClientOnly>
              <time class="mt-1 block text-xs text-toned" :datetime="request.createdAt">{{ formatTime(request.createdAt) }}</time>
            </ClientOnly>
          </button>
          <UTooltip text="Delete request">
            <UButton icon="i-lucide-trash-2" size="xs" color="neutral" variant="ghost"
              :aria-label="`Delete request ${requests.length - index}`" @click="$emit('delete', request.id)" />
          </UTooltip>
        </li>
      </ul>
    </div>
  </div>
</template>
