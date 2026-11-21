<script setup lang="ts">
defineProps<{ title: string; section: string; description?: string; icon: string }>()
</script>

<template>
  <div class="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
    <div class="flex min-w-0 items-start gap-3">
      <span class="inspector-section-icon hidden sm:inline-flex">
        <UIcon :name="icon" class="size-5" aria-hidden="true" />
      </span>
      <div class="min-w-0 space-y-1">
        <p class="text-xs font-medium text-muted">{{ section }}</p>
        <h1 class="text-2xl font-semibold wrap-anywhere tracking-tight text-highlighted sm:text-3xl">{{ title }}</h1>
        <p v-if="description" class="max-w-3xl text-sm text-toned">{{ description }}</p>
      </div>
    </div>
    <div v-if="$slots.actions" class="flex flex-wrap items-center gap-2">
      <slot name="actions" />
    </div>
  </div>
</template>
