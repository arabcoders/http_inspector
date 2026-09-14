import { createError, defineEventHandler, type H3Event, type EventHandlerRequest } from 'h3'
import { resolveLLMToken } from '~~/server/lib/llm-api'

export default defineEventHandler(async (event: H3Event<EventHandlerRequest>) => {
  if ((event.node.req.method?.toUpperCase() || 'GET') !== 'GET') {
    throw createError({ statusCode: 405, message: 'Method not allowed' })
  }
  type EventContextParams = { params?: Record<string, string> }
  const requestId = (event.context as EventContextParams)?.params?.request
  if (!requestId) {
    throw createError({ statusCode: 400, message: 'Request parameter is required' })
  }
  const { db, token } = await resolveLLMToken(event)
  const request = await db.requests.get(token.sessionId, token.id, requestId)
  if (!request) {
    throw createError({ statusCode: 404, message: 'Request not found' })
  }
  const stored = await db.requests.getBody(token.sessionId, token.id, request.id)
  const body = stored ? Buffer.from(stored) : Buffer.alloc(0)
  return request.isBinary
    ? { contentType: request.contentType, isBinary: true, hex: body.toString('hex') }
    : { contentType: request.contentType, isBinary: false, text: body.toString('utf8') }
})
