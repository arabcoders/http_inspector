import { VueQueryPlugin, type VueQueryPluginOptions } from '@tanstack/vue-query'

export default defineNuxtPlugin((nuxtApp) => {
  const vueQueryOptions: VueQueryPluginOptions = {
    queryClientConfig: {
      defaultOptions: {
        queries: {
          staleTime: 1000 * 30, // 30 seconds default
          refetchOnWindowFocus: false,
          retry: 1,
        },
      },
    },
  }

  nuxtApp.vueApp.use(VueQueryPlugin, vueQueryOptions)
})
