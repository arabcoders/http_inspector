import { defineEventHandler, readBody, createError, getQuery, type H3Event, type EventHandlerRequest } from 'h3'
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
 * LLM-friendly API response
 */
interface LLMResponse {
  token: {
    id: string
    friendlyId: string | null
    createdAt: string
    payloadUrl: string
  }
  requests: LLMRequest[]
  total: number
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
 * LLM Token Operations
 * 
 * GET /api/llm/token/:token - Get token details and all requests
 * PATCH /api/llm/token/:token - Update token response settings
 * DELETE /api/llm/token/:token - Delete token and all requests
 */
export default defineEventHandler(async (event: H3Event<EventHandlerRequest>) => {
  const method = event.node.req.method?.toUpperCase() || 'GET'

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
        // User token with valid secret - only allow GET method
        if (method !== 'GET') {
          throw createError({ 
            statusCode: 403, 
            message: 'Only GET method is allowed for user tokens' 
          })
        }
      }
    }
  }

  if (!token) {
    throw createError({ statusCode: 404, message: 'Token not found' })
  }

  if ('PATCH' === method) {
    const body = (await readBody(event).catch(() => ({}))) as unknown
    const payload = body as Record<string, unknown>
    const enabled = Boolean(payload.responseEnabled)
    const status = Number(payload.responseStatus ?? 200)
    const headers = (payload.responseHeaders as unknown) as string | null
    const responseBody = (payload.responseBody as unknown) as string | null

    await db.tokens.update(LLM_SESSION_ID, token.id, {
      responseEnabled: enabled,
      responseStatus: status,
      responseHeaders: headers,
      responseBody,
    })

    return { ok: true }
  }

  if ('DELETE' === method) {
    await db.tokens._delete(LLM_SESSION_ID, token.id)
    return { ok: true }
  }

  if ('GET' === method) {
    // Fetch all requests for this token
    const requests = await db.requests.list(token.sessionId, token.id)

    // Format requests for LLM consumption
    const formattedRequests: LLMRequest[] = []
    for (const request of requests) {
      const formatted = await formatRequestForLLM(request, db)
      formattedRequests.push(formatted)
    }

    // Build payload URL
    const host = event.node.req.headers.host || 'localhost:3000'
    const protocol = event.node.req.headers['x-forwarded-proto'] || 'http'
    const baseUrl = `${protocol}://${host}`
    const payloadUrl = `${baseUrl}/api/payload/${token.friendlyId || token.id}`

    const response: LLMResponse = {
      token: {
        id: token.id,
        friendlyId: token.friendlyId,
        createdAt: token.createdAt.toISOString(),
        payloadUrl,
      },
      requests: formattedRequests,
      total: formattedRequests.length,
    }

    return response
  }

  throw createError({ statusCode: 405, message: 'Method not allowed' })
})
