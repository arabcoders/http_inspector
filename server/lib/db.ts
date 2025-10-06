import { getDb } from '../db/index'
import { tokens as tokensSchema, requests as requestsSchema, requestBodies as requestBodiesSchema } from '../db/schema'
import type { Token, Request, TokenWithCount } from '~~/shared/types'
import { eq, desc, sql } from 'drizzle-orm'
import { customAlphabet } from 'nanoid'
import { useFileStorage } from './file-storage'

const tokenIdGenerator = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 8)

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
export const useDatabase = () => {
  const db = getDb()
  const storage = useFileStorage()

  const tokens = {
    /**
     * Create a new token for a session
     */
    create: async (sessionId: string): Promise<Token> => {
      const id = tokenIdGenerator()
      const now = new Date()

      const token: typeof tokensSchema.$inferInsert = {
        id,
        sessionId,
        createdAt: now,
        responseEnabled: false,
        responseStatus: 200,
        responseHeaders: null,
        responseBody: null,
      }

      await db.insert(tokensSchema).values(token)

      return {
        id,
        sessionId,
        createdAt: now,
        responseEnabled: false,
        responseStatus: 200,
        responseHeaders: null,
        responseBody: null,
      }
    },

    /**
     * Get a token by ID, verifying it belongs to the session
     */
    get: async (sessionId: string, tokenId: string): Promise<Token | null> => {
      const result = await db.select().from(tokensSchema).where(eq(tokensSchema.id, tokenId)).limit(1)

      if (!result.length || result[0].sessionId !== sessionId) {
        return null
      }

      return result[0]
    },

    /**
     * List all tokens for a session with request counts
     */
    list: async (sessionId: string): Promise<TokenWithCount[]> => {
      const result = await db
        .select({
          id: tokensSchema.id,
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
     */
    update: async (
      sessionId: string,
      tokenId: string,
      updates: Partial<Pick<Token, 'responseEnabled' | 'responseStatus' | 'responseHeaders' | 'responseBody'>>
    ): Promise<Token | null> => {
      // Verify token belongs to session
      const existing = await tokens.get(sessionId, tokenId)
      if (!existing) {
        return null
      }

      await db.update(tokensSchema).set(updates).where(eq(tokensSchema.id, tokenId))

      return tokens.get(sessionId, tokenId)
    },

    /**
     * Delete a single token and its associated request bodies
     */
    _delete: async (sessionId: string, tokenId: string): Promise<void> => {
      // Verify token belongs to session before deleting
      const token = await tokens.get(sessionId, tokenId)
      if (!token) {
        return
      }

      // Delete body files from disk
      await storage.deleteToken(sessionId, tokenId)

      // Cascade delete will handle requests and request_bodies automatically
      await db.delete(tokensSchema).where(eq(tokensSchema.id, tokenId))
    },

    /**
     * Delete all tokens for a session
     */
    deleteAll: async (sessionId: string): Promise<void> => {
      // Get all tokens for this session to clean up their bodies
      const sessionTokens = await db
        .select({ id: tokensSchema.id })
        .from(tokensSchema)
        .where(eq(tokensSchema.sessionId, sessionId))

      // Delete body files for each token
      for (const token of sessionTokens) {
        await storage.deleteToken(sessionId, token.id)
      }

      // Cascade delete will handle requests and request_bodies automatically
      await db.delete(tokensSchema).where(eq(tokensSchema.sessionId, sessionId))
    },

    /**
     * Get session ID for a token (no session verification needed)
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

      const request: typeof requestsSchema.$inferInsert = {
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
        createdAt: new Date(),
      }

      const result = await db.insert(requestsSchema).values(request).returning()
      const createdRequest = result[0]

      // Save body to disk if present
      if (body && contentLength > 0) {
        const filePath = await storage.save(sessionId, tokenId, createdRequest.id, body)
        await db.insert(requestBodiesSchema).values({
          requestId: createdRequest.id,
          filePath,
          createdAt: new Date(),
        })
      }

      return createdRequest
    },

    /**
     * Get a request by ID, verifying it belongs to the session
     */
    get: async (sessionId: string, tokenId: string, requestId: number): Promise<Request | null> => {
      const result = await db
        .select()
        .from(requestsSchema)
        .where(eq(requestsSchema.id, requestId))
        .limit(1)

      if (!result.length || result[0].sessionId !== sessionId) {
        return null
      }

      return result[0]
    },

    /**
     * List all requests for a token
     */
    list: async (sessionId: string, tokenId: string): Promise<Request[]> => {
      return await db
        .select()
        .from(requestsSchema)
        .where(eq(requestsSchema.tokenId, tokenId))
        .orderBy(desc(requestsSchema.id))
    },

    /**
     * Get request body from disk (loads into memory)
     */
    getBody: async (sessionId: string, tokenId: string, requestId: number): Promise<Uint8Array | null> => {
      // First verify the request belongs to the session
      const requestCheck = await db
        .select({ sessionId: requestsSchema.sessionId })
        .from(requestsSchema)
        .where(eq(requestsSchema.id, requestId))
        .limit(1)

      if (!requestCheck.length || requestCheck[0].sessionId !== sessionId) {
        return null
      }

      // Get the file path from request_bodies table
      const bodyRecord = await db
        .select({ filePath: requestBodiesSchema.filePath })
        .from(requestBodiesSchema)
        .where(eq(requestBodiesSchema.requestId, requestId))
        .limit(1)

      if (!bodyRecord.length) {
        return null
      }

      // Read from disk
      const buffer = await storage.read(bodyRecord[0].filePath)
      return buffer ? new Uint8Array(buffer) : null
    },

    /**
     * Get request body as a stream for efficient large file handling
     */
    streamBody: async (sessionId: string, tokenId: string, requestId: number) => {
      // First verify the request belongs to the session
      const requestCheck = await db
        .select({ sessionId: requestsSchema.sessionId })
        .from(requestsSchema)
        .where(eq(requestsSchema.id, requestId))
        .limit(1)

      if (!requestCheck.length || requestCheck[0].sessionId !== sessionId) {
        return null
      }

      // Get the file path from request_bodies table
      const bodyRecord = await db
        .select({ filePath: requestBodiesSchema.filePath })
        .from(requestBodiesSchema)
        .where(eq(requestBodiesSchema.requestId, requestId))
        .limit(1)

      if (!bodyRecord.length) {
        return null
      }

      // Create stream
      const stream = storage.stream(bodyRecord[0].filePath)
      if (!stream) {
        return null
      }

      return {
        stream,
        filePath: bodyRecord[0].filePath,
      }
    },

    /**
     * Delete a single request and its body
     */
    _delete: async (sessionId: string, tokenId: string, requestId: number): Promise<void> => {
      // Verify request belongs to session
      const request = await requests.get(sessionId, tokenId, requestId)
      if (!request) {
        return
      }

      // Get body file path if exists
      const bodyRecord = await db
        .select({ filePath: requestBodiesSchema.filePath })
        .from(requestBodiesSchema)
        .where(eq(requestBodiesSchema.requestId, requestId))
        .limit(1)

      if (bodyRecord.length) {
        await storage.delete(bodyRecord[0].filePath)
      }

      // Cascade delete will handle request_bodies automatically
      await db.delete(requestsSchema).where(eq(requestsSchema.id, requestId))
    },

    /**
     * Delete all requests for a token
     */
    deleteAll: async (sessionId: string, tokenId: string): Promise<number> => {
      // Get all request IDs to clean up their body files
      const requestsToDelete = await db
        .select({ id: requestsSchema.id })
        .from(requestsSchema)
        .where(eq(requestsSchema.tokenId, tokenId))

      // Delete body files
      for (const req of requestsToDelete) {
        const bodyRecord = await db
          .select({ filePath: requestBodiesSchema.filePath })
          .from(requestBodiesSchema)
          .where(eq(requestBodiesSchema.requestId, req.id))
          .limit(1)

        if (bodyRecord.length) {
          await storage.delete(bodyRecord[0].filePath)
        }
      }

      // Cascade delete will handle request_bodies automatically
      const result = await db
        .delete(requestsSchema)
        .where(eq(requestsSchema.tokenId, tokenId))
        .returning({ id: requestsSchema.id })

      return result.length
    },
  }

  return {
    tokens,
    requests,
  }
}
