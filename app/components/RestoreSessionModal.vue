<template>
  <UModal v-model:open="isOpen">
    <template #header>
      <div class="flex items-center justify-between w-full">
        <h3 class="text-lg font-semibold">Restore Session</h3>
        <UButton color="neutral" variant="ghost" icon="i-lucide-x" size="sm" class="-my-1" @click="isOpen = false" />
      </div>
    </template>

    <template #body>
      <div class="space-y-4">
        <p class="text-sm text-gray-600 dark:text-gray-400">
          Enter your session ID to restore your tokens and requests.
        </p>

        <div class="space-y-2">
          <label for="session-id" class="block font-bold text-sm text-gray-700 dark:text-gray-300">
            Session ID
          </label>
          <UInput id="session-id" v-model="sessionId" placeholder="famous-amethyst-panda" size="lg" class="w-full"
            :disabled="loading" autofocus @keyup.enter="restore" />
          <div v-if="error" class="text-sm text-red-600 dark:text-red-400">
            {{ error }}
          </div>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex items-center justify-end w-full gap-3">
        <UButton color="neutral" variant="ghost" :disabled="loading" @click="isOpen = false">
          Cancel
        </UButton>
        <UButton color="primary" :loading="loading" @click="restore">
          Restore Session
        </UButton>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { notify } from '~/composables/useNotificationBridge'

const isOpen = defineModel<boolean>({ required: true })

const sessionId = ref('')
const loading = ref(false)
const error = ref('')

const restore = async () => {
  if (!sessionId.value.trim()) {
    error.value = 'Please enter a session ID'
    return
  }

  error.value = ''
  loading.value = true

  try {
    const response = await $fetch<{ success: boolean }>('/api/session/restore', {
      method: 'POST',
      body: { sessionId: sessionId.value.trim() },
    })

    if (response.success) {
      notify({
        title: 'Session Restored',
        description: 'Your session has been successfully restored',
        color: 'success',
      })

      setTimeout(() => { window.location.reload() }, 500)
    }
  } catch (err: unknown) {
    console.error('Restore error:', err)
    const errorMessage = err && typeof err === 'object' && 'data' in err
      ? (err.data as { message?: string })?.message || 'Failed to restore session'
      : 'Failed to restore session. Please check your session ID.'
    error.value = errorMessage
  } finally {
    loading.value = false
  }
}

watch(isOpen, open => {
  if (open) {
    return
  }
  sessionId.value = ''
  error.value = ''
  loading.value = false
})
</script>
