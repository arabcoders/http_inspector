import { createError, getQuery, type H3Event, type EventHandlerRequest } from 'h3'
import { useDatabase } from './db'
import { LLM_SESSION_ID } from './session'
import { isUUID } from './utils'
import type { Request, Token } from '~~/shared/types'

export interface LLMRequestSummary {
  id: string
  method: string
  url: string
  contentType: string
  contentLength: number
  isBinary: boolean
  clientIp: string
  remoteIp: string
  createdAt: string
}

export interface LLMRequest extends LLMRequestSummary {
  headers: Record<string, string>
  body: string | null
}

export const resolveLLMToken = async (event: H3Event<EventHandlerRequest>): Promise<{
  db: ReturnType<typeof useDatabase>
  token: Token
}> => {
  type EventContextParams = { params?: Record<string, string> }
  const tokenParam = (event.context as EventContextParams)?.params?.token
  if (!tokenParam) {
    throw createError({ statusCode: 400, message: 'Token parameter is required' })
  }

  const db = useDatabase()
  let token: Token | null = null
  if (isUUID(tokenParam)) {
    const sessionId = await db.tokens.getSessionId(tokenParam)
    if (sessionId) token = await db.tokens.get(sessionId, tokenParam)
  } else {
    token = await db.tokens.getByFriendlyId(tokenParam)
  }

  if (!token) {
    throw createError({ statusCode: 404, message: 'Token not found' })
  }
  if (token.sessionId !== LLM_SESSION_ID) {
    const secret = getQuery(event).secret
    if (secret !== token.id) {
      throw createError({ statusCode: 401, message: 'Authentication required: Invalid secret parameter' })
    }
    if ((event.node.req.method?.toUpperCase() || 'GET') !== 'GET') {
      throw createError({ statusCode: 403, message: 'Only GET method is allowed for user tokens' })
    }
  }
  return { db, token }
}

export const formatRequestSummary = (request: Request): LLMRequestSummary => ({
  id: request.id,
  method: request.method,
  url: request.url,
  contentType: request.contentType,
  contentLength: request.contentLength,
  isBinary: request.isBinary,
  clientIp: request.clientIp,
  remoteIp: request.remoteIp,
  createdAt: request.createdAt.toISOString(),
})

export const formatRequest = async (
  request: Request,
  db: ReturnType<typeof useDatabase>,
): Promise<LLMRequest> => {
  let headers: Record<string, string>
  try {
    headers = JSON.parse(request.headers)
  } catch {
    headers = {}
  }

  let body: string | null = null
  if (request.bodyPath && request.contentLength > 0) {
    if (request.isBinary) {
      body = '[Binary data not included]'
    } else {
      const stored = await db.requests.getBody(request.sessionId, request.tokenId, request.id)
      if (stored) body = new TextDecoder('utf-8').decode(stored)
    }
  }
  return { ...formatRequestSummary(request), headers, body }
}
