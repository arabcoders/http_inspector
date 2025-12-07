import { defineEventHandler, getQuery, createError, type H3Event, type EventHandlerRequest } from 'h3'
import { useDatabase } from '~~/server/lib/db'
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
 * API endpoint for automation/LLM access to token requests
 * 
 * URL: /api/view/{friendlyId}?secret={tokenUUID}
 * 
 * - friendlyId: The 8-character short ID of the token
 * - secret: Must be the full token UUID (token.id) for authentication
 * 
 * Returns LLM-friendly JSON with all requests and their bodies
 */
export default defineEventHandler(async (event: H3Event<EventHandlerRequest>) => {
  const method = event.node.req.method?.toUpperCase() || 'GET'
  
  if ('GET' !== method) {
    throw createError({ statusCode: 405, message: 'Method not allowed' })
  }

  type EventContextParams = { params?: Record<string, string> }
  const ctx = (event.context as unknown as EventContextParams) || {}
  const params = ctx.params || {}
  const shortId = params.shortId

  if (!shortId) {
    throw createError({ statusCode: 400, message: 'Short ID is required' })
  }

  const query = getQuery(event)
  const secret = query.secret as string | undefined

  if (!secret) {
    throw createError({ statusCode: 401, message: 'Secret parameter is required' })
  }

  // Secret must be a valid UUID
  if (!isUUID(secret)) {
    throw createError({ statusCode: 401, message: 'Invalid secret format' })
  }

  const db = useDatabase()
  
  // Only accept friendlyId (short ID) in the URL path
  const token = await db.tokens.getByFriendlyId(shortId)
  if (!token) {
    throw createError({ statusCode: 404, message: 'Token not found' })
  }

  // Verify that the secret matches the token ID
  if (token.id !== secret) {
    throw createError({ statusCode: 403, message: 'Invalid secret' })
  }

  // Fetch all requests for this token
  const requests = await db.requests.list(token.sessionId, token.id)

  // Format requests for LLM consumption
  const formattedRequests: LLMRequest[] = []
  for (const request of requests) {
    const formatted = await formatRequestForLLM(request, db)
    formattedRequests.push(formatted)
  }

  // Build payload URL for webhook ingestion
  // Try to get from request headers, fallback to config or localhost
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
})
