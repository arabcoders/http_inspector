import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

export const sessions = sqliteTable('sessions', {
    id: text('id').primaryKey(), // UUID - internal primary key, also used for cookies
    friendlyId: text('friendly_id').notNull().unique(), // User-visible friendly ID
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
    lastAccessedAt: integer('last_accessed_at', { mode: 'timestamp' }).notNull(),
}, (table) => [
    index('friendly_id_idx').on(table.friendlyId),
    index('last_accessed_idx').on(table.lastAccessedAt), // For cleanup based on TTL
])

export const tokens = sqliteTable('tokens', {
    id: text('id').primaryKey(), // UUID - primary key used for all operations
    token: text('token').notNull().unique(), // DEPRECATED: 8-char display string, kept for data compatibility
    sessionId: text('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
    responseEnabled: integer('response_enabled', { mode: 'boolean' }).notNull().default(false),
    responseStatus: integer('response_status').notNull().default(200),
    responseHeaders: text('response_headers'),
    responseBody: text('response_body'),
}, (table) => [
    index('token_id_idx').on(table.id), // Primary lookup by ID
    index('token_session_idx').on(table.sessionId),
    index('token_created_idx').on(table.createdAt), // For cleanup based on TTL
])

export const requests = sqliteTable('requests', {
    id: text('id').primaryKey(), // UUID - internal primary key
    tokenId: text('token_id').notNull().references(() => tokens.id, { onDelete: 'cascade' }),
    sessionId: text('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
    method: text('method').notNull(),
    url: text('url').notNull(),
    headers: text('headers').notNull(), // JSON string
    contentType: text('content_type').notNull(),
    contentLength: integer('content_length').notNull().default(0),
    isBinary: integer('is_binary', { mode: 'boolean' }).notNull(),
    clientIp: text('client_ip').notNull(),
    remoteIp: text('remote_ip').notNull(),
    bodyPath: text('body_path'), // Relative path to body file (nullable)
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (table) => [
    index('request_token_idx').on(table.tokenId),
    index('request_session_idx').on(table.sessionId),
    index('request_created_idx').on(table.createdAt), // For cleanup based on TTL
])

export const keyValueStore = sqliteTable('key_value_store', {
    key: text('key').primaryKey(),
    value: text('value').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
})
