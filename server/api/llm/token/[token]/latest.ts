import { defineEventHandler, createError, getQuery, type H3Event, type EventHandlerRequest } from 'h3'
import { useDatabase } from '~~/server/lib/db'
import { LLM_SESSION_ID } from '~~/server/lib/session'
import { isUUID } from '~~/server/lib/utils'
import type { Request } from '~~/shared/types'

/**
 * LLM-friendly request data format
 */
interface LLMRequest {
  id: string
  method: string
  url: string
  headers: Record<string, string>
  contentType: string
  contentLength: number
  isBinary: boolean
  body: string | null
  clientIp: string
  remoteIp: string
  createdAt: string
}

/**
 * Convert Request to LLM-friendly format with body content
 */
const formatRequestForLLM = async (request: Request, db: ReturnType<typeof useDatabase>): Promise<LLMRequest> => {
  let parsedHeaders: Record<string, string> = {}
  try {
    parsedHeaders = JSON.parse(request.headers)
  } catch {
    parsedHeaders = {}
  }

  let bodyContent: string | null = null
  if (request.bodyPath && request.contentLength > 0) {
    if (request.isBinary) {
      bodyContent = '[Binary data not included]'
    } else {
      const bodyBuffer = await db.requests.getBody(request.sessionId, request.tokenId, request.id)
      if (bodyBuffer) {
        try {
          bodyContent = new TextDecoder('utf-8').decode(bodyBuffer)
        } catch {
          bodyContent = '[Unable to decode body as text]'
        }
      }
    }
  }

  return {
    id: request.id,
    method: request.method,
    url: request.url,
    headers: parsedHeaders,
    contentType: request.contentType,
    contentLength: request.contentLength,
    isBinary: request.isBinary,
    body: bodyContent,
    clientIp: request.clientIp,
    remoteIp: request.remoteIp,
    createdAt: request.createdAt.toISOString(),
  }
}

/**
 * Get Latest Request for Token
 * 
 * GET /api/llm/token/:token/latest - Get the most recent request
 */
export default defineEventHandler(async (event: H3Event<EventHandlerRequest>) => {
  const method = event.node.req.method?.toUpperCase() || 'GET'

  if ('GET' !== method) {
    throw createError({ statusCode: 405, message: 'Method not allowed' })
  }

  type EventContextParams = { params?: Record<string, string> }
  const ctx = (event.context as unknown as EventContextParams) || {}
  const params = ctx.params || {}
  const tokenParam = params.token

  if (!tokenParam) {
    throw createError({ statusCode: 400, message: 'Token parameter is required' })
  }

  const db = useDatabase()
  const query = getQuery(event)
  const secret = query.secret as string | undefined

  // Support both UUID (full token ID) and friendlyId (short 8-char)
  let token
  if (isUUID(tokenParam)) {
    token = await db.tokens.get(LLM_SESSION_ID, tokenParam)
  } else {
    token = await db.tokens.getByFriendlyId(tokenParam)
    
    if (token) {
      // If token is in LLM session, allow access without secret
      if (token.sessionId === LLM_SESSION_ID) {
        // LLM token - no secret needed
      } else {
        // User token - require secret parameter for read-only access
        if (!secret || secret !== token.id) {
          throw createError({ 
            statusCode: 401, 
            message: 'Authentication required: Invalid secret parameter' 
          })
        }
      }
    }
  }

  if (!token) {
    throw createError({ statusCode: 404, message: 'Token not found' })
  }

  // Fetch all requests for this token (they're already ordered by createdAt DESC)
  const requests = await db.requests.list(token.sessionId, token.id)

  if (0 === requests.length) {
    throw createError({ statusCode: 404, message: 'No requests found for this token' })
  }

  // Get the first one (most recent)
  const latestRequest = requests[0]
  const formatted = await formatRequestForLLM(latestRequest, db)

  return formatted
})
