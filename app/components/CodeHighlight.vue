<template>
  <div class="relative">
    <div v-if="loading" class="flex h-32 items-center justify-center text-sm text-gray-500 dark:text-gray-400">
      Loading...
    </div>
    <div v-else-if="error">
      <pre class="p-4 overflow-auto"><code>{{ props.code }}</code></pre>
    </div>
    <div v-else class="overflow-auto rounded-lg text-sm" v-html="highlightedCode" />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { codeToHtml, type BundledLanguage } from 'shiki'

const props = defineProps<{ code: string, language: string, }>()

const colorMode = useColorMode()

const highlightedCode = ref('')
const loading = ref(true)
const error = ref(false)

const highlightCode = async () => {
  loading.value = true
  error.value = false

  try {
    const theme = colorMode.value === 'dark' ? 'github-dark' : 'github-light'
    const lang = (props.language as BundledLanguage) || 'text'
    highlightedCode.value = await codeToHtml(props.code, { lang, theme })
  } catch (err) {
    console.error('Failed to highlight code:', err)
    error.value = true
  } finally {
    loading.value = false
  }
}

watch([() => props.code, () => props.language, () => colorMode.value], () => highlightCode())
onMounted(() => highlightCode())
</script>

<style>
.shiki {
  padding: 1rem;
  overflow: auto;
}

.shiki>code {
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', 'Consolas', 'source-code-pro', monospace;
  font-size: 0.875rem;
  line-height: 1.5;
}
</style>
