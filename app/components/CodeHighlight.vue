<script setup lang="ts">
import type { BundledLanguage } from 'shiki/bundle/web'

const props = defineProps<{ code: string; language: string }>()
const colorMode = useColorMode()
const html = ref('')

onMounted(() => {
  watch([() => props.code, () => props.language, () => colorMode.value], async ([code, language, mode], _, onCleanup) => {
    let current = true
    onCleanup(() => { current = false })
    html.value = ''
    if ('text' === language) {
      return
    }
    try {
      const { codeToHtml } = await import('shiki/bundle/web')
      const result = await codeToHtml(code, { lang: language as BundledLanguage, theme: 'dark' === mode ? 'github-dark' : 'github-light' })
      if (current) {
        html.value = result
      }
    } catch (error) {
      console.warn('Could not highlight request preview:', error)
    }
  }, { immediate: true })
})
</script>

<template>
  <div class="request-code max-h-[55dvh] overflow-auto bg-default/70 text-xs">
    <div v-if="html" v-html="html" />
    <pre v-else class="p-3"><code>{{ code }}</code></pre>
  </div>
</template>

<style scoped>
.request-code :deep(pre) {
  padding: 0.75rem;
}

.request-code :deep(code) {
  font-family: var(--font-mono);
  line-height: 1.6;
}
</style>
