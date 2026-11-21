<script setup lang="ts">
import { useSessionStore } from '~/stores/session'

const open = defineModel<boolean>({ required: true })
const formId = useId()
const { mutateAsync: restore, isPending } = useSessionStore().useRestoreSession()
const sessionId = ref('')
const error = ref('')

watch(open, () => {
  sessionId.value = ''
  error.value = ''
})

const submit = async () => {
  error.value = ''
  try {
    await restore(sessionId.value.trim())
    // Reload so cached tokens and the event stream belong to the restored session.
    window.location.assign('/')
  } catch (err) {
    console.error('Could not restore session:', err)
    error.value = (err as { data?: { message?: string } })?.data?.message || 'Could not restore the session.'
  }
}
</script>

<template>
  <UModal v-model:open="open" title="Restore session" description="Enter a session ID to recover its tokens and requests."
    :dismissible="!isPending" :close="!isPending">
    <template #body>
      <form :id="formId" @submit.prevent="submit">
        <UFormField label="Session ID" :error="error || undefined" required>
          <UInput v-model="sessionId" placeholder="famous-amethyst-panda" class="w-full font-mono"
            :disabled="isPending" required />
        </UFormField>
      </form>
    </template>
    <template #footer>
      <UButton type="submit" :form="formId" icon="i-lucide-history" label="Restore session"
        :loading="isPending" :disabled="!sessionId.trim()" />
    </template>
  </UModal>
</template>
