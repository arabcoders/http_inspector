<template>
  <aside
    class="flex h-full w-full max-w-[20rem] flex-col border-r border-gray-200 dark:border-gray-800 bg-white/95 dark:bg-gray-950/95 lg:bg-transparent lg:dark:bg-transparent lg:w-80">
    <div class="flex items-center justify-between gap-3 border-b border-gray-200 dark:border-gray-800 px-4 py-3">
      <div class="flex items-center gap-2">
        <UBadge color="neutral" variant="subtle" size="md" class="uppercase tracking-wide">
          Requests
        </UBadge>
        <UBadge color="primary" variant="soft" size="md">
          {{ requests.length }}
        </UBadge>
      </div>

      <div class="flex items-center gap-2">
        <UButton v-if="showMobileClose" class="lg:hidden" type="button" color="neutral" variant="ghost"
          icon="i-lucide-x" aria-label="Close requests sidebar" @click="$emit('close')" />

        <UTooltip text="Copy Payload URL">
          <UButton type="button" color="neutral" variant="ghost" icon="i-lucide-copy" size="sm"
            aria-label="Copy Payload URL" @click="$emit('copy-url')" />
        </UTooltip>

        <UTooltip text="Manual request Ingestion">
          <UButton type="button" color="primary" variant="ghost" icon="i-lucide-upload" size="sm"
            aria-label="Ingest request" @click="$emit('ingest')" />
        </UTooltip>

        <UTooltip text="Clear all requests">
          <UButton type="button" color="error" variant="ghost" icon="i-lucide-trash-2" size="sm"
            aria-label="Clear all requests" :disabled="!requests.length" @click="$emit('clear')" />
        </UTooltip>
      </div>
    </div>

    <div class="flex-1 overflow-auto">
      <div class="space-y-2 p-3">
        <template v-if="!requests || requests.length === 0">
          <div
            class="flex flex-col items-center justify-center gap-3 rounded border-2 border-dashed border-gray-300 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800/30 p-6 text-center text-sm text-gray-500 dark:text-gray-400">
            <UIcon name="i-lucide-inbox" class="h-8 w-8 text-gray-400 dark:text-gray-600 animate-pulse" />
            <span>Waiting for requests...</span>
          </div>
        </template>

        <template v-else>
          <div v-for="request in requests" :key="request.id"
            class="group relative rounded-xl border border-gray-200 dark:border-gray-700 transition-all duration-150"
            :class="[selectedRequestId === request.id ? 'bg-primary-50/80 dark:bg-primary-900/30 border-primary-300 dark:border-primary-700' : 'hover:bg-gray-50 dark:hover:bg-gray-800',
            incomingIds && incomingIds.has(request.id) ? 'ring-2 ring-success animate-pulse' : '']">
            <UButton type="button" color="neutral" variant="ghost" size="md" class="w-full justify-start text-left"
              @click="$emit('select', request.id)">
              <div class="flex w-full flex-col gap-2">
                <div class="flex items-center gap-2">
                  <UBadge v-bind="getMethodBadgeProps(request.method)" class="uppercase tracking-wide" size="xs">
                    {{ request.method }}
                  </UBadge>

                  <span class="font-mono text-xs text-gray-500 dark:text-gray-400">#{{ request.id }}</span>

                  <UBadge v-if="incomingIds && incomingIds.has(request.id)" color="success" variant="solid" size="xs"
                    class="font-semibold uppercase">
                    New
                  </UBadge>

                  <div class="ml-auto inline-flex items-center gap-1">
                    <UBadge v-if="request.isBinary" color="primary" variant="outline" size="xs">
                      <UIcon name="i-heroicons-document-arrow-down" class="h-3 w-3" />
                      BINARY
                    </UBadge>
                    <UTooltip text="Delete request">
                      <UButton type="button" color="error" variant="ghost" icon="i-lucide-trash-2" size="xs"
                        aria-label="Delete request" @click.stop="$emit('delete', request.id)" />
                    </UTooltip>
                  </div>
                </div>

                <div class="flex items-center text-xs text-gray-600 dark:text-gray-400">
                  <span v-if="request.clientIp || request.remoteIp" class="truncate">
                    {{ request.remoteIp || request.clientIp }}
                  </span>
                  <span class="ml-auto">
                    {{ formatTime(request.createdAt) }}
                  </span>
                </div>
              </div>
            </UButton>
          </div>
        </template>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">

defineEmits<{
  (e: 'select' | 'delete', id: number): void
  (e: 'copy-url' | 'clear' | 'close' | 'ingest'): void
}>()

type RequestSummary = {
  id: number
  method: string
  clientIp?: string
  remoteIp?: string
  createdAt: string
  isBinary?: boolean
}

defineProps<{
  requests: Array<RequestSummary>
  selectedRequestId: number | null
  copyState?: 'idle' | 'copied'
  incomingIds?: Set<number>
  showMobileClose?: boolean
}>()

type BadgeColor = 'primary' | 'neutral' | 'info' | 'success' | 'warning' | 'error'
type BadgeVariant = 'solid' | 'soft' | 'outline' | 'subtle'

type MethodBadgeProps = {
  color: BadgeColor
  variant: BadgeVariant
}

const getMethodBadgeProps = (method: string): MethodBadgeProps => {
  const normalized = method.toUpperCase()
  const map: Record<string, MethodBadgeProps> = {
    GET: { color: 'info', variant: 'soft' },
    POST: { color: 'success', variant: 'soft' },
    PUT: { color: 'warning', variant: 'soft' },
    PATCH: { color: 'primary', variant: 'soft' },
    DELETE: { color: 'error', variant: 'soft' },
  }

  return map[normalized] ?? { color: 'neutral', variant: 'outline' }
}

const formatTime = (value: unknown): string => {
  try {
    if (!value) return ''
    const date = new Date(value as string)
    return date.toLocaleTimeString([], {
      month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    })
  } catch {
    return ''
  }
}
</script>
