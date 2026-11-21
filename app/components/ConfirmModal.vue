<script setup lang="ts">
withDefaults(defineProps<{
  title: string
  description: string
  confirmLabel?: string
  loading?: boolean
}>(), { confirmLabel: 'Confirm', loading: false })
defineEmits<{ confirm: [] }>()
const open = defineModel<boolean>({ required: true })
</script>

<template>
  <UModal v-model:open="open" :title="title" :description="description" :dismissible="!loading" :close="!loading">
    <template #footer>
      <UButton color="error" icon="i-lucide-trash-2" :label="confirmLabel" :loading="loading" @click="$emit('confirm')" />
    </template>
  </UModal>
</template>
