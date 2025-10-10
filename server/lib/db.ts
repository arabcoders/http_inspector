import { getDb } from '../db/index'
import { tokens as tokensSchema, requests as requestsSchema } from '../db/schema'
import type { Token, Request, TokenWithCount } from '~~/shared/types'
import { eq, and, desc, sql } from 'drizzle-orm'
import { useFileStorage } from './file-storage'
import { randomUUID, randomBytes } from 'crypto'

const SAFE_FRIENDLY_ID = /[A-Za-z0-9]/g

const detectBinary = (buffer: Buffer, contentType: string): boolean => {
  if (contentType) {
    const type = contentType.toLowerCase()
    if (
      type.includes('image/') ||
      type.includes('video/') ||
      type.includes('audio/') ||
      type.includes('application/octet-stream') ||
      type.includes('application/pdf') ||
      type.includes('application/zip')
    ) {
      return true
    }
  }

  for (let i = 0; i < Math.min(buffer.length, 8000); i++) {
    if (0 === buffer[i]) {
      return true
    }
  }

  return false
}

/**
 * Database operations composable
 * Provides organized access to all database operations grouped by entity
 */
export const useDatabase = (dbFile?: string, filesPath?: string) => {
  const db = getDb(dbFile)
  const storage = useFileStorage(filesPath)

  /**
   * Try to generate a unique short ID for friendlyId fields
   * Falls back to UUID if collisions persist
   * 
   * @returns A unique short ID string, or a longer unique ID as fallback.
   */
  const generateUniqueShortId = async (): Promise<string> => {
    for (let i = 0; i < 100; i++) {
      const raw = randomBytes(12).toString('base64')
      const id = (raw.match(SAFE_FRIENDLY_ID)?.join('') ?? '').slice(0, 8)
      if (id.length < 8) {
        continue
      }
      const exists = await db.select().from(tokensSchema).where(eq(tokensSchema.friendlyId, id)).limit(1)
      if (!exists.length) {
        return id
      }
    }

    for (let i = 0; i < 100; i++) {
      const raw = randomBytes(16).toString('base64')
      const id = (raw.match(SAFE_FRIENDLY_ID)?.join('') ?? '').slice(0, 10)
      if (id.length < 10) {
        continue
      }
      const exists = await db.select().from(tokensSchema).where(eq(tokensSchema.friendlyId, id)).limit(1)
      if (!exists.length) {
        return id
      }
    }

    const raw = randomBytes(32).toString('base64')
    return (raw.match(SAFE_FRIENDLY_ID)?.join('') ?? '').slice(0, 22)
  }


  const tokens = {
    /**
     * Create a new token for a session
     * 
     * @param sessionId The session ID.
     * 
     * @returns The created token.
     */
    create: async (sessionId: string): Promise<Token> => {
      const friendlyId = await generateUniqueShortId()
      const id = randomUUID()
      const createdAt = new Date()

      const tokenData: typeof tokensSchema.$inferInsert = {
        id,
        friendlyId,
        sessionId,
        createdAt,
        responseEnabled: false,
        responseStatus: 200,
        responseHeaders: null,
        responseBody: null,
      }

      await db.insert(tokensSchema).values(tokenData)

      return {
        id,
        friendlyId,
        sessionId,
        createdAt,
        responseEnabled: false,
        responseStatus: 200,
        responseHeaders: null,
        responseBody: null,
      }
    },

    /**
     * Get a token by friendly ID
     * 
     * @param friendlyId The friendly ID.
     * 
     * @returns The token if found and belongs to the session, otherwise null.
     */
    getByFriendlyId: async (friendlyId: string): Promise<Token | null> => {
      const result = await db.select().from(tokensSchema).where(eq(tokensSchema.friendlyId, friendlyId)).limit(1)
      return !result.length ? null : result[0]
    },

    /**
     * Get a token by ID
     * 
     * @param sessionId Session ID.
     * @param tokenId Token ID.
     * 
     * @returns The token if found, null otherwise.
     */
    get: async (sessionId: string, tokenId: string): Promise<Token | null> => {
      const result = await db.select().from(tokensSchema).where(
        and(
          eq(tokensSchema.sessionId, sessionId),
          eq(tokensSchema.id, tokenId)
        )).limit(1)

      if (!result.length) {
        return null
      }

      return result[0]
    },

    /**
     * List all tokens for a session with request counts
     * 
     * @param sessionId The session ID to list tokens for.
     * 
     * @returns Array of tokens with request counts.
     */
    list: async (sessionId: string): Promise<TokenWithCount[]> => {
      const result = await db
        .select({
          id: tokensSchema.id,
          friendlyId: tokensSchema.friendlyId,
          sessionId: tokensSchema.sessionId,
          createdAt: tokensSchema.createdAt,
          responseEnabled: tokensSchema.responseEnabled,
          responseStatus: tokensSchema.responseStatus,
          responseHeaders: tokensSchema.responseHeaders,
          responseBody: tokensSchema.responseBody,
          requestCount: sql<number>`count(${requestsSchema.id})`,
        })
        .from(tokensSchema)
        .leftJoin(requestsSchema, eq(requestsSchema.tokenId, tokensSchema.id))
        .where(eq(tokensSchema.sessionId, sessionId))
        .groupBy(tokensSchema.id)
        .orderBy(desc(tokensSchema.createdAt))

      return result.map(row => ({
        id: row.id,
        friendlyId: row.friendlyId,
        sessionId: row.sessionId,
        createdAt: row.createdAt,
        responseEnabled: row.responseEnabled,
        responseStatus: row.responseStatus,
        responseHeaders: row.responseHeaders,
        responseBody: row.responseBody,
        _count: { requests: row.requestCount },
      }))
    },

    /**
     * Update token settings
     * 
     * @param sessionId The session ID to verify ownership
     * @param tokenId The ID of the token to update.
     * @param updates Partial fields to update on the token.
     * 
     * @returns The updated token, or null if not found or doesn't belong to session.
     */
    update: async (
      sessionId: string,
      tokenId: string,
      updates: Partial<Pick<Token, 'responseEnabled' | 'responseStatus' | 'responseHeaders' | 'responseBody'>>
    ): Promise<Token | null> => {
      const existing = await tokens.get(sessionId, tokenId)
      if (!existing) {
        return null
      }

      await db.update(tokensSchema).set(updates).where(and(
        eq(tokensSchema.id, tokenId),
        eq(tokensSchema.sessionId, sessionId),
      ))

      return tokens.get(sessionId, tokenId)
    },

    /**
     * Delete a single token and its associated requests.
     * 
     * @param sessionId Session ID.
     * @param tokenId Token ID.
     */
    _delete: async (sessionId: string, tokenId: string): Promise<void> => {
      const token = await tokens.get(sessionId, tokenId)
      if (!token) {
        return
      }

      await storage.deleteToken(sessionId, token.id)
      await db.delete(tokensSchema).where(eq(tokensSchema.id, tokenId))
    },

    /**
     * Delete all tokens for a session.
     * 
     * @param sessionId The session ID.
     */
    deleteAll: async (sessionId: string): Promise<void> => {
      const sessionTokens = await db
        .select({ id: tokensSchema.id })
        .from(tokensSchema)
        .where(eq(tokensSchema.sessionId, sessionId))

      for (const token of sessionTokens) {
        await storage.deleteToken(sessionId, token.id)
      }

      await db.delete(tokensSchema).where(eq(tokensSchema.sessionId, sessionId))
    },

    /**
     * Get session ID for a given token ID.
     * 
     * @param tokenId Token ID.
     * 
     * @returns The session ID if found, otherwise null.
     */
    getSessionId: async (tokenId: string): Promise<string | null> => {
      const result = await db
        .select({ sessionId: tokensSchema.sessionId })
        .from(tokensSchema)
        .where(eq(tokensSchema.id, tokenId))
        .limit(1)

      return result.length ? result[0].sessionId : null
    },
  }

  const requests = {
    /**
     * Create a new request and save its body to disk
     * 
     * @param sessionId The session ID the request belongs to
     * @param tokenId The token ID the request belongs to
     * @param method HTTP method of the request
     * @param headers HTTP headers of the request
     * @param body Optional body buffer of the request
     * @param url Full URL of the request
     * @param clientIp Client IP address
     * @param remoteIp Remote IP address
     * 
     * @returns The created request record.
     */
    create: async (
      sessionId: string,
      tokenId: string,
      method: string,
      headers: Record<string, string>,
      body: Buffer | null,
      url: string,
      clientIp: string,
      remoteIp: string,
    ): Promise<Request> => {
      const contentType = headers['content-type'] || headers['Content-Type'] || 'application/octet-stream'
      const contentLength = body ? body.length : 0
      const isBinary = body ? detectBinary(body, contentType) : false

      const id = randomUUID()
      let bodyPath: string | null = null

      if (body && contentLength > 0) {
        bodyPath = await storage.save(sessionId, tokenId, id, body)
      }

      const dat = {
        id,
        tokenId,
        sessionId,
        method,
        headers: JSON.stringify(headers),
        url,
        contentType,
        contentLength,
        isBinary,
        clientIp,
        remoteIp,
        bodyPath,
        createdAt: new Date(),
      }
      const request: typeof requestsSchema.$inferInsert = dat

      const result = await db.insert(requestsSchema).values(request).returning()
      return result[0]
    },

    /**
     * Get request.
     * 
     * @param sessionId Session ID.
     * @param tokenId Token ID.
     * @param requestId Request ID.
     * 
     * @returns The request if found, null otherwise.
     */
    get: async (sessionId: string, tokenId: string, requestId: string): Promise<Request | null> => {
      const result = await db.select().from(requestsSchema).where(and(
        eq(requestsSchema.id, requestId),
        eq(requestsSchema.tokenId, tokenId),
        eq(requestsSchema.sessionId, sessionId)
      )).limit(1)

      return !result.length ? null : result[0]
    },

    /**
     * List all requests for a token
     * 
     * @param sessionId Session ID.
     * @param tokenId Token ID.
     * 
     * @returns Array of requests.
     */
    list: async (sessionId: string, tokenId: string): Promise<Request[]> => {
      return await db.select().from(requestsSchema).where(and(
        eq(requestsSchema.tokenId, tokenId),
        eq(requestsSchema.sessionId, sessionId)
      )).orderBy(desc(requestsSchema.createdAt))
    },

    /**
     * Get request body.
     * 
     * @param sessionId Session ID.
     * @param tokenId Token ID.
     * @param requestId Request ID.
     * 
     * @returns The body as Uint8Array if found, null otherwise.
     */
    getBody: async (sessionId: string, tokenId: string, requestId: string): Promise<Uint8Array | null> => {
      const request = await db.select().from(requestsSchema).where(and(
        eq(requestsSchema.id, requestId),
        eq(requestsSchema.tokenId, tokenId),
        eq(requestsSchema.sessionId, sessionId))
      ).limit(1)

      if (!request.length || !request[0].bodyPath) {
        return null
      }

      const buffer = await storage.read(request[0].bodyPath)
      return buffer ? new Uint8Array(buffer) : null
    },

    /**
     * Stream request body from disk.
     * 
     * @param sessionId Session ID.
     * @param tokenId Token ID.
     * @param requestId Request ID.
     * 
     * @returns Readable stream and file path if found, null otherwise.
     */
    streamBody: async (sessionId: string, tokenId: string, requestId: string) => {
      const request = await db.select().from(requestsSchema).where(and(
        eq(requestsSchema.id, requestId),
        eq(requestsSchema.tokenId, tokenId),
        eq(requestsSchema.sessionId, sessionId)
      )).limit(1)

      if (!request.length || !request[0].bodyPath) {
        return null
      }

      const stream = storage.stream(request[0].bodyPath)
      return !stream ? null : { stream, filePath: request[0].bodyPath }
    },

    /**
     * Delete a single request and its body
     * 
     * @param sessionId Session ID
     * @param tokenId Token ID
     * @param requestId Request ID
     */
    _delete: async (sessionId: string, tokenId: string, requestId: string): Promise<void> => {
      const request = await requests.get(sessionId, tokenId, requestId)
      if (!request) {
        return
      }

      if (request.bodyPath) {
        await storage.delete(request.bodyPath)
      }

      await db.delete(requestsSchema).where(eq(requestsSchema.id, requestId))
    },

    /**
     * Delete all requests for a token
     * 
     * @param sessionId Session ID
     * @param tokenId Token ID
     * 
     * @returns Number of deleted requests
     */
    deleteAll: async (sessionId: string, tokenId: string): Promise<number> => {
      const requestsToDelete = await db
        .select({ id: requestsSchema.id, bodyPath: requestsSchema.bodyPath })
        .from(requestsSchema).where(and(
          eq(requestsSchema.tokenId, tokenId),
          eq(requestsSchema.sessionId, sessionId),
        ))

      for (const req of requestsToDelete) {
        if (!req.bodyPath) {
          continue
        }
        await storage.delete(req.bodyPath)
      }

      const result = await db.delete(requestsSchema).where(and(
        eq(requestsSchema.tokenId, tokenId),
        eq(requestsSchema.sessionId, sessionId),
      )).returning({ id: requestsSchema.id })

      return result.length
    },
  }

  return { tokens, requests }
}
