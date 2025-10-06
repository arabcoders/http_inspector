import { getDb } from '../db/index'
import { tokens, requests, type Token, type Request } from '../db/schema'
import { eq, desc, sql } from 'drizzle-orm'
import { customAlphabet } from 'nanoid'

const tokenIdGenerator = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 8)

export type TokenWithCount = Token & { _count?: { requests: number } }
export type { Token, Request }

export const createToken = async (sessionId: string): Promise<Token> => {
  const db = getDb()
  const id = tokenIdGenerator()
  const now = new Date()

  const token: typeof tokens.$inferInsert = {
    id,
    sessionId,
    createdAt: now,
    responseEnabled: false,
    responseStatus: 200,
    responseHeaders: null,
    responseBody: null,
  }

  await db.insert(tokens).values(token)

  return {
    id,
    sessionId,
    createdAt: now,
    responseEnabled: false,
    responseStatus: 200,
    responseHeaders: null,
    responseBody: null,
  }
}

export const getToken = async (sessionId: string, tokenId: string): Promise<Token | null> => {
  const db = getDb()

  const result = await db.select().from(tokens).where(eq(tokens.id, tokenId)).limit(1)

  if (!result.length || result[0].sessionId !== sessionId) {
    return null
  }

  return result[0]
}

export const getUserTokens = async (sessionId: string): Promise<TokenWithCount[]> => {
  const db = getDb()

  const result = await db
    .select({
      id: tokens.id,
      sessionId: tokens.sessionId,
      createdAt: tokens.createdAt,
      responseEnabled: tokens.responseEnabled,
      responseStatus: tokens.responseStatus,
      responseHeaders: tokens.responseHeaders,
      responseBody: tokens.responseBody,
      requestCount: sql<number>`count(${requests.id})`,
    })
    .from(tokens)
    .leftJoin(requests, eq(requests.tokenId, tokens.id))
    .where(eq(tokens.sessionId, sessionId))
    .groupBy(tokens.id)
    .orderBy(desc(tokens.createdAt))

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
}

export const updateToken = async (
  sessionId: string,
  tokenId: string,
  updates: Partial<Pick<Token, 'responseEnabled' | 'responseStatus' | 'responseHeaders' | 'responseBody'>>
): Promise<Token | null> => {
  const db = getDb()

  // Verify token belongs to session
  const existing = await getToken(sessionId, tokenId)
  if (!existing) {
    return null
  }

  await db.update(tokens).set(updates).where(eq(tokens.id, tokenId))

  return getToken(sessionId, tokenId)
}

export const deleteToken = async (sessionId: string, tokenId: string): Promise<void> => {
  const db = getDb()

  // Verify token belongs to session before deleting
  const token = await getToken(sessionId, tokenId)
  if (!token) {
    return
  }

  // Cascade delete will handle requests automatically
  await db.delete(tokens).where(eq(tokens.id, tokenId))
}

export const deleteAllTokens = async (sessionId: string): Promise<void> => {
  const db = getDb()

  // Cascade delete will handle requests automatically
  await db.delete(tokens).where(eq(tokens.sessionId, sessionId))
}

// ============================================================================
// Request Operations
// ============================================================================

export const insertRequest = async (
  sessionId: string,
  tokenId: string,
  method: string,
  headers: Record<string, string>,
  body: Buffer | null,
  url: string,
  clientIp: string,
  remoteIp: string,
): Promise<Request> => {
  const db = getDb()

  const contentType = headers['content-type'] || headers['Content-Type'] || 'application/octet-stream'
  const contentLength = body ? body.length : 0
  const isBinary = body ? detectBinary(body, contentType) : false

  const request: typeof requests.$inferInsert = {
    tokenId,
    sessionId,
    method,
    headers: JSON.stringify(headers),
    url,
    body: body || null,
    contentType,
    contentLength,
    isBinary,
    clientIp,
    remoteIp,
    createdAt: new Date(),
  }

  const result = await db.insert(requests).values(request).returning()

  return result[0]
}

export const getRequest = async (sessionId: string, tokenId: string, requestId: number): Promise<Request | null> => {
  const db = getDb()

  const result = await db
    .select({
      id: requests.id,
      tokenId: requests.tokenId,
      sessionId: requests.sessionId,
      method: requests.method,
      headers: requests.headers,
      url: requests.url,
      body: sql<null>`NULL`, // Don't fetch body by default
      contentType: requests.contentType,
      contentLength: requests.contentLength,
      isBinary: requests.isBinary,
      clientIp: requests.clientIp,
      remoteIp: requests.remoteIp,
      createdAt: requests.createdAt,
    })
    .from(requests)
    .where(eq(requests.id, requestId))
    .limit(1)

  if (!result.length || result[0].sessionId !== sessionId) {
    return null
  }

  return result[0]
}

export const getRequestBody = async (sessionId: string, tokenId: string, requestId: number): Promise<Uint8Array | null> => {
  const db = getDb()

  const result = await db
    .select({ body: requests.body })
    .from(requests)
    .where(eq(requests.id, requestId))
    .limit(1)

  if (!result.length) {
    return null
  }

  return result[0].body ? new Uint8Array(result[0].body) : null
}

export const getRequestFull = async (sessionId: string, tokenId: string, requestId: number): Promise<Request | null> => {
  const db = getDb()

  const result = await db
    .select()
    .from(requests)
    .where(eq(requests.id, requestId))
    .limit(1)

  if (!result.length || result[0].sessionId !== sessionId) {
    return null
  }

  return result[0]
}

export const getTokenRequests = async (sessionId: string, tokenId: string): Promise<Request[]> => {
  const db = getDb()

  const result = await db
    .select({
      id: requests.id,
      tokenId: requests.tokenId,
      sessionId: requests.sessionId,
      method: requests.method,
      headers: requests.headers,
      url: requests.url,
      body: sql<null>`NULL`, // Don't fetch body for list
      contentType: requests.contentType,
      contentLength: requests.contentLength,
      isBinary: requests.isBinary,
      clientIp: requests.clientIp,
      remoteIp: requests.remoteIp,
      createdAt: requests.createdAt,
    })
    .from(requests)
    .where(eq(requests.tokenId, tokenId))
    .orderBy(desc(requests.id))

  return result
}

export const deleteRequest = async (sessionId: string, tokenId: string, requestId: number): Promise<void> => {
  const db = getDb()

  // Verify request belongs to session
  const request = await getRequest(sessionId, tokenId, requestId)
  if (!request) {
    return
  }

  await db.delete(requests).where(eq(requests.id, requestId))
}

export const deleteAllRequests = async (sessionId: string, tokenId: string): Promise<number> => {
  const db = getDb()

  const result = await db
    .delete(requests)
    .where(eq(requests.tokenId, tokenId))
    .returning({ id: requests.id })

  return result.length
}

export const getSessionIdForToken = async (tokenId: string): Promise<string | null> => {
  const db = getDb()

  const result = await db
    .select({ sessionId: tokens.sessionId })
    .from(tokens)
    .where(eq(tokens.id, tokenId))
    .limit(1)

  return result.length ? result[0].sessionId : null
}

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
