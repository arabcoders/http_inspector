import tailwindcss from "@tailwindcss/vite";

const sessionRestoreEnabled = process.env.SESSION_RESTORE_ENABLED !== 'false'

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devServer: {
    host: '0.0.0.0'
  },
  devtools: { enabled: true },
  modules: ['@nuxt/eslint', '@nuxt/test-utils', '@nuxt/ui'],
  vite: {
    plugins: [tailwindcss()]
  },
  css: ['~/assets/css/main.css'],
  postcss: {
    plugins: {
      "@tailwindcss/postcss": {},
      autoprefixer: {},
    },
  },
  runtimeConfig: {
    sessionRestoreEnabled,
    public: {
      sessionRestoreEnabled,
    },
  },
})
