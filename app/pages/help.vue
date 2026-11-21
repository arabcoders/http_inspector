<script setup lang="ts">
import { marked } from 'marked'
import readme from '../../README.md?raw'

useHead({ title: 'Documentation' })
// This is the repository's bundled README, not captured request data.
const html = marked.parse(readme.replace(/^# HTTP Inspector\r?\n/, ''), { async: false, gfm: true })
</script>

<template>
  <div class="flex-1 lg:overflow-y-auto">
    <div class="mx-auto max-w-5xl space-y-6 px-3 py-5 sm:px-6 sm:py-8">
      <PageHeader title="Documentation" section="HTTP Inspector" icon="i-lucide-book-open">
        <template #actions>
          <UButton to="/" icon="i-lucide-arrow-left" color="neutral" variant="outline" label="Back to workspace" />
        </template>
      </PageHeader>
      <UCard>
        <article class="inspector-prose" v-html="html" />
      </UCard>
    </div>
  </div>
</template>
