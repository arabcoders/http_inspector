const sessionRestoreEnabled = process.env.SESSION_RESTORE_ENABLED !== 'false'
const llmEndpointEnabled = process.env.ENABLE_LLM_ENDPOINT === 'true'

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devServer: {
    host: '0.0.0.0'
  },
  devtools: { enabled: true },
  modules: ['@nuxt/eslint', '@nuxt/ui'],
  app: {
    head: {
      link: [
        { rel: 'icon', type: 'image/png', href: '/favicon-96x96.png', sizes: '96x96' },
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'shortcut icon', href: '/favicon.ico' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png', sizes: '180x180' },
        { rel: 'manifest', href: '/site.webmanifest' },
      ],
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'apple-mobile-web-app-title', content: 'HTTP Inspector' },
      ],
    },
  },
  css: ['~/assets/css/main.css'],
  runtimeConfig: {
    sessionRestoreEnabled,
    llmEndpointEnabled,
    public: {
      sessionRestoreEnabled,
      llmEndpointEnabled,
    },
  },

  spaLoadingTemplate: 'spa-loading-template.html',
})
