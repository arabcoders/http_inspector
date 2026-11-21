<script setup lang="ts">
import type { TokenListItem } from '~~/shared/types'
import { shortSlug } from '~/utils'

defineProps<{
  tokens: TokenListItem[]
  pending: boolean
  failed: boolean
  creating: boolean
  incomingIds: Set<string>
}>()
defineEmits<{
  create: []
  retry: []
  'delete-all': []
  delete: [id: string]
  'copy-url': [id: string]
  select: []
}>()
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <div class="flex items-center justify-between gap-2 border-b border-default p-3">
      <div class="flex items-center gap-2">
        <span class="hidden text-sm font-semibold text-highlighted lg:inline">Tokens</span>
        <UBadge v-if="!pending && !failed" color="neutral" variant="subtle">{{ tokens.length }}</UBadge>
      </div>
      <div class="flex items-center gap-1">
        <UButton icon="i-lucide-plus" label="New token" :loading="creating" @click="$emit('create')" />
        <UTooltip text="Delete all tokens">
          <UButton icon="i-lucide-trash-2" color="error" variant="ghost" aria-label="Delete all tokens"
            :disabled="!tokens.length" @click="$emit('delete-all')" />
        </UTooltip>
      </div>
    </div>
    <div class="min-h-0 flex-1 overflow-y-auto p-2.5">
      <div v-if="pending" class="space-y-2" aria-label="Loading tokens" aria-busy="true">
        <USkeleton v-for="index in 3" :key="index" class="h-14 w-full" />
      </div>
      <UAlert v-else-if="failed" color="error" variant="subtle" title="Could not load tokens"
        :actions="[{ label: 'Retry', icon: 'i-lucide-refresh-cw', onClick: () => $emit('retry') }]" />
      <UEmpty v-else-if="!tokens.length" icon="i-lucide-webhook" title="No tokens yet"
        description="Create a token to get a webhook URL." :ui="{ root: 'p-4' }" />
      <ul v-else class="space-y-0.5">
        <li v-for="token in tokens" :key="token.id" class="inspector-row justify-between">
          <NuxtLink :to="`/token/${token.id}`"
            class="block min-w-0 flex-1 rounded focus-visible:outline-2 focus-visible:outline-primary"
            @click="$emit('select')">
            <span class="block truncate text-sm font-medium text-highlighted" :title="token.friendlyId || token.id">
              {{ token.friendlyId || shortSlug(token.id) }}
            </span>
            <span class="mt-1 flex items-center gap-2 text-xs text-toned">
              {{ token._count?.requests ?? 0 }} {{ 1 === token._count?.requests ? 'request' : 'requests' }}
              <UBadge v-if="incomingIds.has(token.id)" color="success" variant="subtle" size="xs">New</UBadge>
            </span>
          </NuxtLink>
          <div class="flex shrink-0 items-center">
            <UTooltip text="Copy webhook URL">
              <UButton icon="i-lucide-copy" color="neutral" variant="ghost"
                :aria-label="`Copy webhook URL for ${token.friendlyId || shortSlug(token.id)}`"
                @click="$emit('copy-url', token.id)" />
            </UTooltip>
            <UTooltip text="Delete token">
              <UButton icon="i-lucide-trash-2" color="error" variant="ghost"
                :aria-label="`Delete token ${token.friendlyId || shortSlug(token.id)}`"
                @click="$emit('delete', token.id)" />
            </UTooltip>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>
