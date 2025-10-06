import { defineConfig } from 'drizzle-kit'

export default defineConfig({
    schema: './server/db/schema.ts',
    out: './migrations',
    dialect: 'sqlite',
    dbCredentials: {
        url: process.env.STORAGE_PATH || './var/inspector.sqlite',
    },
})
