<script setup lang="ts">
import { copyText } from '~/utils'
import { useNotificationBridge } from '~/composables/useNotificationBridge'

const props = defineProps<{
  title: string
  icon: string
  entries: { key: string; value: string }[]
  empty: string
  copyAllText: string
}>()
const open = defineModel<boolean>('open', { required: true })
const { notify } = useNotificationBridge()
const panelId = useId()

const copy = async (value: string, label: string) => {
  const copied = await copyText(value)
  notify({ title: copied ? `${label} copied` : 'Could not copy', color: copied ? 'success' : 'error' })
}
</script>

<template>
  <section class="min-w-0 overflow-hidden rounded-lg border border-default bg-elevated/20">
    <div class="flex items-center gap-2 p-2.5">
      <button type="button" class="flex min-w-0 flex-1 items-center gap-2 rounded text-start focus-visible:outline-2 focus-visible:outline-primary"
        :aria-expanded="open" :aria-controls="panelId" @click="open = !open">
        <UIcon :name="icon" class="size-4 shrink-0 text-muted" aria-hidden="true" />
        <span class="text-sm font-medium text-highlighted">{{ title }}</span>
        <UBadge color="neutral" variant="subtle" size="xs">{{ entries.length }}</UBadge>
        <UIcon :name="open ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" class="ms-auto size-4 shrink-0 text-muted" aria-hidden="true" />
      </button>
      <UTooltip :text="`Copy all ${title.toLowerCase()}`">
        <UButton variant="ghost" color="neutral" size="xs" icon="i-lucide-copy" :disabled="!entries.length"
          :aria-label="`Copy all ${title.toLowerCase()}`" @click="copy(props.copyAllText, title)" />
      </UTooltip>
    </div>

    <div v-show="open" :id="panelId" class="border-t border-default">
      <p v-if="!entries.length" class="p-3 text-sm text-toned">{{ empty }}</p>
      <dl v-else class="divide-y divide-default">
        <div v-for="({ key, value }, index) in entries" :key="`${key}-${index}`"
          class="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 px-3 py-2 odd:bg-elevated/25">
          <dt class="col-start-1 font-mono text-xs font-medium wrap-anywhere text-highlighted">{{ key }}</dt>
          <dd class="col-start-1 min-w-0 font-mono text-xs wrap-anywhere whitespace-pre-wrap text-toned">{{ value }}</dd>
          <dd class="col-start-2 row-span-2 row-start-1">
            <UTooltip :text="`Copy ${key}`">
              <UButton variant="ghost" color="neutral" size="xs" icon="i-lucide-copy" :aria-label="`Copy ${key}`"
                @click="copy(value, key)" />
            </UTooltip>
          </dd>
        </div>
      </dl>
    </div>
  </section>
</template>
