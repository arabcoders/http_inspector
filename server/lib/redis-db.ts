import { getRedisClient, KEYS, TTL } from './redis'
import { customAlphabet } from 'nanoid'

const tokenIdGenerator = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 8)

export type Token = {
  id: string
  sessionId: string
  createdAt: string
  responseEnabled: boolean
  responseStatus: number
  responseHeaders: string | null
  responseBody: string | null
  _count?: { requests: number }
}

export type Request = {
  id: number
  tokenId: string
  sessionId: string
  method: string
  headers: string
  url: string
  body: Uint8Array | null
  contentType: string
  isBinary: boolean
  clientIp: string
  remoteIp: string
  createdAt: string
}

export const createToken = async (sessionId: string): Promise<Token> => {
  const redis = getRedisClient()
  const id = tokenIdGenerator()
  const createdAt = new Date().toISOString()

  const token: Token = {
    id,
    sessionId,
    createdAt,
    responseEnabled: false,
    responseStatus: 200,
    responseHeaders: null,
    responseBody: null,
  }

  await Promise.all([
    redis.hset(KEYS.token(sessionId, id), {
      id,
      sessionId,
      createdAt,
      responseEnabled: '0',
      responseStatus: '200',
      responseHeaders: '',
      responseBody: '',
    }),
    redis.sadd(KEYS.userTokens(sessionId), id),
    redis.setex(KEYS.tokenLookup(id), TTL.TOKEN, sessionId),
  ])
  await redis.expire(KEYS.token(sessionId, id), TTL.TOKEN)

  return token
}

export const getToken = async (sessionId: string, tokenId: string): Promise<Token | null> => {
  const redis = getRedisClient()
  const data = await redis.hgetall(KEYS.token(sessionId, tokenId))

  if (!data.id) {
    return null
  }

  return {
    id: data.id,
    sessionId: data.sessionId,
    createdAt: data.createdAt,
    responseEnabled: data.responseEnabled === '1',
    responseStatus: parseInt(data.responseStatus || '200'),
    responseHeaders: data.responseHeaders || null,
    responseBody: data.responseBody || null,
  }
}

export const getUserTokens = async (sessionId: string): Promise<Token[]> => {
  const redis = getRedisClient()
  const tokenIds = await redis.smembers(KEYS.userTokens(sessionId))

  if (!tokenIds.length) {
    return []
  }

  const tokens: Token[] = []

  for (const tokenId of tokenIds) {
    const token = await getToken(sessionId, tokenId)
    if (token) {
      const requestCount = await redis.scard(KEYS.tokenRequests(sessionId, tokenId))
      token._count = { requests: requestCount }
      tokens.push(token)
    }
  }

  return tokens
}

export const updateToken = async (
  sessionId: string,
  tokenId: string,
  updates: Partial<Pick<Token, 'responseEnabled' | 'responseStatus' | 'responseHeaders' | 'responseBody'>>
): Promise<Token | null> => {
  const redis = getRedisClient()
  const token = await getToken(sessionId, tokenId)

  if (!token) {
    return null
  }

  const updateData: Record<string, string> = {}

  if (undefined !== updates.responseEnabled) {
    updateData.responseEnabled = updates.responseEnabled ? '1' : '0'
  }
  if (undefined !== updates.responseStatus) {
    updateData.responseStatus = String(updates.responseStatus)
  }
  if (undefined !== updates.responseHeaders) {
    updateData.responseHeaders = updates.responseHeaders || ''
  }
  if (undefined !== updates.responseBody) {
    updateData.responseBody = updates.responseBody || ''
  }

  await redis.hset(KEYS.token(sessionId, tokenId), updateData)
  await redis.expire(KEYS.token(sessionId, tokenId), TTL.TOKEN)

  return getToken(sessionId, tokenId)
}

export const deleteToken = async (sessionId: string, tokenId: string): Promise<void> => {
  const redis = getRedisClient()

  const requestIds = await redis.smembers(KEYS.tokenRequests(sessionId, tokenId))

  for (const requestId of requestIds) {
    await Promise.all([
      redis.del(KEYS.request(sessionId, tokenId, parseInt(requestId))),
      redis.del(KEYS.requestBody(sessionId, tokenId, parseInt(requestId)))
    ])
  }

  // Delete token data
  await Promise.all([
    redis.del(KEYS.token(sessionId, tokenId)),
    redis.del(KEYS.tokenRequests(sessionId, tokenId)),
    redis.del(KEYS.requestCounter(sessionId, tokenId)),
    redis.del(KEYS.tokenLookup(tokenId)),
    redis.srem(KEYS.userTokens(sessionId), tokenId)
  ])
}

export const deleteAllTokens = async (sessionId: string): Promise<void> => {
  const redis = getRedisClient()
  const tokenIds = await redis.smembers(KEYS.userTokens(sessionId))

  for (const tokenId of tokenIds) {
    await deleteToken(sessionId, tokenId)
  }
}

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
  const redis = getRedisClient()

  const requestId = await redis.incr(KEYS.requestCounter(sessionId, tokenId))
  const now = new Date().toISOString()

  const contentType = headers['content-type'] || headers['Content-Type'] || 'application/octet-stream'
  const isBinary = body ? detectBinary(body, contentType) : false

  const request: Request = {
    id: requestId,
    tokenId,
    sessionId,
    method,
    headers: JSON.stringify(headers),
    url,
    body: body ? new Uint8Array(body) : null,
    contentType,
    isBinary,
    clientIp,
    remoteIp,
    createdAt: now,
  }

  await redis.hset(KEYS.request(sessionId, tokenId, requestId), {
    id: String(requestId),
    tokenId,
    sessionId,
    method,
    headers: JSON.stringify(headers),
    url,
    contentType,
    isBinary: isBinary ? '1' : '0',
    clientIp,
    remoteIp,
    createdAt: now,
  })

  if (body) {
    await redis.setex(
      KEYS.requestBody(sessionId, tokenId, requestId),
      TTL.REQUEST,
      body
    )
  }

  await redis.sadd(KEYS.tokenRequests(sessionId, tokenId), String(requestId))
  await redis.expire(KEYS.request(sessionId, tokenId, requestId), TTL.REQUEST)

  return request
}

export const getRequest = async (sessionId: string, tokenId: string, requestId: number): Promise<Request | null> => {
  const redis = getRedisClient()
  const data = await redis.hgetall(KEYS.request(sessionId, tokenId, requestId))

  if (!data.id) {
    return null
  }

  return {
    id: parseInt(data.id),
    tokenId: data.tokenId,
    sessionId: data.sessionId,
    method: data.method,
    headers: data.headers,
    url: data.url,
    body: null, // Body is fetched separately
    contentType: data.contentType,
    isBinary: data.isBinary === '1',
    clientIp: data.clientIp,
    remoteIp: data.remoteIp,
    createdAt: data.createdAt,
  }
}

export const getRequestBody = async (sessionId: string, tokenId: string, requestId: number): Promise<Uint8Array | null> => {
  const redis = getRedisClient()
  const bodyBuffer = await redis.getBuffer(KEYS.requestBody(sessionId, tokenId, requestId))
  return bodyBuffer ? new Uint8Array(bodyBuffer) : null
}

export const getRequestFull = async (sessionId: string, tokenId: string, requestId: number): Promise<Request | null> => {
  const redis = getRedisClient()
  const request = await getRequest(sessionId, tokenId, requestId)

  if (!request) {
    return null
  }

  const bodyBuffer = await redis.getBuffer(KEYS.requestBody(sessionId, tokenId, requestId))
  request.body = bodyBuffer ? new Uint8Array(bodyBuffer) : null

  return request
}

export const getTokenRequests = async (sessionId: string, tokenId: string): Promise<Request[]> => {
  const redis = getRedisClient()
  const requestIds = await redis.smembers(KEYS.tokenRequests(sessionId, tokenId))

  if (!requestIds.length) {
    return []
  }

  const requests: Request[] = []

  for (const requestIdStr of requestIds) {
    const request = await getRequest(sessionId, tokenId, parseInt(requestIdStr))
    if (request) {
      requests.push(request)
    }
  }

  requests.sort((a, b) => b.id - a.id)

  return requests
}

export const deleteRequest = async (sessionId: string, tokenId: string, requestId: number): Promise<void> => {
  const redis = getRedisClient()
  await Promise.all([
    redis.del(KEYS.request(sessionId, tokenId, requestId)),
    redis.del(KEYS.requestBody(sessionId, tokenId, requestId)),
    redis.srem(KEYS.tokenRequests(sessionId, tokenId), String(requestId)),
  ])
}

export const deleteAllRequests = async (sessionId: string, tokenId: string): Promise<number> => {
  const redis = getRedisClient()
  const requestIds = await redis.smembers(KEYS.tokenRequests(sessionId, tokenId))

  const delRequests = []

  for (const requestId of requestIds) {
    delRequests.push(deleteRequest(sessionId, tokenId, parseInt(requestId)))
  }

  await Promise.all(delRequests)

  return delRequests.length
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

export const getSessionIdForToken = async (tokenId: string): Promise<string | null> => await getRedisClient().get(KEYS.tokenLookup(tokenId))
