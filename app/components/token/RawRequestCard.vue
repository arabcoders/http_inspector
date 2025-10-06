<template>
  <UCard>
    <template #header>
      <button type="button" class="w-full flex items-center justify-between text-left" @click="isOpen = !isOpen">
        <div class="flex flex-col gap-1">
          <span class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {{ summary }}
          </span>
          <span class="text-sm font-medium text-gray-900 dark:text-gray-100">
            View the raw request
          </span>
        </div>
        <div class="flex items-center gap-1">
          <UTooltip v-if="request && !isBinary" :text="canCopyRaw ? 'Copy raw request' : 'Raw request not loaded'">
            <UButton :disabled="!canCopyRaw" size="xs" variant="ghost" color="neutral" icon="i-lucide-copy"
              @click.stop="handleCopyRaw" />
          </UTooltip>

          <UTooltip v-if="request" text="Download raw request">
            <ULink type="button" variant="ghost" color="neutral" size="xs" role="button"
              :href="`/api/token/${tokenId}/requests/${request?.id}/raw`" target="_blank">
              <UIcon name="i-lucide-download" size="xs" class="h-4 w-4" />
            </ULink>
          </UTooltip>
          <UIcon :name="isOpen ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
            class="h-5 w-5 text-gray-500 dark:text-gray-400" />
        </div>
      </button>
    </template>

    <div v-if="isOpen" class="space-y-4 p-4 border-t border-gray-200 dark:border-gray-700">
      <div
        class="max-h-[40vh] overflow-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
        <div v-if="!request" class="flex h-32 items-center justify-center text-sm text-gray-500 dark:text-gray-400">
          Select a request to view its raw payload.
        </div>
        <div v-else-if="isBinary" 
                class="flex h-40 flex-col items-center justify-center gap-2 p-4 text-sm text-gray-500 dark:text-gray-400">
          <UIcon name="i-lucide-alert-circle" class="h-6 w-6" />
          <span>Preview disabled for binary content.</span>
        </div>
        <div v-else-if="rawLoading"
          class="flex h-32 items-center justify-center text-sm text-gray-500 dark:text-gray-400">
          <UIcon name="i-lucide-loader-2" class="h-5 w-5 animate-spin mr-2" /> Loading raw request.
        </div>
        <CodeHighlight v-else-if="rawValue" :code="rawValue" language="http" />
        <div v-else class="p-4 text-sm text-gray-500 dark:text-gray-400">
          <UIcon name="i-lucide-alert-circle" class="h-5 w-5 mr-2 inline-block" />
          Raw request unavailable.
        </div>
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { copyText } from '~/utils'
import CodeHighlight from '~/components/CodeHighlight.vue'
import { notify } from '~/composables/useNotificationBridge'

type RequestSummary = { id: number, method: string, isBinary?: boolean, }
const props = defineProps<{ request: RequestSummary | null, tokenId: string }>()

const isOpen = usePersistedState('raw-request-open', false)
const rawValue = ref<string | null>(null)
const rawLoading = ref(false)

const isBinary = computed(() => Boolean(props.request?.isBinary))
const canCopyRaw = computed(() => !isBinary.value && Boolean(rawValue.value) && !rawLoading.value)

const summary = computed(() => {
  if (!props.request) {
    return 'Select a request to inspect the raw payload.'
  }
  return `#${props.request.id} · ${props.request.method}`
})

watch([() => props.request?.id, isOpen], async ([requestId, open]) => {
  if (!requestId || !open || isBinary.value) {
    return
  }

  await loadRaw(requestId as number)
}, { immediate: false })

watch(() => props.request?.id, () => rawValue.value = null)

const loadRaw = async (requestId: number) => {
  rawLoading.value = true
  try {
    const res = await fetch(`/api/token/${props.tokenId}/requests/${requestId}/raw`)
    if (!res.ok) {
      if (404 === res.status) {
        notify({ title: 'Request not found', description: 'This request may have been deleted.', color: 'error' })
      } else if (400 === res.status) {
        const data = await res.json().catch(() => ({}))
        notify({
          title: 'Cannot display content',
          description: data.message || 'Binary content cannot be displayed as text',
          color: 'warning',
        })
      }
      notify({ title: 'Failed to load raw request', color: 'error' })
      rawValue.value = null
      return
    }
    rawValue.value = (await res.text()) || null
  } catch (error) {
    console.error('Failed to load raw request:', error)
    notify({ title: 'Error loading raw request', description: 'Please try again', color: 'error' })
  } finally {
    rawLoading.value = false
  }
}

const handleCopyRaw = async () => {
  if (!rawValue.value || isBinary.value) {
    return
  }

  await copyText(rawValue.value)
  notify({ title: 'Raw request copied', color: 'success' })
}

watch(() => props.request?.id, () => rawValue.value = null)
</script>
