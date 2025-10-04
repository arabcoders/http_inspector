<template>
    <UApp class="min-h-screen bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 antialiased">
        <NuxtLoadingIndicator />
        <Header />
        <main class="px-4 sm:px-6 lg:px-8 py-8">
            <NuxtPage />
        </main>
    </UApp>
</template>

<script setup lang="ts">
import Header from '~/components/Header.vue'
useHead({ titleTemplate: title => (title ? `${title} - HTTP Inspector` : 'HTTP Inspector') })
</script>
