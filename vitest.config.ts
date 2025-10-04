import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const rootDir = fileURLToPath(new URL('./', import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '~~': rootDir,
      '@@': rootDir,
      '~': resolve(rootDir, 'app'),
      '@': resolve(rootDir, 'app'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.spec.ts']
  }
})
