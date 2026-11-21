<script setup lang="ts">
defineProps<{ title: string; description: string; icon: string }>()
const open = defineModel<boolean>('open', { required: true })

let desktop: MediaQueryList | undefined
const closeOnDesktop = () => {
  if (desktop?.matches) {
    open.value = false
  }
}
onMounted(() => {
  desktop = window.matchMedia('(min-width: 64rem)')
  desktop.addEventListener('change', closeOnDesktop)
})
onUnmounted(() => desktop?.removeEventListener('change', closeOnDesktop))
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col lg:flex-row">
    <aside :aria-label="title" class="hidden min-h-0 w-74 shrink-0 flex-col border-r border-default bg-default/35 lg:flex xl:w-82">
      <slot name="sidebar" />
    </aside>

    <div class="min-w-0 flex-1 lg:overflow-y-auto">
      <div class="mx-auto w-full max-w-7xl space-y-5 px-3 py-4 sm:px-6 sm:py-6 xl:px-8">
        <div class="lg:hidden">
          <USlideover v-model:open="open" :title="title" :description="description" side="left"
            :ui="{ body: 'flex min-h-0 flex-col p-0 sm:p-0', content: 'max-w-sm' }">
            <UButton :icon="icon" :label="title" color="neutral" variant="outline" />
            <template #body>
              <slot name="sidebar" />
            </template>
          </USlideover>
        </div>
        <slot />
      </div>
    </div>
  </div>
</template>
