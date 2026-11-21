<script setup lang="ts">
useHead({ titleTemplate: title => title ? `${title} · HTTP Inspector` : 'HTTP Inspector' })
</script>

<template>
  <UApp :toaster="{ max: 3, expand: false }">
    <NuxtLoadingIndicator />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
