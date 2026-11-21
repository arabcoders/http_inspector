<script setup lang="ts">
import { useRequestsStore } from '~/stores/requests'

const props = defineProps<{ tokenId: string }>()
const open = defineModel<boolean>({ required: true })
const formId = useId()
const { mutateAsync: ingest, isPending } = useRequestsStore().useIngestRequest()
const raw = ref('')
const clientIp = ref('')
const remoteIp = ref('')
const error = ref('')
const errors = ref<{ clientIp?: string; remoteIp?: string }>({})

watch(open, () => {
  raw.value = clientIp.value = remoteIp.value = error.value = ''
  errors.value = {}
})

const validIp = (ip: string) => !ip || (/^(\d{1,3}\.){3}\d{1,3}$/.test(ip) &&
  ip.split('.').every(part => Number(part) <= 255))

const submit = async () => {
  error.value = ''
  errors.value = {
    clientIp: validIp(clientIp.value) ? undefined : 'Enter a valid IPv4 address.',
    remoteIp: validIp(remoteIp.value) ? undefined : 'Enter a valid IPv4 address.',
  }
  if (!raw.value.trim() || errors.value.clientIp || errors.value.remoteIp) {
    return
  }
  try {
    await ingest({
      tokenId: props.tokenId,
      body: {
        raw: raw.value.replace(/\r\n|\r|\n/g, '\r\n'),
        clientIp: clientIp.value || undefined,
        remoteIp: remoteIp.value || undefined,
      },
    })
    open.value = false
  } catch (err) {
    console.error('Could not ingest request:', err)
    error.value = (err as { data?: { message?: string } })?.data?.message || 'Could not ingest the request.'
  }
}
</script>

<template>
  <UModal v-model:open="open" title="Ingest request" description="Add a raw HTTP request to this token’s capture history."
    :dismissible="!isPending" :close="!isPending" :ui="{ content: 'sm:max-w-2xl' }">
    <template #body>
      <form :id="formId" class="space-y-4" @submit.prevent="submit">
        <UAlert v-if="error" role="alert" color="error" variant="subtle" icon="i-lucide-circle-alert" :description="error" />
        <UFormField label="Raw HTTP request" required>
          <UTextarea v-model="raw" :placeholder="'GET /example HTTP/1.1\nHost: example.com\n\n'" :rows="8"
            :disabled="isPending" class="w-full font-mono" required />
        </UFormField>
        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField label="Client IP (optional)" :error="errors.clientIp">
            <UInput v-model="clientIp" placeholder="192.0.2.1" :disabled="isPending" class="w-full" />
          </UFormField>
          <UFormField label="Remote IP (optional)" :error="errors.remoteIp">
            <UInput v-model="remoteIp" placeholder="203.0.113.1" :disabled="isPending" class="w-full" />
          </UFormField>
        </div>
      </form>
    </template>
    <template #footer>
      <UButton type="submit" :form="formId" icon="i-lucide-clipboard-paste" label="Ingest request"
        :loading="isPending" :disabled="!raw.trim()" />
    </template>
  </UModal>
</template>
