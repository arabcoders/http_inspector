<script setup lang="ts">
import { useNotificationBridge } from '~/composables/useNotificationBridge'
import { copyText } from '~/utils'

const props = defineProps<{ tokenId: string; endpoint: string; automationEnabled: boolean }>()
const { notify } = useNotificationBridge()
const { origin } = useRequestURL()
const webhookPath = computed(() => `/api/payload/${props.endpoint}`)
const automationUrl = computed(() => `${origin}/api/llm/token/${props.endpoint}?secret=${props.tokenId}`)

const copy = async (url: string, label: string) => {
  const copied = await copyText(url)
  notify({ title: copied ? `${label} copied` : `Could not copy ${label.toLowerCase()}`, color: copied ? 'success' : 'error' })
}
</script>

<template>
  <div class="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-lg border border-default bg-elevated/20 p-2.5">
    <div class="flex min-w-0 flex-wrap items-center gap-2">
      <UButton icon="i-lucide-copy" label="Copy webhook URL" @click="copy(`${origin}${webhookPath}`, 'Webhook URL')" />
      <code class="min-w-0 wrap-anywhere text-xs text-toned">{{ webhookPath }}</code>
    </div>
    <UPopover v-if="automationEnabled" :content="{ align: 'end', collisionPadding: 12 }"
      :ui="{ content: 'w-96 max-w-[calc(100vw-1.5rem)] p-3' }">
      <UButton color="neutral" variant="outline" icon="i-lucide-braces" label="Automation API URL" />
      <template #content>
        <UFormField label="Automation API URL" help="Includes the token’s secret. Share it only with trusted clients.">
          <div class="flex min-w-0 gap-2">
            <UInput :model-value="automationUrl" readonly class="min-w-0 flex-1 font-mono" />
            <UButton color="neutral" variant="outline" icon="i-lucide-copy" aria-label="Copy automation API URL"
              @click="copy(automationUrl, 'Automation API URL')" />
          </div>
        </UFormField>
      </template>
    </UPopover>
  </div>
</template>
