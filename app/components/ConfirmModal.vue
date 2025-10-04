<template>
  <UModal v-model:open="isOpen">
    <template #header>
      <div class="flex items-center justify-between w-full">
        <h3 class="text-lg font-semibold">{{ title }}</h3>
        <UButton color="neutral" variant="ghost" icon="i-lucide-x" size="sm" class="-my-1" @click="handleCancel" />
      </div>
    </template>

    <template #body>
      <p class="text-sm text-gray-600 dark:text-gray-400">
        {{ description }}
      </p>
    </template>

    <template #footer>
      <div class="flex items-center justify-end w-full gap-3">
        <UButton color="neutral" variant="ghost" label="Cancel" :disabled="loading" @click="handleCancel" />
        <UButton :color="confirmColor" :label="confirmLabel" :loading="loading" @click="handleConfirm" />
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  modelValue: boolean
  title: string
  description: string
  confirmLabel?: string
  confirmColor?: 'primary' | 'error' | 'success' | 'warning' | 'info' | 'neutral'
  loading?: boolean
}>(), {
  confirmLabel: 'Confirm',
  confirmColor: 'error',
  loading: false,
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'confirm' | 'cancel'): void
}>()

const isOpen = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

const handleConfirm = () => emit('confirm')
const handleCancel = () => {
  emit('cancel')
  emit('update:modelValue', false)
}
</script>
