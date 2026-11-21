<script setup lang="ts">
import { useNotificationBridge } from '~/composables/useNotificationBridge'
import { useTokensStore } from '~/stores/tokens'

const props = defineProps<{ tokenId: string }>()
const { notify } = useNotificationBridge()
const store = useTokensStore()
const { data } = store.useToken(computed(() => props.tokenId))
const { mutateAsync: update, isPending } = store.useUpdateToken()
const open = ref(false)
const formId = useId()
const draft = reactive({ enabled: false, status: 200 as number | null, headers: '', body: '' })
const error = ref('')

watch(open, (isOpen) => {
  const token = data.value
  if (!isOpen || !token) {
    return
  }
  error.value = ''
  draft.enabled = token.responseEnabled
  draft.status = token.responseStatus
  draft.headers = Object.entries(token.responseHeaders ?? {}).map(([key, value]) => `${key}: ${value}`).join('\n')
  draft.body = token.responseBody ?? ''
})

const save = async () => {
  if (isPending.value) {
    return
  }
  error.value = ''
  const status = draft.status ?? 200
  const validStatus = Number.isInteger(status) && 100 <= status && 599 >= status
  if (draft.enabled && !validStatus) {
    error.value = 'Enter an HTTP status code from 100 to 599.'
    return
  }
  const lines = draft.headers.split(/\r?\n/).flatMap((line) => {
    const colon = line.indexOf(':')
    const key = line.slice(0, colon).trim()
    return 0 < colon && key ? [[key, line.slice(colon + 1).trim()]] : []
  })

  try {
    await update({ tokenId: props.tokenId, updates: {
      responseEnabled: draft.enabled,
      responseStatus: validStatus ? status : data.value?.responseStatus ?? 200,
      responseHeaders: lines.length ? JSON.stringify(Object.fromEntries(lines)) : null,
      responseBody: draft.body || null,
    } })
    open.value = false
    notify({ title: 'Response settings saved', color: 'success' })
  } catch (err) {
    console.error('Could not save response settings:', err)
    error.value = 'Could not save response settings. Try again.'
  }
}
</script>

<template>
  <UModal v-model:open="open" title="Response settings"
    description="Configure what this webhook returns after capturing a request."
    :dismissible="!isPending" :close="{ disabled: isPending }"
    :ui="{ content: 'w-full sm:max-w-xl', body: 'max-h-[75dvh] overflow-y-auto p-4 sm:p-5' }">
    <UButton color="neutral" variant="outline" icon="i-lucide-settings" label="Response settings" />

    <template #body>
      <form :id="formId" class="space-y-4" @submit.prevent="save">
        <UAlert v-if="error" role="alert" color="error" variant="soft" icon="i-lucide-circle-alert" :description="error" />
        <UCard :ui="{ body: 'space-y-4 p-4 sm:p-5' }">
          <USwitch v-model="draft.enabled" name="responseEnabled" label="Send a custom response"
            description="When off, the webhook uses its default response."
            :ui="{
              root: 'w-full flex-row-reverse items-start justify-between gap-3',
              wrapper: 'ms-0 flex-1',
              label: 'font-semibold text-default',
              description: 'text-sm text-toned',
            }"
            :disabled="isPending" />

          <div v-if="draft.enabled" class="space-y-4 border-t border-default pt-4">
            <UFormField label="Status code" name="responseStatus" help="Defaults to 200.">
              <UInput v-model.nullable="draft.status" type="number" min="100" max="599" step="1" icon="i-lucide-hash"
                placeholder="200" :disabled="isPending" class="w-full sm:w-40" />
            </UFormField>
            <UFormField label="Headers" name="responseHeaders" help="Enter one header per line as Name: Value.">
              <UTextarea v-model="draft.headers" placeholder="Content-Type: application/json" :rows="3"
                :disabled="isPending" class="w-full font-mono" />
            </UFormField>
            <UFormField label="Body" name="responseBody" help="Leave blank for an empty response body.">
              <UTextarea v-model="draft.body" :rows="4" :disabled="isPending" class="w-full font-mono" />
            </UFormField>
          </div>
        </UCard>
      </form>
    </template>

    <template #footer>
      <UButton type="submit" :form="formId" icon="i-lucide-save" label="Save response" :loading="isPending" />
    </template>
  </UModal>
</template>
